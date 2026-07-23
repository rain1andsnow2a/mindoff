"""TreasureStore：长久珍藏的读写入口（api-design §8.3）。

珍藏 = 来源引用 + 内容快照。来源（记忆/小结/灵感）之后变化不影响珍藏。
"""
from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.treasure import Treasure

SOURCE_TYPES = {"summary", "idea", "memory", "ephemeral"}


class TreasureStore:
    def __init__(self, db: Session):
        self._db = db

    def create(
        self,
        *,
        user_id: int,
        source_type: str,
        title: str,
        content: str,
        source_id: int | None = None,
    ) -> Treasure:
        if source_type not in SOURCE_TYPES:
            raise ValueError(f"未知珍藏来源: {source_type}")
        t = Treasure(
            user_id=user_id,
            source_type=source_type,
            source_id=source_id,
            title=title,
            content=content,
        )
        self._db.add(t)
        self._db.commit()
        self._db.refresh(t)
        return t

    def get(self, user_id: int, treasure_id: int) -> Treasure | None:
        return self._db.scalar(
            select(Treasure).where(
                Treasure.id == treasure_id, Treasure.user_id == user_id
            )
        )

    def list_for_user(
        self, user_id: int, *, limit: int = 50, cursor: int | None = None
    ) -> Sequence[Treasure]:
        stmt = select(Treasure).where(Treasure.user_id == user_id)
        if cursor is not None:
            stmt = stmt.where(Treasure.id < cursor)
        stmt = stmt.order_by(Treasure.id.desc()).limit(limit)
        return self._db.scalars(stmt).all()

    def count_for_user(self, user_id: int) -> int:
        stmt = select(Treasure).where(Treasure.user_id == user_id)
        return len(self._db.scalars(stmt).all())

    def delete(self, treasure: Treasure) -> None:
        self._db.delete(treasure)
        self._db.commit()
