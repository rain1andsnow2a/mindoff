"""LetterStore：桌宠来信的读写入口。

`create` 是内部入口（供 proactive / 定时任务调用），不暴露公开写接口。
产品口径：每天 ≤1–2 封、无内容不发——限频由生成方负责，store 只做存取。
"""
from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.letter import Letter

LETTER_TYPES = {
    "music", "movie", "book", "greeting", "relationship", "scene_invite",
    "weekly", "reminder",
    # 主动触发信号产生的来信（定时问候 / 节日祝福 / 天气关心 …）
    "proactive",
}


class LetterStore:
    def __init__(self, db: Session):
        self._db = db

    # ─── 内部创建（主动陪伴调用）──────────────────────────────────────────

    def create(
        self,
        *,
        user_id: int,
        type: str,
        title: str,
        body: str,
        pet_id: int | None = None,
        ref_memory_id: int | None = None,
        attachment: dict | None = None,
    ) -> Letter:
        if type not in LETTER_TYPES:
            raise ValueError(f"未知来信类型: {type}")
        letter = Letter(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            pet_id=pet_id,
            ref_memory_id=ref_memory_id,
            attachment=attachment,
        )
        self._db.add(letter)
        self._db.commit()
        self._db.refresh(letter)
        return letter

    # ─── 读取（user 隔离）─────────────────────────────────────────────────

    def get(self, user_id: int, letter_id: int) -> Letter | None:
        return self._db.scalar(
            select(Letter).where(Letter.id == letter_id, Letter.user_id == user_id)
        )

    def list_for_user(
        self,
        user_id: int,
        *,
        type: str | None = None,
        unread: bool = False,
        limit: int = 50,
        cursor: int | None = None,
    ) -> Sequence[Letter]:
        """按 id 倒序（最新在前）；cursor 为上一页最小 id，取更早的。"""
        stmt = select(Letter).where(Letter.user_id == user_id)
        if type is not None:
            stmt = stmt.where(Letter.type == type)
        if unread:
            stmt = stmt.where(Letter.is_read == False)  # noqa: E712
        if cursor is not None:
            stmt = stmt.where(Letter.id < cursor)
        stmt = stmt.order_by(Letter.id.desc()).limit(limit)
        return self._db.scalars(stmt).all()

    def unread_count(self, user_id: int) -> int:
        stmt = select(Letter).where(
            Letter.user_id == user_id, Letter.is_read == False  # noqa: E712
        )
        return len(self._db.scalars(stmt).all())

    # ─── 已读 / 删除 ─────────────────────────────────────────────────────

    def mark_read(self, letter: Letter, read: bool = True) -> Letter:
        letter.is_read = read
        self._db.commit()
        self._db.refresh(letter)
        return letter

    def delete(self, letter: Letter) -> None:
        self._db.delete(letter)
        self._db.commit()
