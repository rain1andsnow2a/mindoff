"""ConversationStore：对话读写的唯一入口，面向单个 DB session。

对齐 HandoffStore/MemoryStore：commit+refresh 在 store 内完成，读接口按 user 隔离。
"""
from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, Message


class ConversationStore:
    def __init__(self, db: Session):
        self._db = db

    # ─── 会话 ──────────────────────────────────────────────────────────────

    def create(
        self,
        *,
        user_id: int,
        mode: str = "free_chat",
        pet_id: int | None = None,
        fragment_id: int | None = None,
        title: str | None = None,
    ) -> Conversation:
        conv = Conversation(
            user_id=user_id,
            mode=mode,
            pet_id=pet_id,
            fragment_id=fragment_id,
            title=title,
        )
        self._db.add(conv)
        self._db.commit()
        self._db.refresh(conv)
        return conv

    def get(self, user_id: int, conv_id: int) -> Conversation | None:
        """按 user 隔离取会话。"""
        return self._db.scalar(
            select(Conversation).where(
                Conversation.id == conv_id, Conversation.user_id == user_id
            )
        )

    def list_for_user(
        self, user_id: int, *, limit: int = 20, cursor: int | None = None
    ) -> Sequence[Conversation]:
        """按 id 倒序（最新在前）；cursor 为上一页最小 id，取更早的。"""
        stmt = select(Conversation).where(Conversation.user_id == user_id)
        if cursor is not None:
            stmt = stmt.where(Conversation.id < cursor)
        stmt = stmt.order_by(Conversation.id.desc()).limit(limit)
        return self._db.scalars(stmt).all()

    def delete(self, user_id: int, conv_id: int) -> bool:
        """删除用户自己的会话；关联消息由 ORM delete-orphan 级联清理。"""
        conv = self.get(user_id, conv_id)
        if conv is None:
            return False
        self._db.delete(conv)
        self._db.commit()
        return True

    # ─── 消息 ──────────────────────────────────────────────────────────────

    def add_message(self, conv_id: int, *, role: str, content: str) -> Message:
        """追加一条消息，并顺带刷新会话 updated_at。"""
        msg = Message(conversation_id=conv_id, role=role, content=content)
        self._db.add(msg)
        # 触发 onupdate：显式 touch 会话
        conv = self._db.get(Conversation, conv_id)
        if conv is not None and conv.title is None and role == "user":
            conv.title = content[:40]
        self._db.commit()
        self._db.refresh(msg)
        return msg

    def list_messages(
        self, conv_id: int, *, limit: int = 50, cursor: int | None = None
    ) -> Sequence[Message]:
        """按 id 正序（时间顺序）；cursor 为上一页最大 id，取之后的。"""
        stmt = select(Message).where(Message.conversation_id == conv_id)
        if cursor is not None:
            stmt = stmt.where(Message.id > cursor)
        stmt = stmt.order_by(Message.id.asc()).limit(limit)
        return self._db.scalars(stmt).all()

    def history_as_dicts(self, conv_id: int) -> list[dict[str, str]]:
        """取全部消息，转成 [{role, content}]，供 LangGraph 组装上下文。"""
        stmt = (
            select(Message)
            .where(Message.conversation_id == conv_id)
            .order_by(Message.id.asc())
        )
        return [{"role": m.role, "content": m.content} for m in self._db.scalars(stmt).all()]
