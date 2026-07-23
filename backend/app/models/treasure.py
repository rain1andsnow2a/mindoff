"""长久珍藏：用户主动留下的总结/灵感/重要记忆（api-design §8.3）。

来源引用（source_type + source_id）+ 内容快照——来源之后被编辑/遗忘，
珍藏的仍是"当时那一句"。
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Treasure(Base):
    __tablename__ = "treasures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # 来源：summary / idea / memory / ephemeral
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    def __repr__(self) -> str:
        return f"<Treasure id={self.id} user={self.user_id} from={self.source_type}:{self.source_id}>"
