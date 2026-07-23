"""桌宠数据模型。见 docs/api-design.md §2。

Pet：用户拥有/定制的一只桌宠。preset_id 记录实例化来源预设（快照语义，预设后续改了
不影响已创建的桌宠）；name/personality/tone/actions 为用户可定制字段。
is_active 标记当前主桌宠，同一用户同时只有一只（由 PetStore.set_active 保证）。

与其他模块一致先不设 FK（conversation.pet_id、handoff.pet_id 都是裸 Integer 快照）。
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # 实例化来源预设（快照）；用户自由定制的字段都落在本表，不回写预设
    preset_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    personality: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    tone: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    actions: Mapped[list | None] = mapped_column(JSON, nullable=True)  # 动作组合（字符串列表）

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<Pet id={self.id} user={self.user_id} name={self.name} active={self.is_active}>"
