"""双轴记忆数据模型。

功能轴：layer (episodic/profile/state) + kind (待办/小结/灵感/情绪/片段)
深度轴：depth (surface/personal/vulnerable/core)
"""
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


# ─── 枚举 ──────────────────────────────────────────────────────────────────────

class Layer(str, enum.Enum):
    episodic = "episodic"
    profile = "profile"
    state = "state"


class Kind(str, enum.Enum):
    todo = "待办"
    summary = "小结"
    idea = "灵感"
    emotion = "情绪"
    fragment = "片段"


class Depth(str, enum.Enum):
    surface = "surface"
    personal = "personal"
    vulnerable = "vulnerable"
    core = "core"


class Privacy(str, enum.Enum):
    local = "local"
    cloud = "cloud"
    burn_after_read = "burn_after_read"


class RelationType(str, enum.Enum):
    updates = "updates"
    extends = "extends"
    derives = "derives"


class HistoryEvent(str, enum.Enum):
    ADD = "ADD"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    FORGET = "FORGET"
    RECOVER = "RECOVER"


# ─── depth → 默认门控/隐私映射 ─────────────────────────────────────────────────

DEPTH_DEFAULTS: dict[Depth, dict] = {
    Depth.surface: {"visibility_gate": 0.0, "privacy": Privacy.cloud},
    Depth.personal: {"visibility_gate": 0.3, "privacy": Privacy.local},
    Depth.vulnerable: {"visibility_gate": 0.6, "privacy": Privacy.local},
    Depth.core: {"visibility_gate": 0.85, "privacy": Privacy.local},
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─── MemoryItem ────────────────────────────────────────────────────────────────

class MemoryItem(Base):
    __tablename__ = "memory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # 功能轴
    layer: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)

    # 深度轴
    depth: Mapped[str] = mapped_column(String(20), nullable=False)

    # 内容
    content: Mapped[str] = mapped_column(Text, nullable=False)
    surface_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    # kind 专属属性（待办用）：状态 pending/done/canceled + 截止时间
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 版本链
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("memory_items.id"), nullable=True
    )
    root_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("memory_items.id"), nullable=True
    )
    is_latest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 遗忘
    is_forgotten: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    forget_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 关系
    relation_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    relation_to_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("memory_items.id"), nullable=True
    )

    # 元数据
    entities: Mapped[list | None] = mapped_column(JSON, nullable=True)
    emotion: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    provenance: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # 门控 & 隐私
    visibility_gate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    privacy: Mapped[str] = mapped_column(String(30), nullable=False, default="cloud")

    # 原始引用
    raw_ref: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    # 关系
    history: Mapped[list["MemoryHistory"]] = relationship(
        back_populates="memory", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_memory_user_layer_latest", "user_id", "layer", "is_latest"),
        Index("ix_memory_user_kind", "user_id", "kind"),
        Index("ix_memory_user_depth", "user_id", "depth"),
        Index("ix_memory_root", "root_id"),
    )

    def __repr__(self) -> str:
        return f"<MemoryItem id={self.id} layer={self.layer} kind={self.kind} depth={self.depth} v{self.version}>"


# ─── MemoryHistory ─────────────────────────────────────────────────────────────

class MemoryHistory(Base):
    __tablename__ = "memory_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    memory_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("memory_items.id"), nullable=False, index=True
    )
    event: Mapped[str] = mapped_column(String(20), nullable=False)
    actor: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    old_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    # 关系
    memory: Mapped["MemoryItem"] = relationship(back_populates="history")

    def __repr__(self) -> str:
        return f"<MemoryHistory id={self.id} memory_id={self.memory_id} event={self.event}>"
