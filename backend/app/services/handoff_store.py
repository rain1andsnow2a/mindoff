"""HandoffStore：交接信读写入口，面向单个 DB session。

create() 供 Pets 系统在切换桌宠时调用；list/get 供读接口使用，均按 user 隔离。
"""
from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.handoff import Handoff


class HandoffStore:
    def __init__(self, db: Session):
        self._db = db

    def create(
        self,
        *,
        user_id: int,
        summary: str,
        from_pet_id: int | None = None,
        to_pet_id: int | None = None,
        from_pet_name: str | None = None,
        to_pet_name: str | None = None,
    ) -> Handoff:
        """创建一封交接信。Pets 系统切换桌宠时调用。"""
        h = Handoff(
            user_id=user_id,
            summary=summary,
            from_pet_id=from_pet_id,
            to_pet_id=to_pet_id,
            from_pet_name=from_pet_name,
            to_pet_name=to_pet_name,
        )
        self._db.add(h)
        self._db.commit()
        self._db.refresh(h)
        return h

    def list_for_user(
        self, user_id: int, *, limit: int = 20, cursor: int | None = None
    ) -> Sequence[Handoff]:
        """按时间倒序返回；cursor 为上一页最小 id，取更早的。"""
        stmt = select(Handoff).where(Handoff.user_id == user_id)
        if cursor is not None:
            stmt = stmt.where(Handoff.id < cursor)
        stmt = stmt.order_by(Handoff.id.desc()).limit(limit)
        return self._db.scalars(stmt).all()

    def get(self, user_id: int, handoff_id: int) -> Handoff | None:
        return self._db.scalar(
            select(Handoff).where(Handoff.id == handoff_id, Handoff.user_id == user_id)
        )
