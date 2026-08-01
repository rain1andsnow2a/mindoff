"""画像写入候选：把模型建议与真正的长期记忆写入隔离。"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProfileWriteCandidate(Base):
    __tablename__ = "profile_write_candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    signal_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    candidate_index: Mapped[int] = mapped_column(Integer, nullable=False)
    memory_key: Mapped[str] = mapped_column(String(160), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False, default="add")
    target_memory_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    surface_text: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_quote: Mapped[str] = mapped_column(Text, nullable=False)
    entities: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    durability: Mapped[str] = mapped_column(String(20), nullable=False, default="emerging")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    sensitivity: Mapped[str] = mapped_column(String(20), nullable=False, default="personal")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    gate_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    applied_memory_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("signal_id", "candidate_index", name="uq_profile_candidate_signal_index"),
        Index("ix_profile_candidate_user_status", "user_id", "status"),
        Index("ix_profile_candidate_user_key", "user_id", "memory_key"),
    )
