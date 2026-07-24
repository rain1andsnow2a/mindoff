"""角色档案：用户生命中的人（spec phase 4, task 17）。

普通档案占位：姓名、关系、若干笔记。本次**不含冰山/深度分层**——
角色深度建模由设计队友后续立项（requirements 5.2）。
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RoleProfile(Base):
    __tablename__ = "role_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    relation: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # 结构化设定（前端角色设定页：性格概述/说话方式/冲突反应/口头禅；与 notes 并存）
    personality_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    speaking_style: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    conflict_response: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    traits: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<RoleProfile id={self.id} user={self.user_id} name={self.name!r}>"
