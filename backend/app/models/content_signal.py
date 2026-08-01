"""聊天内容量化的可追溯观察层。

ContentSignal 不是对用户的最终判断；它只保存某个来源文本提取出的结构化观察，
长期结论仍由 profile 层记忆负责。source_type/source_id/source_hash 组成幂等键。
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ContentSignal(Base):
    __tablename__ = "content_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)
    source_id: Mapped[str] = mapped_column(String(100), nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    topics: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    entities: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    intent: Mapped[str] = mapped_column(String(30), nullable=False, default="other")
    events: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    repetition_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    emotion: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    sensitivity: Mapped[str] = mapped_column(String(20), nullable=False, default="surface")
    extraction_status: Mapped[str] = mapped_column(String(20), nullable=False, default="ready")
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_memory_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    profiled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "source_type", "source_id", "source_hash",
            name="uq_content_signal_source",
        ),
        Index("ix_content_signal_user_created", "user_id", "created_at"),
        Index("ix_content_signal_user_repeat", "user_id", "repetition_key"),
    )
