"""LetterStore：桌宠来信的读写入口。

`create_generated` 是自动来信的唯一写入口（供 proactive / 定时任务调用），
不暴露公开写接口。它在数据库层统一保证：同一来源幂等、每用户每天最多两封。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.letter import Letter

LETTER_TYPES = {
    "music", "movie", "book", "greeting", "relationship", "scene_invite",
    "weekly", "reminder",
    # 主动触发信号产生的来信（定时问候 / 节日祝福 / 天气关心 …）
    "proactive",
}

CST = timezone(timedelta(hours=8))
DAILY_LETTER_LIMIT = 2


def local_delivery_date(now: datetime | None = None) -> str:
    """返回产品时区（东八区）的日期键 YYYY-MM-DD。"""
    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(CST).date().isoformat()


def daily_generation_key(source: str, delivery_date: str | None = None) -> str:
    """构造每天一次的来源幂等键；source 不复用 Letter.type。"""
    return f"{source}:{delivery_date or local_delivery_date()}"


class LetterStore:
    def __init__(self, db: Session):
        self._db = db

    # ─── 内部创建（主动陪伴调用）──────────────────────────────────────────

    def create_generated(
        self,
        *,
        user_id: int,
        generation_key: str,
        type: str,
        title: str,
        body: str,
        pet_id: int | None = None,
        ref_memory_id: int | None = None,
        attachment: dict | None = None,
        delivery_date: str | None = None,
    ) -> Letter | None:
        """幂等创建一封自动来信；当天两个槽位都占用时返回 None。

        两个唯一约束分别保护来源幂等和每日槽位。并发请求即使同时通过
        预检查，也只能各占一个槽位，不会突破每日两封的硬上限。
        """
        if type not in LETTER_TYPES:
            raise ValueError(f"未知来信类型: {type}")
        if not generation_key or len(generation_key) > 120:
            raise ValueError("generation_key 必须为 1–120 个字符")

        existing = self.get_generated(user_id, generation_key)
        if existing is not None:
            return existing

        date_key = delivery_date or local_delivery_date()
        for slot in range(1, DAILY_LETTER_LIMIT + 1):
            letter = Letter(
                user_id=user_id,
                generation_key=generation_key,
                delivery_date=date_key,
                delivery_slot=slot,
                type=type,
                title=title,
                body=body,
                pet_id=pet_id,
                ref_memory_id=ref_memory_id,
                attachment=attachment,
            )
            try:
                # SAVEPOINT 只回滚本次槽位争用，不破坏调用方 session。
                with self._db.begin_nested():
                    self._db.add(letter)
                    self._db.flush()
            except IntegrityError:
                existing = self.get_generated(user_id, generation_key)
                if existing is not None:
                    return existing
                continue

            self._db.commit()
            self._db.refresh(letter)
            return letter

        return self.get_generated(user_id, generation_key)

    def get_generated(self, user_id: int, generation_key: str) -> Letter | None:
        return self._db.scalar(
            select(Letter).where(
                Letter.user_id == user_id,
                Letter.generation_key == generation_key,
            )
        )

    def has_daily_capacity(
        self, user_id: int, delivery_date: str | None = None
    ) -> bool:
        date_key = delivery_date or local_delivery_date()
        occupied = self._db.scalars(
            select(Letter.delivery_slot).where(
                Letter.user_id == user_id,
                Letter.delivery_date == date_key,
                Letter.delivery_slot.is_not(None),
            )
        ).all()
        return len(occupied) < DAILY_LETTER_LIMIT

    def list_for_delivery_date(
        self, user_id: int, delivery_date: str | None = None
    ) -> Sequence[Letter]:
        date_key = delivery_date or local_delivery_date()
        return self._db.scalars(
            select(Letter)
            .where(
                Letter.user_id == user_id,
                Letter.delivery_date == date_key,
            )
            .order_by(Letter.id.desc())
        ).all()

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
