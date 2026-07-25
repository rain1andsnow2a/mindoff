"""主动触发信号（时间/节假日/定位/驾车/天气/使用异常）端到端冒烟。

先启动服务：cd backend && uv run uvicorn app.main:app --port 8012
再运行：cd backend && set PYTHONUTF8=1 && set PYTHONPATH=. && uv run python scripts/test_signals.py

覆盖：
1. /preferences 暴露全部触发偏好字段 + 校验
2. 定时窗口检测器（命中 / 未命中 / 安静时段可突破）
3. 节假日检测器（2026 法定节假日表 + 节前最后一个工作日）
4. 驾车检测器（POST /signals/motion → 速度持续超阈值 → 信号入队 → AI 决策 → 投递）
5. 手机使用异常检测器（7 日基线 + 深夜刷手机）
6. 城市变化检测器（首次落基线不打扰，换城市才触发）
7. 融合引擎：类型权重 × 新鲜度衰减、冷却去重、每日上限、深夜保护、静音
8. /signals/deliveries 轮询 + ack、/signals/events、/signals/decisions 审计
"""
import sys
import uuid
from datetime import datetime, timedelta, timezone

import httpx

sys.path.insert(0, ".")

B = "http://127.0.0.1:8012/api/v1"
TIMEOUT = 60

# ─── 注册 ────────────────────────────────────────────────────────────────────
u = {"username": f"sig_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok = httpx.post(f"{B}/auth/register", json=u, timeout=TIMEOUT).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
uid = httpx.get(f"{B}/users/me", headers=H, timeout=TIMEOUT).json()["id"]
print(f"user={u['username']} id={uid}")

# ─── 1. 偏好字段 ─────────────────────────────────────────────────────────────
r = httpx.get(f"{B}/preferences", headers=H, timeout=TIMEOUT)
assert r.status_code == 200, r.text
pref = r.json()
assert pref["proactive_schedule_times"] == ["08:00", "15:00", "20:00"], pref
assert pref["quiet_hours_start"] == "23:00" and pref["quiet_hours_end"] == "07:00"
assert pref["max_daily_triggers"] == 6
for key in ("is_muted", "driving_mode_active"):
    assert pref[key] is False, key
for key in ("scheduled_checkin_enabled", "holiday_greeting_enabled",
            "motion_detection_enabled", "driving_alert_enabled",
            "weather_alert_enabled", "usage_anomaly_enabled"):
    assert pref[key] is True, key
print("1. preferences defaults PASS")

r = httpx.patch(f"{B}/preferences", headers=H, timeout=TIMEOUT,
                json={"proactive_schedule_times": ["07:30", "21:00"],
                      "quiet_hours_start": "00:30", "max_daily_triggers": 3})
assert r.status_code == 200, r.text
assert r.json()["proactive_schedule_times"] == ["07:30", "21:00"]
assert r.json()["max_daily_triggers"] == 3

for bad in ({"proactive_schedule_times": ["7:30"]},
            {"proactive_schedule_times": []},
            {"quiet_hours_end": "24:00"},
            {"max_daily_triggers": 99}):
    r = httpx.patch(f"{B}/preferences", headers=H, json=bad, timeout=TIMEOUT)
    assert r.status_code == 422, f"{bad} 应 422，实际 {r.status_code}"
print("2. preferences patch + validation PASS")

# 还原成默认窗口，后面直接用
httpx.patch(f"{B}/preferences", headers=H, timeout=TIMEOUT,
            json={"proactive_schedule_times": ["08:00", "15:00", "20:00"],
                  "quiet_hours_start": "23:00", "max_daily_triggers": 6})

# ─── 服务层直连（检测器单元验证）────────────────────────────────────────────
from app.db import SessionLocal  # noqa: E402
from app.models.preference import UserPreference  # noqa: E402
from app.models.signal import (  # noqa: E402
    DeliveryEvent,
    DeviceUsageSignal,
    MotionSample,
    SignalEvent,
)
from app.services.signals import fusion  # noqa: E402
from app.services.signals.date_context import get_date_context  # noqa: E402
from app.services.signals.detectors import (  # noqa: E402
    SIGNAL_DRIVING,
    SIGNAL_SCHEDULED,
    driving_detector,
    holiday_greeting_detector,
    is_quiet_time,
    location_change_detector,
    scheduled_window_detector,
    usage_anomaly_detector,
)
from sqlalchemy import select  # noqa: E402

CST = timezone(timedelta(hours=8))
db = SessionLocal()
pref_row = db.scalar(select(UserPreference).where(UserPreference.user_id == uid))
assert pref_row is not None

# ─── 3. 定时窗口检测器 ───────────────────────────────────────────────────────
hit = scheduled_window_detector.detect(
    user_id=uid,
    local_dt=datetime(2026, 7, 25, 8, 3, tzinfo=CST),
    schedule_times=["08:00", "15:00", "20:00"],
)
assert hit is not None and hit.scenario == "morning_checkin", hit
assert hit.signal_type == SIGNAL_SCHEDULED
assert hit.dedupe_key == f"{uid}:2026-07-25:morning_checkin"

edge = scheduled_window_detector.detect(
    user_id=uid, local_dt=datetime(2026, 7, 25, 8, 6, tzinfo=CST),
    schedule_times=["08:00"],
)
assert edge is not None, "±6 分钟边界应命中"
miss = scheduled_window_detector.detect(
    user_id=uid, local_dt=datetime(2026, 7, 25, 8, 7, tzinfo=CST),
    schedule_times=["08:00"],
)
assert miss is None, "超出容差不应命中"

afternoon = scheduled_window_detector.detect(
    user_id=uid, local_dt=datetime(2026, 7, 25, 15, 0, tzinfo=CST),
    schedule_times=["15:00"],
)
assert afternoon.scenario == "afternoon_checkin"
evening = scheduled_window_detector.detect(
    user_id=uid, local_dt=datetime(2026, 7, 25, 21, 0, tzinfo=CST),
    schedule_times=["21:00"],
)
assert evening.scenario == "evening_checkin"
print("3. scheduled window detector PASS")

# 安静时段判定（跨零点）
assert is_quiet_time(datetime(2026, 7, 25, 23, 30, tzinfo=CST),
                     quiet_start="23:00", quiet_end="07:00")
assert is_quiet_time(datetime(2026, 7, 25, 3, 0, tzinfo=CST),
                     quiet_start="23:00", quiet_end="07:00")
assert not is_quiet_time(datetime(2026, 7, 25, 12, 0, tzinfo=CST),
                         quiet_start="23:00", quiet_end="07:00")
print("4. quiet hours (cross-midnight) PASS")

# ─── 5. 节假日检测器 ─────────────────────────────────────────────────────────
ctx = get_date_context(datetime(2026, 10, 1, 9, 0, tzinfo=CST))
assert ctx.is_public_holiday and ctx.holiday_name == "国庆节" and ctx.is_holiday_first_day, ctx
holiday_sig = holiday_greeting_detector.detect(
    user_id=uid, local_dt=datetime(2026, 10, 1, 9, 2, tzinfo=CST), date_context=ctx
)
assert holiday_sig is not None and holiday_sig.scenario == "holiday_greeting", holiday_sig

# 假期第二天不再触发首日祝福
ctx2 = get_date_context(datetime(2026, 10, 2, 9, 0, tzinfo=CST))
assert ctx2.is_public_holiday and not ctx2.is_holiday_first_day
assert holiday_greeting_detector.detect(
    user_id=uid, local_dt=datetime(2026, 10, 2, 9, 0, tzinfo=CST), date_context=ctx2
) is None

# 9/30 是节前最后一个工作日 → 18:00 提醒
eve = get_date_context(datetime(2026, 9, 30, 18, 0, tzinfo=CST))
assert eve.is_holiday_eve and not eve.is_public_holiday, eve
eve_sig = holiday_greeting_detector.detect(
    user_id=uid, local_dt=datetime(2026, 9, 30, 18, 0, tzinfo=CST), date_context=eve
)
assert eve_sig is not None and eve_sig.scenario == "holiday_eve"

# 调休上班日：2026-10-10 是周六但要上班
makeup = get_date_context(datetime(2026, 10, 10, 10, 0, tzinfo=CST))
assert makeup.is_weekend and makeup.is_workday and makeup.date_type == "workday", makeup
# 普通周末
weekend = get_date_context(datetime(2026, 7, 25, 10, 0, tzinfo=CST))
assert weekend.is_weekend and not weekend.is_workday and weekend.date_type == "weekend"
print("5. holiday / date context (2026 官方安排 + 调休) PASS")

# ─── 6. 驾车检测器（服务层）─────────────────────────────────────────────────
now = datetime.now(timezone.utc)
for i in range(6):
    db.add(MotionSample(
        user_id=uid,
        client_event_id=f"unit-{i}",
        occurred_at=now - timedelta(minutes=5 - i * 0.8),
        current_speed_kmh=62.0 + i,
        max_speed_kmh=70.0,
        activity_type="driving",
        is_driving=True,
    ))
db.commit()
drive_sig = driving_detector.detect(db, user_id=uid)
assert drive_sig is not None, "速度持续 >30km/h 应判定驾车"
assert drive_sig.signal_type == SIGNAL_DRIVING
assert drive_sig.evidence["confidence"] == 0.9, drive_sig.evidence
assert drive_sig.priority <= 50, "驾车优先级上限 50"
assert drive_sig.score <= 0.6, "驾车基础分乘 0.6 折扣"
print(f"6. driving detector PASS (score={drive_sig.score:.3f} "
      f"priority={drive_sig.priority} evidence={drive_sig.evidence})")

# 低速不触发
db.execute(MotionSample.__table__.delete().where(MotionSample.user_id == uid))
db.commit()
for i in range(6):
    db.add(MotionSample(user_id=uid, client_event_id=f"slow-{i}",
                        occurred_at=now - timedelta(minutes=5 - i * 0.8),
                        current_speed_kmh=4.0, activity_type="walking"))
db.commit()
assert driving_detector.detect(db, user_id=uid) is None, "步行速度不应判定驾车"
print("7. driving detector negative (walking) PASS")

# ─── 8. 使用异常检测器 ───────────────────────────────────────────────────────
assert usage_anomaly_detector.detect(db, user_id=uid) is None, "无数据不应触发"
today = datetime.now(CST).date()
for i in range(1, 8):  # 7 天基线：每天 120 分钟 / 60 次
    db.add(DeviceUsageSignal(
        user_id=uid,
        stat_date=(today - timedelta(days=i)).isoformat(),
        value={"total_screen_time_minutes": 120, "pickup_count": 60,
               "night_usage_minutes": 10, "top_apps": []},
        occurred_at=now - timedelta(days=i),
    ))
db.add(DeviceUsageSignal(
    user_id=uid, stat_date=today.isoformat(),
    value={"total_screen_time_minutes": 400, "pickup_count": 200,
           "night_usage_minutes": 95,
           "top_apps": [{"app_name": "抖音", "usage_minutes": 180}]},
    occurred_at=now,
))
db.commit()
usage_sig = usage_anomaly_detector.detect(db, user_id=uid)
assert usage_sig is not None, "四项异常全中应触发"
assert abs(usage_sig.score - 0.9) < 1e-6, f"0.3+0.25+0.2+0.15=0.9，实际 {usage_sig.score}"
assert usage_sig.priority <= 65, "使用异常优先级上限 65"
assert len(usage_sig.evidence["reasons"]) == 4, usage_sig.evidence
print(f"8. usage anomaly detector PASS (score={usage_sig.score} "
      f"reasons={usage_sig.evidence['reasons']})")

# ─── 9. 城市变化检测器 ───────────────────────────────────────────────────────
pref_row.last_city = "上海"
pref_row.last_lat, pref_row.last_lon = 31.23, 121.47
pref_row.location_updated_at = now
db.commit()
base = location_change_detector.detect(db, user_id=uid, pref=pref_row, local_dt=datetime.now(CST))
assert base is not None and base.score == 0.0, "首次只落基线，不打扰"
fusion.ingest(db, user_id=uid, detected=[base])

pref_row.last_city = "杭州"
db.commit()
changed = location_change_detector.detect(db, user_id=uid, pref=pref_row, local_dt=datetime.now(CST))
assert changed is not None and changed.score > 0, "换城市应触发"
assert changed.evidence["previous_city"] == "上海" and changed.evidence["city"] == "杭州"
print("9. location change detector PASS (baseline silent → city change fires)")

# ─── 10. 融合引擎评分 ────────────────────────────────────────────────────────
fresh = SignalEvent(user_id=uid, signal_type=SIGNAL_DRIVING, score=0.6,
                    priority=50, occurred_at=now, evidence={})
stale = SignalEvent(user_id=uid, signal_type=SIGNAL_DRIVING, score=0.6,
                    priority=50, occurred_at=now - timedelta(minutes=20), evidence={})
dead = SignalEvent(user_id=uid, signal_type=SIGNAL_DRIVING, score=0.6,
                   priority=50, occurred_at=now - timedelta(minutes=40), evidence={})
sf, ss, sd = (fusion.final_score(e, now=now) for e in (fresh, stale, dead))
assert abs(sf - 0.6 * 0.9) < 1e-6, f"新鲜信号满分 期望 0.54 实际 {sf}"
assert 0 < ss < sf, f"衰减中 {ss}"
assert sd == 0.0, f"超过 35 分钟应衰减到 0，实际 {sd}"
sched = SignalEvent(user_id=uid, signal_type=SIGNAL_SCHEDULED, score=0.6,
                    priority=70, occurred_at=now, evidence={})
assert abs(fusion.final_score(sched, now=now) - 0.6 * 0.8) < 1e-6, "类型权重生效"
print(f"10. fusion scoring PASS (fresh={sf:.3f} decaying={ss:.3f} dead={sd:.3f})")

# 冷却去重
db.execute(SignalEvent.__table__.delete().where(SignalEvent.user_id == uid))
db.commit()
first = fusion.ingest(db, user_id=uid, detected=[usage_sig])
assert len(first) == 1, "首个信号应入队"
again = fusion.ingest(db, user_id=uid, detected=[usage_sig])
assert len(again) == 0, "冷却期内同类信号不重复入队"
print("11. cooldown dedupe PASS")

# 静音 → 全部过期
pref_row.is_muted = True
db.commit()
muted_result = fusion.process_pending(db, user_id=uid)
assert muted_result["allowed"] == 0 and muted_result["expired"] >= 1, muted_result
assert "静音" in muted_result["reason"] or "关闭" in muted_result["reason"]
pref_row.is_muted = False
db.commit()
print(f"12. mute gate PASS ({muted_result['reason']})")

# 每日上限
db.execute(SignalEvent.__table__.delete().where(SignalEvent.user_id == uid))
db.execute(DeliveryEvent.__table__.delete().where(DeliveryEvent.user_id == uid))
db.commit()
pref_row.max_daily_triggers = 1
db.commit()
db.add(DeliveryEvent(user_id=uid, channel="bubble", status="delivered",
                     title="占位", body="占位", created_at=now))
db.commit()
fusion.ingest(db, user_id=uid, detected=[usage_sig])
capped = fusion.process_pending(db, user_id=uid)
assert capped["allowed"] == 0 and "上限" in capped["reason"], capped
pref_row.max_daily_triggers = 6
db.commit()
print(f"13. daily cap PASS ({capped['reason']})")

# 安静时段：非定时类信号被拦截
db.execute(SignalEvent.__table__.delete().where(SignalEvent.user_id == uid))
db.execute(DeliveryEvent.__table__.delete().where(DeliveryEvent.user_id == uid))
db.commit()
fusion.ingest(db, user_id=uid, detected=[usage_sig])
quiet_result = fusion.process_pending(
    db, user_id=uid, local_dt=datetime.now(CST).replace(hour=3, minute=0)
)
assert quiet_result["allowed"] == 0, quiet_result
assert "安静时段" in quiet_result["reason"], quiet_result
print(f"14. quiet-hours gate PASS ({quiet_result['reason']})")

# 深夜保护：定时信号可突破安静时段，但 00:00-06:00 仍要求 score > 0.8
db.execute(SignalEvent.__table__.delete().where(SignalEvent.user_id == uid))
db.commit()
night_sched = scheduled_window_detector.detect(
    user_id=uid, local_dt=datetime.now(CST).replace(hour=3, minute=0),
    schedule_times=["03:00"],
)
assert night_sched is not None and night_sched.score <= 0.8
fusion.ingest(db, user_id=uid, detected=[night_sched])
night = fusion.process_pending(
    db, user_id=uid, local_dt=datetime.now(CST).replace(hour=3, minute=0)
)
assert night["allowed"] == 0, night
assert "深夜保护" in night["reason"], night
print(f"15. night protection PASS ({night['reason']})")

db.close()

# ─── 16. HTTP 端到端：上报速度 → 驾车信号 → AI 决策 → 投递 ──────────────────
samples = []
report_now = datetime.now(timezone.utc)
for i in range(8):
    samples.append({
        "occurred_at": (report_now - timedelta(minutes=6 - i * 0.7)).isoformat(),
        "current_speed_kmh": 64.0 + i,
        "max_speed_kmh": 78.0,
        "activity_type": "driving",
        "is_driving": True,
        "client_event_id": f"http-{uuid.uuid4().hex[:10]}-{i}",
    })
r = httpx.post(f"{B}/signals/motion", headers=H, json={"samples": samples}, timeout=TIMEOUT)
assert r.status_code == 200, r.text
motion = r.json()
assert motion["accepted"] == 8, motion
assert motion["driving_mode_active"] is True, motion
print(f"16. POST /signals/motion PASS ({motion})")

# 幂等：同样的 client_event_id 再报一次
r = httpx.post(f"{B}/signals/motion", headers=H, json={"samples": samples}, timeout=TIMEOUT)
assert r.json()["duplicates"] == 8 and r.json()["accepted"] == 0, r.json()
print("17. motion idempotency (client_event_id) PASS")

# driving_mode_active 回写偏好
assert httpx.get(f"{B}/preferences", headers=H, timeout=TIMEOUT).json()["driving_mode_active"] is True
print("18. driving_mode_active written back to preferences PASS")

# ─── 19. 使用摘要上报 ────────────────────────────────────────────────────────
r = httpx.post(f"{B}/signals/usage", headers=H, timeout=TIMEOUT,
               json={"total_screen_time_minutes": 420, "pickup_count": 210,
                     "night_usage_minutes": 100,
                     "top_apps": [{"app_name": "抖音", "usage_minutes": 190}]})
assert r.status_code == 200 and r.json()["ok"] is True, r.text
print(f"19. POST /signals/usage PASS ({r.json()})")

# ─── 20. 手动 tick 走完整链路 ────────────────────────────────────────────────
r = httpx.post(f"{B}/signals/tick", headers=H, timeout=180)
assert r.status_code == 200, r.text
tick = r.json()
print(f"20. POST /signals/tick → {tick}")
assert tick["allowed"] + tick["suppressed"] + tick["expired"] >= 0

# ─── 21. 审计与轮询 ──────────────────────────────────────────────────────────
r = httpx.get(f"{B}/signals/events", headers=H, timeout=TIMEOUT)
assert r.status_code == 200 and r.json()["count"] > 0, r.text
events = r.json()["events"]
types = {e["signal_type"] for e in events}
assert "driving" in types or "usage_anomaly" in types, types
print(f"21. GET /signals/events PASS ({r.json()['count']} events, types={sorted(types)})")

r = httpx.get(f"{B}/signals/decisions", headers=H, timeout=TIMEOUT)
assert r.status_code == 200, r.text
decisions = r.json()["decisions"]
print(f"22. GET /signals/decisions PASS ({len(decisions)} decisions)")
for d in decisions[:3]:
    print(f"    - {d['scenario']}: {d['decision']} / {d['reason'][:60]}")

r = httpx.get(f"{B}/signals/deliveries", headers=H, timeout=TIMEOUT)
assert r.status_code == 200, r.text
deliveries = r.json()["deliveries"]
print(f"23. GET /signals/deliveries PASS ({len(deliveries)} pending)")
for d in deliveries:
    print(f"    - [{d['channel']}] {d['title']}: {d['body'][:60]}")
    if d["channel"] == "voice":
        assert d["payload"]["speak_text"], "voice 模式必须带 speak_text"
        assert len(d["body"]) <= 40, f"驾车文案须 ≤40 字，实际 {len(d['body'])}"

if deliveries:
    did = deliveries[0]["id"]
    r = httpx.post(f"{B}/signals/deliveries/{did}/ack", headers=H, timeout=TIMEOUT)
    assert r.status_code == 200 and r.json()["status"] == "delivered", r.text
    rest = httpx.get(f"{B}/signals/deliveries", headers=H, timeout=TIMEOUT).json()["deliveries"]
    assert all(x["id"] != did for x in rest), "ack 后不应再出现在 pending"
    print("24. POST /signals/deliveries/{id}/ack PASS")
else:
    print("24. ack skipped（本轮 AI 判定 suppress，属正常行为）")

# 用户隔离
other = {"username": f"sig2_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok2 = httpx.post(f"{B}/auth/register", json=other, timeout=TIMEOUT).json()["access_token"]
H2 = {"Authorization": f"Bearer {tok2}"}
assert httpx.get(f"{B}/signals/events", headers=H2, timeout=TIMEOUT).json()["count"] == 0
if deliveries:
    r = httpx.post(f"{B}/signals/deliveries/{deliveries[0]['id']}/ack", headers=H2, timeout=TIMEOUT)
    assert r.status_code == 404, "跨用户 ack 必须 404"
print("25. user isolation PASS")

print("\n=== Proactive signals ALL PASS ===")
