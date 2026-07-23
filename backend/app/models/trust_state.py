"""信任状态：桌宠与用户的关系亲密度（spec phase 5, task 20）。

value ∈ [0,1]，随互动/确认/否认演化；depth 越深的记忆默认 visibility_gate
越高（见 memory.DEPTH_DEFAULTS），信任不够就不主动提起（Property 8）。

`proactive_enabled` 是用户级「关闭主动陪伴」开关（requirements 6.5），
黑客松期先放在这里，偏好系统（api-design §10）落地后可迁走。
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TrustState(Base):
    __tablename__ = "trust_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)

    value: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    interactions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confirms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    denies: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    proactive_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<TrustState user={self.user_id} value={self.value:.2f}>"
