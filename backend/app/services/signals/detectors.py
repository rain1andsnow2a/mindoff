"""多维信号检测器。

只覆盖「非日记 / 非图片」类触发，即：

| 检测器 | 信号类型 | 维度 | 触发条件 |
|---|---|---|---|
| ScheduledWindowDetector | scheduled | 时间 | 命中用户配置的定时窗口（±6min） |
| HolidayGreetingDetector | holiday | 日期 | 法定节假日首日 09:00 / 节前最后一个工作日 18:00 |
| DrivingDetector | driving | 定位 | 速度 ≥30km/h 持续 ≥2min |
| WeatherAlertDetector | weather | 定位 | 恶劣天气 / 极端温度 |
| LocationChangeDetector | location_change | 定位 | 最近一次上报城市与上一次不同 |
| UsageAnomalyDetector | usage_anomaly | 手机使用 | 深夜刷手机 / 屏幕时间暴增 / 拿起次数暴增 |

未迁移（属于日记 / 图片链路）：情绪突变（VAD 向量跳变）、极端关键词、日记事件。

每个检测器输出 0~1 的基础分、证据数据、冷却分钟数与优先级，
统一由 fusion 归一化加权、去重、排序后送入 AI 决策网关。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.preference import UserPreference
from app.models.signal import DeviceUsageSignal, MotionSample, SignalEvent
from app.services.signals.date_context import DateContext

logger = logging.getLogger(__name__)

# ─── 信号类型 ────────────────────────────────────────────────────────────────
SIGNAL_SCHEDULED = "scheduled"
SIGNAL_HOLIDAY = "holiday"
SIGNAL_DRIVING = "driving"
SIGNAL_WEATHER = "weather"
SIGNAL_LOCATION_CHANGE = "location_change"
SIGNAL_USAGE_ANOMALY = "usage_anomaly"

ALL_SIGNAL_TYPES = (
    SIGNAL_SCHEDULED,
    SIGNAL_HOLIDAY,
    SIGNAL_DRIVING,
    SIGNAL_WEATHER,
    SIGNAL_LOCATION_CHANGE,
    SIGNAL_USAGE_ANOMALY,
)

# 各类型默认冷却（分钟）
DEFAULT_COOLDOWNS: dict[str, int] = {
    SIGNAL_SCHEDULED: 120,
    SIGNAL_HOLIDAY: 12 * 60,
    SIGNAL_DRIVING: 15,
    SIGNAL_WEATHER: 6 * 60,
    SIGNAL_LOCATION_CHANGE: 12 * 60,
    SIGNAL_USAGE_ANOMALY: 120,
}

# 定时窗口默认时刻与容差
DEFAULT_SCHEDULE_TIMES = ["08:00", "15:00", "20:00"]
SCHEDULE_TOLERANCE_MINUTES = 6

# 节假日祝福固定在当天 09:00 ±6min；节前提醒 18:00 ±6min
HOLIDAY_GREETING_MINUTE = 9 * 60
HOLIDAY_EVE_MINUTE = 18 * 60


@dataclass
class DetectedSignal:
    """检测器产出的候选信号（尚未入库）。"""

    signal_type: str
    score: float
    priority: int
    cooldown_minutes: int
    scenario: str
    evidence: dict[str, Any] = field(default_factory=dict)
    dedupe_key: str | None = None
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def clamp(self) -> "DetectedSignal":
        self.score = max(0.0, min(1.0, float(self.score)))
        return self


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def time_to_minutes(value: str, fallback: int = -1) -> int:
    """"HH:MM" → 当日分钟数；非法值返回 fallback。"""
    try:
        hour, minute = (value or "").split(":", 1)
        parsed = int(hour) * 60 + int(minute)
        if 0 <= parsed <= 23 * 60 + 59:
            return parsed
    except (ValueError, AttributeError):
        pass
    return fallback


def is_quiet_time(local_dt: datetime, *, quiet_start: str, quiet_end: str) -> bool:
    """本地时间是否处于安静时段（跨零点区间也正确）。"""
    minute = local_dt.hour * 60 + local_dt.minute
    start = time_to_minutes(quiet_start, 23 * 60)
    end = time_to_minutes(quiet_end, 7 * 60)
    if start == end:
        return True
    if start < end:
        return start <= minute < end
    return minute >= start or minute < end


def is_in_cooldown(
    db: Session, *, user_id: int, signal_type: str, cooldown_minutes: int
) -> bool:
    """同类信号在冷却期内不重复生成（以最近一条同类信号的 occurred_at 为基准）。"""
    if cooldown_minutes <= 0:
        return False
    since = _utcnow() - timedelta(minutes=cooldown_minutes)
    count = db.scalar(
        select(func.count(SignalEvent.id)).where(
            SignalEvent.user_id == user_id,
            SignalEvent.signal_type == signal_type,
            SignalEvent.occurred_at >= since,
        )
    )
    return bool(count)


def dedupe_key_exists(db: Session, *, user_id: int, dedupe_key: str) -> bool:
    """同一去重键（同一天同一场景）是否已经生成过信号。"""
    count = db.scalar(
        select(func.count(SignalEvent.id)).where(
            SignalEvent.user_id == user_id,
            SignalEvent.dedupe_key == dedupe_key,
        )
    )
    return bool(count)


# ─── 时间维度：定时窗口 ──────────────────────────────────────────────────────
class ScheduledWindowDetector:
    """定时陪伴：命中用户配置的时刻（默认 08:00 / 15:00 / 20:00）±6 分钟。

    这是唯一允许突破安静时段的信号类型——用户自己设的时间，理应尊重。
    权重最低（0.3），只作为其它信号都没命中时的兜底。
    """

    def detect(
        self,
        *,
        user_id: int,
        local_dt: datetime,
        schedule_times: list[str] | None,
        tolerance_minutes: int = SCHEDULE_TOLERANCE_MINUTES,
    ) -> DetectedSignal | None:
        times = [t for t in (schedule_times or DEFAULT_SCHEDULE_TIMES) if time_to_minutes(t) >= 0]
        if not times:
            return None

        minute_of_day = local_dt.hour * 60 + local_dt.minute
        for item in times:
            target = time_to_minutes(item)
            if abs(minute_of_day - target) > tolerance_minutes:
                continue
            scenario = self._scenario_for(item, target)
            return DetectedSignal(
                signal_type=SIGNAL_SCHEDULED,
                score=0.6,
                priority={"morning_checkin": 80, "evening_checkin": 75}.get(scenario, 70),
                cooldown_minutes=DEFAULT_COOLDOWNS[SIGNAL_SCHEDULED],
                scenario=scenario,
                evidence={
                    "target_time": item,
                    "local_time": local_dt.isoformat(),
                    "tolerance_minutes": tolerance_minutes,
                    "configured_times": times,
                },
                dedupe_key=f"{user_id}:{local_dt.date().isoformat()}:{scenario}",
            ).clamp()
        return None

    @staticmethod
    def _scenario_for(raw: str, target_minute: int) -> str:
        if target_minute < 11 * 60:
            return "morning_checkin"
        if target_minute < 18 * 60:
            return "afternoon_checkin"
        return "evening_checkin"


# ─── 日期维度：节假日 ────────────────────────────────────────────────────────
class HolidayGreetingDetector:
    """节假日祝福：假期首日 09:00 发祝福；节前最后一个工作日 18:00 发一句"要放假了"。

    只在窗口内触发一次（dedupe_key 按日期+场景）。
    """

    def detect(
        self, *, user_id: int, local_dt: datetime, date_context: DateContext
    ) -> DetectedSignal | None:
        minute_of_day = local_dt.hour * 60 + local_dt.minute
        day = local_dt.date().isoformat()

        if (
            date_context.is_public_holiday
            and date_context.is_holiday_first_day
            and abs(minute_of_day - HOLIDAY_GREETING_MINUTE) <= SCHEDULE_TOLERANCE_MINUTES
        ):
            return DetectedSignal(
                signal_type=SIGNAL_HOLIDAY,
                score=0.9,
                priority=95,
                cooldown_minutes=DEFAULT_COOLDOWNS[SIGNAL_HOLIDAY],
                scenario="holiday_greeting",
                evidence={
                    "holiday_name": date_context.holiday_name,
                    "sub_type": "first_day",
                    "date": day,
                },
                dedupe_key=f"{user_id}:{day}:holiday_greeting",
            ).clamp()

        if (
            date_context.is_holiday_eve
            and abs(minute_of_day - HOLIDAY_EVE_MINUTE) <= SCHEDULE_TOLERANCE_MINUTES
        ):
            return DetectedSignal(
                signal_type=SIGNAL_HOLIDAY,
                score=0.7,
                priority=85,
                cooldown_minutes=DEFAULT_COOLDOWNS[SIGNAL_HOLIDAY],
                scenario="holiday_eve",
                evidence={
                    "next_holiday_name": date_context.next_holiday_name,
                    "sub_type": "eve",
                    "date": day,
                },
                dedupe_key=f"{user_id}:{day}:holiday_eve",
            ).clamp()

        return None


# ─── 定位维度：驾车 ──────────────────────────────────────────────────────────
class DrivingDetector:
    """基于客户端上报的速度样本判定驾车。

    - 速度 ≥ 30 km/h 持续 ≥ 2 分钟 → 驾车
    - 最高速 ≥ 60 km/h → 高置信
    基础分乘 0.6 折扣（安全提醒但不紧急），优先级上限 50，冷却 15 分钟。
    """

    DRIVING_SPEED_KMH = 30.0
    CONFIRM_SPEED_KMH = 60.0
    SUSTAIN_MINUTES = 2
    LOOKBACK_MINUTES = 10
    DISCOUNT = 0.6
    PRIORITY_CAP = 50

    def detect(self, db: Session, *, user_id: int) -> DetectedSignal | None:
        since = _utcnow() - timedelta(minutes=self.LOOKBACK_MINUTES)
        samples = list(
            db.scalars(
                select(MotionSample)
                .where(MotionSample.user_id == user_id, MotionSample.occurred_at >= since)
                .order_by(MotionSample.occurred_at.asc())
            ).all()
        )
        if len(samples) < 2:
            return None

        fast = [s for s in samples if (s.current_speed_kmh or 0) >= self.DRIVING_SPEED_KMH]
        if len(fast) < 2:
            return None

        duration_min = self._span_minutes(fast[0].occurred_at, fast[-1].occurred_at)
        if duration_min < self.SUSTAIN_MINUTES:
            return None

        speeds = [float(s.current_speed_kmh or 0.0) for s in fast]
        max_speed = max(speeds)
        avg_speed = sum(speeds) / len(speeds)
        stability = self._stability(speeds, avg_speed)
        confidence = 0.9 if max_speed >= self.CONFIRM_SPEED_KMH else 0.6

        score = confidence * (0.6 + 0.4 * stability) * self.DISCOUNT
        return DetectedSignal(
            signal_type=SIGNAL_DRIVING,
            score=score,
            priority=min(self.PRIORITY_CAP, int(30 + score * 40)),
            cooldown_minutes=DEFAULT_COOLDOWNS[SIGNAL_DRIVING],
            scenario="driving_companion",
            evidence={
                "max_speed_kmh": round(max_speed, 1),
                "avg_speed_kmh": round(avg_speed, 1),
                "duration_minutes": round(duration_min, 1),
                "stability": round(stability, 3),
                "confidence": confidence,
                "sample_count": len(fast),
            },
        ).clamp()

    @staticmethod
    def _span_minutes(start: datetime, end: datetime) -> float:
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return (end - start).total_seconds() / 60.0

    @staticmethod
    def _stability(speeds: list[float], avg: float) -> float:
        """速度稳定性 = 1 - 变异系数，越稳定越接近 1。"""
        if avg <= 1e-6 or len(speeds) < 2:
            return 0.0
        variance = sum((s - avg) ** 2 for s in speeds) / len(speeds)
        cv = (variance ** 0.5) / avg
        return max(0.0, min(1.0, 1.0 - cv))


# ─── 定位维度：天气 ──────────────────────────────────────────────────────────
class WeatherAlertDetector:
    """恶劣天气 / 极端温度关怀。

    依赖用户已上报的模糊位置（UserPreference.last_lat/lon）与彩云天气服务。
    天气服务未配置 / 请求失败时静默跳过，不影响其它信号。
    """

    SEVERE_CONDITIONS = {
        "暴雨": 0.75, "大雨": 0.6, "暴雪": 0.75, "大雪": 0.65,
        "雷阵雨": 0.6, "冰雹": 0.8, "重度霾": 0.65, "中度霾": 0.5,
        "扬沙": 0.55, "浮尘": 0.5, "大风": 0.5, "雾": 0.45,
        "中雨": 0.45, "中雪": 0.5,
    }
    HOT_TEMPERATURE = 35
    COLD_TEMPERATURE = 0
    LOCATION_STALE_HOURS = 24

    def detect(
        self, db: Session, *, user_id: int, pref: UserPreference, local_dt: datetime
    ) -> DetectedSignal | None:
        if pref.last_lat is None or pref.last_lon is None:
            return None
        if self._location_stale(pref.location_updated_at):
            return None
        # 只在白天关心天气（出门时段），夜里下雨提醒没意义
        if not (7 <= local_dt.hour <= 21):
            return None

        try:
            from app.services.weather import weather_service

            weather = weather_service.get_current_weather(float(pref.last_lat), float(pref.last_lon))
        except Exception as e:  # noqa: BLE001  天气失败不阻塞其它信号
            logger.info("[signals] 天气获取失败 user=%s err=%s", user_id, e)
            return None

        condition = str(weather.get("condition") or "")
        temperature = weather.get("temperature")

        score = self.SEVERE_CONDITIONS.get(condition, 0.0)
        reasons: list[str] = []
        if score:
            reasons.append(f"condition_{condition}")

        if isinstance(temperature, int):
            if temperature >= self.HOT_TEMPERATURE:
                score = max(score, 0.55)
                reasons.append(f"hot_{temperature}c")
            elif temperature <= self.COLD_TEMPERATURE:
                score = max(score, 0.5)
                reasons.append(f"cold_{temperature}c")

        if score <= 0:
            return None

        return DetectedSignal(
            signal_type=SIGNAL_WEATHER,
            score=score,
            priority=min(60, int(35 + score * 30)),
            cooldown_minutes=DEFAULT_COOLDOWNS[SIGNAL_WEATHER],
            scenario="weather_care",
            evidence={
                "condition": condition,
                "temperature": temperature,
                "feels_like": weather.get("feels_like"),
                "city": pref.last_city,
                "reasons": reasons,
            },
            dedupe_key=f"{user_id}:{local_dt.date().isoformat()}:weather_care",
        ).clamp()

    def _location_stale(self, updated_at: datetime | None) -> bool:
        if updated_at is None:
            return True
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        return _utcnow() - updated_at > timedelta(hours=self.LOCATION_STALE_HOURS)


# ─── 定位维度：城市变化 ──────────────────────────────────────────────────────
class LocationChangeDetector:
    """城市变化（出差 / 旅行 / 回家）。

    上报接口把上一次城市写进 SignalEvent 证据里，这里只比对「当前城市 与
    最近一条 location_change 信号记录的城市」。不保存轨迹，只关心是否换了城市。
    """

    def detect(
        self, db: Session, *, user_id: int, pref: UserPreference, local_dt: datetime
    ) -> DetectedSignal | None:
        city = (pref.last_city or "").strip()
        if not city:
            return None

        last = db.scalar(
            select(SignalEvent)
            .where(
                SignalEvent.user_id == user_id,
                SignalEvent.signal_type == SIGNAL_LOCATION_CHANGE,
            )
            .order_by(SignalEvent.occurred_at.desc())
            .limit(1)
        )
        previous_city = ((last.evidence or {}).get("city") if last else None) or ""
        if not previous_city:
            # 第一次记录：只落基线，不打扰用户
            return DetectedSignal(
                signal_type=SIGNAL_LOCATION_CHANGE,
                score=0.0,
                priority=0,
                cooldown_minutes=0,
                scenario="location_baseline",
                evidence={"city": city, "sub_type": "baseline"},
                dedupe_key=f"{user_id}:location_baseline:{city}",
            ).clamp()

        if previous_city == city:
            return None

        return DetectedSignal(
            signal_type=SIGNAL_LOCATION_CHANGE,
            score=0.55,
            priority=55,
            cooldown_minutes=DEFAULT_COOLDOWNS[SIGNAL_LOCATION_CHANGE],
            scenario="city_changed",
            evidence={"city": city, "previous_city": previous_city, "sub_type": "changed"},
            dedupe_key=f"{user_id}:{local_dt.date().isoformat()}:city_changed:{city}",
        ).clamp()


# ─── 手机使用维度 ────────────────────────────────────────────────────────────
class UsageAnomalyDetector:
    """使用模式异常。

    - 夜间使用 > 60 分钟            +0.30
    - 屏幕时间 > 7 日均值 1.5 倍    +0.25
    - 拿起次数 > 7 日均值 2 倍      +0.20
    - 单个社交 App > 120 分钟       +0.15
    综合 < 0.3 不生成信号；冷却 120 分钟；优先级上限 65。
    """

    SCORE_THRESHOLD = 0.3
    PRIORITY_CAP = 65
    SOCIAL_APP_KEYWORDS = (
        "微信", "wechat", "qq", "微博", "weibo", "抖音", "douyin", "tiktok",
        "小红书", "xiaohongshu", "bilibili", "instagram", "facebook", "twitter",
    )

    def detect(self, db: Session, *, user_id: int) -> DetectedSignal | None:
        rows = list(
            db.scalars(
                select(DeviceUsageSignal)
                .where(DeviceUsageSignal.user_id == user_id)
                .order_by(DeviceUsageSignal.stat_date.desc())
                .limit(8)
            ).all()
        )
        if not rows:
            return None

        latest = rows[0].value or {}
        history = [r.value or {} for r in rows[1:]]

        score = 0.0
        reasons: list[str] = []

        night_minutes = self._as_int(latest.get("night_usage_minutes"))
        if night_minutes > 60:
            score += 0.3
            reasons.append(f"night_usage_{night_minutes}min")

        screen_today = self._as_int(latest.get("total_screen_time_minutes"))
        screen_history = [self._as_int(h.get("total_screen_time_minutes")) for h in history if h]
        if screen_history:
            avg_screen = sum(screen_history) / len(screen_history)
            if avg_screen > 0 and screen_today > avg_screen * 1.5:
                score += 0.25
                reasons.append(f"screen_surge_{screen_today}min_vs_avg_{int(avg_screen)}min")

        pickups_today = self._as_int(latest.get("pickup_count"))
        pickup_history = [self._as_int(h.get("pickup_count")) for h in history if h]
        if pickup_history:
            avg_pickups = sum(pickup_history) / len(pickup_history)
            if avg_pickups > 0 and pickups_today > avg_pickups * 2:
                score += 0.2
                reasons.append(f"pickup_surge_{pickups_today}_vs_avg_{int(avg_pickups)}")

        for app in latest.get("top_apps") or []:
            if not isinstance(app, dict):
                continue
            name = str(app.get("app_name") or app.get("package_name") or "").lower()
            minutes = self._as_int(app.get("usage_minutes") or app.get("minutes"))
            if minutes > 120 and any(k in name for k in self.SOCIAL_APP_KEYWORDS):
                score += 0.15
                reasons.append(f"social_app_{name}_{minutes}min")
                break

        if score < self.SCORE_THRESHOLD:
            return None

        return DetectedSignal(
            signal_type=SIGNAL_USAGE_ANOMALY,
            score=score,
            priority=min(self.PRIORITY_CAP, int(40 + score * 30)),
            cooldown_minutes=DEFAULT_COOLDOWNS[SIGNAL_USAGE_ANOMALY],
            scenario="usage_care",
            evidence={
                "reasons": reasons,
                "night_usage_minutes": night_minutes,
                "total_screen_time_minutes": screen_today,
                "pickup_count": pickups_today,
                "stat_date": rows[0].stat_date,
                "history_days": len(history),
            },
        ).clamp()

    @staticmethod
    def _as_int(value: Any) -> int:
        try:
            return int(value or 0)
        except (ValueError, TypeError):
            return 0


# 单例
scheduled_window_detector = ScheduledWindowDetector()
holiday_greeting_detector = HolidayGreetingDetector()
driving_detector = DrivingDetector()
weather_alert_detector = WeatherAlertDetector()
location_change_detector = LocationChangeDetector()
usage_anomaly_detector = UsageAnomalyDetector()


def today_local(local_dt: datetime) -> date:
    return local_dt.date()
