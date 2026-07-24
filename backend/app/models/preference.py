"""用户偏好设置（api-design §10）。

主动陪伴总开关/频率、睡前提醒时间、隐私相关开关。
`proactive_enabled` 与 TrustState.proactive_enabled 同步写（信任门控读那边），
其余字段为本表自有。
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)

    # 主动陪伴
    proactive_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    proactive_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="温和")
    # 睡前提醒（HH:MM）
    sleep_reminder_time: Mapped[str] = mapped_column(String(5), nullable=False, default="22:30")
    # 隐私：是否保留原始倾诉（关闭则 raw_ref 即焚）
    keep_raw_dump: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<UserPreference user={self.user_id} proactive={self.proactive_enabled}>"
