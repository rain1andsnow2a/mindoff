"""主动触发信号接口。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/v1/signals/motion | 批量上报速度样本（不含原始 GPS 坐标），命中驾车即时触发 |
| POST | /api/v1/signals/usage | 上报手机使用日摘要（屏幕时间/拿起次数/夜间时长） |
| POST | /api/v1/signals/tick | 手动跑一轮当前用户的检测 + 决策（调试/演示用） |
| GET | /api/v1/signals/deliveries | 轮询待投递的主动消息 |
| POST | /api/v1/signals/deliveries/{id}/ack | 标记已消费 |
| GET | /api/v1/signals/events | 最近信号事件（审计） |
| GET | /api/v1/signals/decisions | 最近决策日志（审计） |

全部接口 Depends(get_current_user) 做用户隔离，URL 不放 userId。
隐私：速度在客户端算好再上报，后端不接收轨迹；位置只保留最近一次模糊城市。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.preference import UserPreference
from app.models.signal import (
    DecisionLog,
    DeliveryEvent,
    DeviceUsageSignal,
    MotionSample,
    SignalEvent,
)
from app.models.user import User
from app.services.signals import fusion
from app.services.signals.context import now_local
from app.services.signals.detectors import driving_detector
from app.services.signals.runner import run_tick_for_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/signals", tags=["signals"])


def _get_or_create_pref(db: Session, user_id: int) -> UserPreference:
    pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


# ─── 运动 / 速度上报 ─────────────────────────────────────────────────────────
class MotionSampleIn(BaseModel):
    occurred_at: datetime
    current_speed_kmh: float = Field(ge=0, le=500)
    average_speed_kmh: float | None = Field(default=None, ge=0, le=500)
    max_speed_kmh: float | None = Field(default=None, ge=0, le=500)
    activity_type: str | None = Field(default=None, max_length=20)
    confidence: float | None = Field(default=None, ge=0, le=1)
    is_driving: bool = False
    client_event_id: str | None = Field(default=None, max_length=64)


class MotionBatchIn(BaseModel):
    samples: list[MotionSampleIn] = Field(min_length=1, max_length=200)


@router.post("/motion")
def report_motion(
    body: MotionBatchIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """批量上报速度样本。命中驾车判定（≥30km/h 持续 ≥2min）时立即走一轮决策。

    只接收速度与活动类型，不接收原始 GPS 坐标（隐私约束）。
    client_event_id 相同的样本按幂等丢弃。
    """
    pref = _get_or_create_pref(db, user.id)
    if not pref.motion_detection_enabled:
        return {"accepted": 0, "duplicates": 0, "driving_mode_active": False,
                "skipped": "motion_detection_disabled"}

    existing = set()
    ids = [s.client_event_id for s in body.samples if s.client_event_id]
    if ids:
        existing = set(
            db.scalars(
                select(MotionSample.client_event_id).where(
                    MotionSample.user_id == user.id,
                    MotionSample.client_event_id.in_(ids),
                )
            ).all()
        )

    accepted = 0
    duplicates = 0
    seen_in_batch: set[str] = set()
    for sample in body.samples:
        key = sample.client_event_id
        if key and (key in existing or key in seen_in_batch):
            duplicates += 1
            continue
        if key:
            seen_in_batch.add(key)
        db.add(
            MotionSample(
                user_id=user.id,
                client_event_id=key,
                occurred_at=sample.occurred_at,
                current_speed_kmh=sample.current_speed_kmh,
                average_speed_kmh=sample.average_speed_kmh,
                max_speed_kmh=sample.max_speed_kmh,
                activity_type=sample.activity_type,
                confidence=sample.confidence,
                is_driving=sample.is_driving,
            )
        )
        accepted += 1
    db.commit()

    driving_mode_active = False
    result: dict[str, Any] = {}
    if accepted:
        signal = driving_detector.detect(db, user_id=user.id)
        if signal is not None:
            driving_mode_active = True
            if pref.driving_alert_enabled:
                persisted = fusion.ingest(db, user_id=user.id, detected=[signal])
                if persisted:
                    result = fusion.process_pending(db, user_id=user.id)

    pref.driving_mode_active = driving_mode_active
    pref.last_motion_signal_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "accepted": accepted,
        "duplicates": duplicates,
        "driving_mode_active": driving_mode_active,
        "decision": result or None,
    }


# ─── 手机使用摘要上报 ────────────────────────────────────────────────────────
class TopAppIn(BaseModel):
    app_name: str = Field(max_length=60)
    usage_minutes: int = Field(ge=0, le=1440)


class UsageSummaryIn(BaseModel):
    stat_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    total_screen_time_minutes: int = Field(ge=0, le=1440)
    pickup_count: int = Field(default=0, ge=0, le=2000)
    night_usage_minutes: int = Field(default=0, ge=0, le=1440)
    top_apps: list[TopAppIn] = Field(default_factory=list, max_length=20)


@router.post("/usage")
def report_usage(
    body: UsageSummaryIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上报手机使用日摘要。同一本地日期重复上报直接覆盖。

    异常模式（深夜刷手机 / 屏幕时间暴增 / 拿起次数暴增）需要 7 日历史做基线，
    所以只入库、不立即触发；由 5 分钟调度器统一评估。
    """
    pref = _get_or_create_pref(db, user.id)
    stat_date = body.stat_date or now_local().date().isoformat()
    value = {
        "total_screen_time_minutes": body.total_screen_time_minutes,
        "pickup_count": body.pickup_count,
        "night_usage_minutes": body.night_usage_minutes,
        "top_apps": [a.model_dump() for a in body.top_apps],
    }

    row = db.scalar(
        select(DeviceUsageSignal).where(
            DeviceUsageSignal.user_id == user.id,
            DeviceUsageSignal.stat_date == stat_date,
        )
    )
    if row is None:
        row = DeviceUsageSignal(
            user_id=user.id, stat_date=stat_date, value=value,
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(row)
    else:
        row.value = value
        row.occurred_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "ok": True,
        "stat_date": stat_date,
        "usage_anomaly_enabled": bool(pref.usage_anomaly_enabled),
    }


# ─── 手动 tick ───────────────────────────────────────────────────────────────
@router.post("/tick")
def tick(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """立刻跑一轮当前用户的检测 + 融合决策（调试/演示）。

    与 5 分钟调度器走完全相同的代码路径，只是把范围缩到当前用户。
    """
    return run_tick_for_user(db, user_id=user.id)


# ─── 待投递消息轮询 ──────────────────────────────────────────────────────────
def _delivery_dict(row: DeliveryEvent) -> dict[str, Any]:
    return {
        "id": row.id,
        "channel": row.channel,
        "status": row.status,
        "title": row.title,
        "body": row.body,
        "payload": row.payload,
        "letter_id": row.letter_id,
        "signal_event_id": row.signal_event_id,
        "created_at": row.created_at.isoformat() if row.created_at else "",
    }


@router.get("/deliveries")
def list_deliveries(
    status: str = Query(default="pending", pattern="^(pending|delivered|all)$"),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """轮询主动消息。前端可每 30–60 秒拉一次，无消息时返回空列表。"""
    stmt = select(DeliveryEvent).where(DeliveryEvent.user_id == user.id)
    if status != "all":
        stmt = stmt.where(DeliveryEvent.status == status)
    rows = list(db.scalars(stmt.order_by(DeliveryEvent.id.desc()).limit(limit)).all())
    return {"deliveries": [_delivery_dict(r) for r in rows], "count": len(rows)}


@router.post("/deliveries/{delivery_id}/ack")
def ack_delivery(
    delivery_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """客户端消费完一条主动消息后确认，避免重复展示。"""
    row = db.scalar(
        select(DeliveryEvent).where(
            DeliveryEvent.id == delivery_id, DeliveryEvent.user_id == user.id
        )
    )
    if row is None:
        raise HTTPException(404, "投递事件不存在")
    row.status = "delivered"
    row.delivered_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "id": row.id, "status": row.status}


# ─── 审计 ────────────────────────────────────────────────────────────────────
@router.get("/events")
def list_events(
    limit: int = Query(default=30, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """最近的信号事件（含 evidence），用于排查「为什么发了/没发」。"""
    rows = list(
        db.scalars(
            select(SignalEvent)
            .where(SignalEvent.user_id == user.id)
            .order_by(SignalEvent.id.desc())
            .limit(limit)
        ).all()
    )
    return {
        "events": [
            {
                "id": r.id,
                "signal_type": r.signal_type,
                "score": r.score,
                "final_score": round(fusion.final_score(r), 3),
                "priority": r.priority,
                "status": r.status,
                "cooldown_minutes": r.cooldown_minutes,
                "evidence": r.evidence,
                "occurred_at": r.occurred_at.isoformat() if r.occurred_at else "",
            }
            for r in rows
        ],
        "count": len(rows),
    }


@router.get("/decisions")
def list_decisions(
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """最近的 AI 决策日志（allow / suppress + 理由）。"""
    rows = list(
        db.scalars(
            select(DecisionLog)
            .where(DecisionLog.user_id == user.id)
            .order_by(DecisionLog.id.desc())
            .limit(limit)
        ).all()
    )
    return {
        "decisions": [
            {
                "id": r.id,
                "scenario": r.scenario,
                "decision": r.decision,
                "reason": r.reason,
                "ai_result": (r.context or {}).get("ai_result"),
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ],
        "count": len(rows),
    }
