"""信号融合引擎。

职责：
1. ingest —— 候选信号去重（dedupe_key）、冷却过滤后入库（status=pending）
2. process —— 归一化评分 → 安全约束 → 取最高分进 AI 决策 → 写投递事件

评分公式：
    最终得分 = 基础分 × 类型权重 × 新鲜度衰减

安全约束：
- 每日触达硬上限（UserPreference.max_daily_triggers，默认 6）
- 安静时段：只有用户自己设的定时窗口能突破，其它信号一律顺延/过期
- 深夜保护：本地 00:00–06:00 仅 score > 0.8 的信号可触发
- 分信号类型开关 + 全局静音
- 同一用户每轮最多触发一次，其余信号标记 processed（已被最高分代表）
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.preference import UserPreference
from app.models.signal import DecisionLog, DeliveryEvent, SignalEvent
from app.services.signals import decision as decision_gateway
from app.services.signals.context import build_decision_context, now_local
from app.services.signals.date_context import get_date_context
from app.services.signals.detectors import (
    SIGNAL_DRIVING,
    SIGNAL_HOLIDAY,
    SIGNAL_LOCATION_CHANGE,
    SIGNAL_SCHEDULED,
    SIGNAL_USAGE_ANOMALY,
    SIGNAL_WEATHER,
    DetectedSignal,
    dedupe_key_exists,
    is_in_cooldown,
    is_quiet_time,
)

logger = logging.getLogger(__name__)

# 类型权重：安全/用户自设 > 环境 > 轻度关怀
#
# 注意与 AI_SCORE_THRESHOLD 的配合：基础分 × 权重 必须 ≥ 0.4 才可能进决策。
# weather 权重定 0.8，是为了让 35℃ 高温（0.55）、0℃ 以下（0.5）、大风/中度霾（0.5）
# 这类"值得提一句"的天气能过线（0.5×0.8=0.40），而中雨/雾（0.45×0.8=0.36）继续被过滤——
# 不值得为一场中雨打扰用户。改这两个数前先算一遍乘积。
TYPE_WEIGHTS: dict[str, float] = {
    SIGNAL_HOLIDAY: 1.0,
    SIGNAL_DRIVING: 0.9,
    SIGNAL_WEATHER: 0.8,
    SIGNAL_LOCATION_CHANGE: 0.6,
    SIGNAL_USAGE_ANOMALY: 0.5,
    SIGNAL_SCHEDULED: 0.8,
}

AI_SCORE_THRESHOLD = 0.4          # 综合得分达到该值才进入 AI 决策
FRESH_FULL_MINUTES = 5            # 5 分钟内满分
FRESH_ZERO_MINUTES = 30           # 之后 30 分钟线性衰减到 0
NIGHT_PROTECT_MIN_SCORE = 0.8     # 00:00-06:00 仅极端信号可触发
PENDING_TTL_MINUTES = 45          # 超过该时长的 pending 信号标记过期

# 允许突破安静时段的信号（用户自己设的时间，理应尊重）
QUIET_BYPASS_TYPES = {SIGNAL_SCHEDULED}

SCENARIO_LABELS: dict[str, str] = {
    "morning_checkin": "早安问候",
    "afternoon_checkin": "午后问候",
    "evening_checkin": "晚间问候",
    "holiday_greeting": "节日祝福",
    "holiday_eve": "假期前夜",
    "driving_companion": "驾车陪伴",
    "weather_care": "天气关心",
    "city_changed": "旅途问候",
    "usage_care": "屏幕关心",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# ─── 入队 ────────────────────────────────────────────────────────────────────
def ingest(db: Session, *, user_id: int, detected: list[DetectedSignal]) -> list[SignalEvent]:
    """候选信号去重 + 冷却过滤后入库。score=0 的基线信号也入库但不会被触发。"""
    persisted: list[SignalEvent] = []
    for signal in detected:
        if signal.dedupe_key and dedupe_key_exists(db, user_id=user_id, dedupe_key=signal.dedupe_key):
            logger.debug("[signals] 去重跳过 user=%s key=%s", user_id, signal.dedupe_key)
            continue
        if signal.score > 0 and is_in_cooldown(
            db,
            user_id=user_id,
            signal_type=signal.signal_type,
            cooldown_minutes=signal.cooldown_minutes,
        ):
            logger.debug(
                "[signals] 冷却中跳过 user=%s type=%s score=%.2f",
                user_id, signal.signal_type, signal.score,
            )
            continue

        row = SignalEvent(
            user_id=user_id,
            signal_type=signal.signal_type,
            score=signal.score,
            priority=signal.priority,
            evidence={**(signal.evidence or {}), "scenario": signal.scenario},
            cooldown_minutes=signal.cooldown_minutes,
            dedupe_key=signal.dedupe_key,
            # score=0 的基线信号（如首次记录城市）直接落 processed，不进决策
            status="pending" if signal.score > 0 else "processed",
            occurred_at=signal.occurred_at,
            processed_at=None if signal.score > 0 else _utcnow(),
        )
        db.add(row)
        persisted.append(row)

    if persisted:
        db.commit()
        for row in persisted:
            db.refresh(row)
    return persisted


# ─── 评分 ────────────────────────────────────────────────────────────────────
def final_score(event: SignalEvent, *, now: datetime | None = None) -> float:
    """最终得分 = 基础分 × 类型权重 × 新鲜度衰减。"""
    now = now or _utcnow()
    base = float(event.score or 0.0)
    weight = TYPE_WEIGHTS.get(event.signal_type, 0.5)

    age = max(0.0, (now - _as_utc(event.occurred_at)).total_seconds() / 60.0)
    if age <= FRESH_FULL_MINUTES:
        freshness = 1.0
    elif age >= FRESH_FULL_MINUTES + FRESH_ZERO_MINUTES:
        freshness = 0.0
    else:
        freshness = 1.0 - (age - FRESH_FULL_MINUTES) / FRESH_ZERO_MINUTES

    return base * weight * freshness


def _signal_enabled(signal_type: str, pref: UserPreference) -> bool:
    if signal_type == SIGNAL_SCHEDULED:
        return bool(pref.scheduled_checkin_enabled)
    if signal_type == SIGNAL_HOLIDAY:
        return bool(pref.holiday_greeting_enabled)
    if signal_type == SIGNAL_DRIVING:
        return bool(pref.driving_alert_enabled and pref.motion_detection_enabled)
    if signal_type == SIGNAL_WEATHER:
        return bool(pref.weather_alert_enabled)
    if signal_type == SIGNAL_USAGE_ANOMALY:
        return bool(pref.usage_anomaly_enabled)
    return True


def triggers_today(db: Session, *, user_id: int, local_dt: datetime) -> int:
    """今天（本地日）已产生的主动投递条数，用于每日上限判断。"""
    start_local = local_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = start_local.astimezone(timezone.utc)
    count = db.scalar(
        select(func.count(DeliveryEvent.id)).where(
            DeliveryEvent.user_id == user_id,
            DeliveryEvent.created_at >= start_utc,
        )
    )
    return int(count or 0)


def _bulk_status(db: Session, ids: list[int], status: str, now: datetime) -> None:
    if not ids:
        return
    db.execute(
        update(SignalEvent)
        .where(SignalEvent.id.in_(ids))
        .values(status=status, processed_at=now)
    )


# ─── 投递 ────────────────────────────────────────────────────────────────────
def _deliver(
    db: Session,
    *,
    user_id: int,
    event: SignalEvent,
    scenario: str,
    ai: dict[str, Any],
    decision_log_id: int,
) -> DeliveryEvent:
    """写投递事件；delivery_mode=letter 时额外落一封信箱来信。"""
    mode = ai["delivery_mode"]
    message = ai["message"]
    label = SCENARIO_LABELS.get(scenario, "主动陪伴")
    title = ai.get("title") or label

    letter_id: int | None = None
    if mode == "letter":
        try:
            from app.services.mailbox.letter_store import LetterStore
            from app.services.pet.pet_store import PetStore

            pet = PetStore(db).get_active(user_id)
            letter = LetterStore(db).create(
                user_id=user_id,
                type="proactive",
                title=title,
                body=message,
                pet_id=pet.id if pet is not None else None,
            )
            letter_id = letter.id
        except Exception as e:  # noqa: BLE001  写信失败降级为气泡，不丢消息
            logger.warning("[signals] 信箱来信写入失败 user=%s err=%s", user_id, e)
            mode = "bubble"

    delivery = DeliveryEvent(
        user_id=user_id,
        decision_log_id=decision_log_id,
        signal_event_id=event.id,
        letter_id=letter_id,
        channel=mode,
        status="pending",
        title=title,
        body=message,
        payload={
            "scenario": scenario,
            "signal_type": event.signal_type,
            "signal_score": round(float(event.score or 0.0), 3),
            "priority": event.priority,
            "delivery_mode": mode,
            "label": label,
            # voice 模式下客户端可拿 speak_text 调 TTS
            "speak_text": message if mode == "voice" else None,
            # 驾车场景：不要弹交互 UI，只播语音
            "voice_only": event.signal_type == SIGNAL_DRIVING,
            "evidence": event.evidence or {},
        },
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    return delivery


# ─── 处理管线 ────────────────────────────────────────────────────────────────
def process_pending(
    db: Session,
    *,
    user_id: int,
    now_utc: datetime | None = None,
    local_dt: datetime | None = None,
) -> dict[str, Any]:
    """处理某个用户的 pending 信号，最多产生一条投递。

    返回 {signals, allowed, suppressed, expired, delivery_id, scenario, reason}
    """
    now = now_utc or _utcnow()
    local = local_dt or now_local()
    summary: dict[str, Any] = {
        "user_id": user_id, "signals": 0, "allowed": 0,
        "suppressed": 0, "expired": 0, "delivery_id": None,
        "scenario": None, "reason": None,
    }

    settings = get_settings()
    pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
        db.commit()
        db.refresh(pref)

    events = list(
        db.scalars(
            select(SignalEvent)
            .where(SignalEvent.user_id == user_id, SignalEvent.status == "pending")
            .order_by(SignalEvent.created_at.asc())
            .limit(200)
        ).all()
    )
    summary["signals"] = len(events)
    if not events:
        summary["reason"] = "没有待处理信号"
        return summary

    # 全局开关 / 用户总开关 / 静音：全部过期
    if not settings.proactive_enabled or not pref.proactive_enabled or pref.is_muted:
        _bulk_status(db, [e.id for e in events], "expired", now)
        db.commit()
        summary["expired"] = len(events)
        summary["reason"] = "主动陪伴已关闭或处于静音"
        return summary

    # 每日上限
    used = triggers_today(db, user_id=user_id, local_dt=local)
    if used >= max(1, int(pref.max_daily_triggers or 6)):
        _bulk_status(db, [e.id for e in events], "expired", now)
        db.commit()
        summary["expired"] = len(events)
        summary["reason"] = f"已达每日上限 {pref.max_daily_triggers} 次"
        return summary

    quiet = is_quiet_time(
        local, quiet_start=pref.quiet_hours_start, quiet_end=pref.quiet_hours_end
    )

    expired_ids: list[int] = []
    scored: list[tuple[float, SignalEvent]] = []
    skipped_quiet = 0
    skipped_disabled = 0
    for event in events:
        age = (now - _as_utc(event.occurred_at)).total_seconds() / 60.0
        if age > PENDING_TTL_MINUTES:
            expired_ids.append(event.id)
            continue
        if not _signal_enabled(event.signal_type, pref):
            expired_ids.append(event.id)
            skipped_disabled += 1
            continue
        if quiet and event.signal_type not in QUIET_BYPASS_TYPES:
            expired_ids.append(event.id)
            skipped_quiet += 1
            continue
        score = final_score(event, now=now)
        if score < AI_SCORE_THRESHOLD:
            if age > FRESH_FULL_MINUTES + FRESH_ZERO_MINUTES:
                expired_ids.append(event.id)
            continue
        scored.append((score, event))

    summary["expired"] = len(expired_ids)
    if not scored:
        _bulk_status(db, expired_ids, "expired", now)
        db.commit()
        if skipped_quiet:
            summary["reason"] = "安静时段：非定时类信号不打扰"
        elif skipped_disabled:
            summary["reason"] = "该类信号已被用户关闭"
        else:
            summary["reason"] = summary["reason"] or "无信号达到决策阈值"
        return summary

    scored.sort(key=lambda item: (item[0], item[1].priority), reverse=True)
    top_score, top = scored[0]

    # 深夜保护
    if 0 <= local.hour < 6 and float(top.score or 0.0) <= NIGHT_PROTECT_MIN_SCORE:
        _bulk_status(db, expired_ids + [e.id for _, e in scored], "expired", now)
        db.commit()
        summary["expired"] += len(scored)
        summary["reason"] = "深夜保护：非极端信号不打扰"
        return summary

    scenario = str((top.evidence or {}).get("scenario") or f"signal_{top.signal_type}")
    summary["scenario"] = scenario

    date_ctx = get_date_context(local)
    context = build_decision_context(
        db,
        user_id=user_id,
        pref=pref,
        signal={
            "type": top.signal_type,
            "scenario": scenario,
            "score": round(float(top.score or 0.0), 3),
            "final_score": round(top_score, 3),
            "priority": top.priority,
            "evidence": top.evidence or {},
        },
        local_dt=local,
        date_context=date_ctx,
    )

    ai = decision_gateway.decide(
        context.to_dict(), signal_type=top.signal_type, scenario=scenario
    )

    log = DecisionLog(
        user_id=user_id,
        scenario=scenario,
        decision=ai["decision"],
        reason=ai["reason"],
        context={**context.to_dict(), "ai_result": ai},
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    processed_ids = [e.id for _, e in scored]
    summary["reason"] = ai["reason"]

    if ai["decision"] == "allow" and ai["delivery_mode"] != "silent":
        delivery = _deliver(
            db,
            user_id=user_id,
            event=top,
            scenario=scenario,
            ai=ai,
            decision_log_id=log.id,
        )
        summary["allowed"] = 1
        summary["delivery_id"] = delivery.id
        summary["channel"] = delivery.channel
        summary["message"] = delivery.body
    else:
        summary["suppressed"] = 1

    _bulk_status(db, expired_ids, "expired", now)
    _bulk_status(db, processed_ids, "processed", now)
    db.commit()
    return summary
