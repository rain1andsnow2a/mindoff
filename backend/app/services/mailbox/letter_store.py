"""LetterStore：桌宠来信的读写入口。

`create_generated` 是自动来信的唯一写入口（供 proactive / 定时任务调用），
不暴露公开写接口。它在数据库层统一保证同一来源幂等。

历史上这里还有「每用户每天最多两封」的槽位硬上限；产品后来回归
「游戏邮箱」式的简单信箱，不再设每日数量上限——各来源仍靠
generation_key 幂等（同一来源同一天的信只会有一封）。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Sequence

from sqlalchemy import func, select
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
        """幂等创建一封自动来信；同一 generation_key 已存在时直接返回旧信。

        delivery_slot 只作为当天内的序号（唯一约束防并发重复占位），
        不再有每日数量上限；并发冲突时重新取序号重试。
        """
        if type not in LETTER_TYPES:
            raise ValueError(f"未知来信类型: {type}")
        if not generation_key or len(generation_key) > 120:
            raise ValueError("generation_key 必须为 1–120 个字符")

        existing = self.get_generated(user_id, generation_key)
        if existing is not None:
            return existing

        date_key = delivery_date or local_delivery_date()
        # 并发兜底：极少数情况下两个请求同时拿到同一序号，重试三次足够。
        for _ in range(3):
            slot = self._next_slot(user_id, date_key)
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
                # SAVEPOINT 只回滚本次插入争用，不破坏调用方 session。
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

    def _next_slot(self, user_id: int, date_key: str) -> int:
        """当天已占用的最大序号 + 1（从 1 开始）。"""
        max_slot = self._db.scalar(
            select(func.max(Letter.delivery_slot)).where(
                Letter.user_id == user_id,
                Letter.delivery_date == date_key,
                Letter.delivery_slot.is_not(None),
            )
        )
        return int(max_slot or 0) + 1

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
        """历史遗留守卫：来信已取消每日数量上限，恒为 True。

        保留方法签名，避免改动各生成入口（晚信/周报/场景邀请等）的调用结构；
        各来源自身仍通过 generation_key 保持每天一封的幂等。
        """
        return True

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
