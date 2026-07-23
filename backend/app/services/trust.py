"""信任状态服务（spec phase 5, task 20）。

演化规则（可调的简单公式，黑客松够用）：
    value = clamp(0.05×互动 + 0.10×确认 − 0.15×否认, 0, 1)
确认比互动权重高（被认可的主动提起最增进信任），否认扣分最重。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.trust_state import TrustState

_W_INTERACTION = 0.05
_W_CONFIRM = 0.10
_W_DENY = 0.15


def get_or_create(db: Session, user_id: int) -> TrustState:
    ts = db.scalar(select(TrustState).where(TrustState.user_id == user_id))
    if ts is None:
        ts = TrustState(user_id=user_id)
        db.add(ts)
        db.commit()
        db.refresh(ts)
    return ts


def _recompute(ts: TrustState) -> None:
    v = (_W_INTERACTION * ts.interactions
         + _W_CONFIRM * ts.confirms
         - _W_DENY * ts.denies)
    ts.value = max(0.0, min(1.0, v))


def record_interaction(db: Session, user_id: int, count: int = 1) -> TrustState:
    ts = get_or_create(db, user_id)
    ts.interactions += count
    _recompute(ts)
    db.commit()
    db.refresh(ts)
    return ts


def record_confirm(db: Session, user_id: int) -> TrustState:
    """用户认可了一次主动提起/下沉假设。"""
    ts = get_or_create(db, user_id)
    ts.confirms += 1
    _recompute(ts)
    db.commit()
    db.refresh(ts)
    return ts


def record_deny(db: Session, user_id: int) -> TrustState:
    """用户否认了一次主动提起/下沉假设。"""
    ts = get_or_create(db, user_id)
    ts.denies += 1
    _recompute(ts)
    db.commit()
    db.refresh(ts)
    return ts


def set_proactive_enabled(db: Session, user_id: int, enabled: bool) -> TrustState:
    """用户级「主动陪伴」开关（requirements 6.5）。"""
    ts = get_or_create(db, user_id)
    ts.proactive_enabled = enabled
    db.commit()
    db.refresh(ts)
    return ts
