"""偏好读取助手（供其他服务使用，避免直接查表）。"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.preference import UserPreference

DEFAULT_TTL_DAYS = 7


def ttl_days_for(db: Session, user_id: int) -> int:
    """该用户的三日寄存 TTL 天数（未设置用默认 7 天）。"""
    pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    if pref is None:
        return DEFAULT_TTL_DAYS
    return pref.ephemeral_ttl_days
