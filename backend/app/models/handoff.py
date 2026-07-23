"""交接信：切换桌宠时，旧桌宠留给新桌宠的近况概要。

产品口径（文档 §4.5）：只概括计划/趋势，不复述敏感细节或已删除内容（隐私红线）。
生成时机 = 切换桌宠（PUT /pets/active）。Pets 系统落地后调用 HandoffStore.create。

桌宠引用暂用裸 Integer + 名称快照（与 memory 的 user_id 一样先不设 FK；
Pets 表落地后可加外键）。名称做快照，交接信本就是"当时"的留言。
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Handoff(Base):
    __tablename__ = "handoffs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    from_pet_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    to_pet_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    from_pet_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    to_pet_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    summary: Mapped[str] = mapped_column(Text, nullable=False)  # 交接信正文

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    def __repr__(self) -> str:
        return f"<Handoff id={self.id} user={self.user_id} {self.from_pet_name}->{self.to_pet_name}>"
