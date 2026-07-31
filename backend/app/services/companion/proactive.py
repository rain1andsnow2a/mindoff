"""主动陪伴候选挑选 + 信任门控（spec phase 5, task 21）。

Property 8：被挑中的记忆必满足 visibility_gate ≤ 当前 trust；
全局（settings.proactive_enabled）或用户级开关关闭时返回空——无任何主动提起。
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.memory import MemoryItem
from app.services.pet.trust import get_or_create

logger = logging.getLogger(__name__)


def pick(db: Session, user_id: int, *, limit: int = 2) -> list[dict[str, Any]]:
    """挑选可主动提起的记忆候选。

    候选来源：有 provenance 依据的最新记忆（requirements 6.4「有依据」）；
    按 provenance 充分性（数量）降序，再按 confidence 降序；
    过滤 visibility_gate > 当前信任值的记忆（门控，requirements 6.2）。
    """
    settings = get_settings()
    if not settings.proactive_enabled:
        return []

    ts = get_or_create(db, user_id)
    if not ts.proactive_enabled:
        return []

    stmt = select(MemoryItem).where(
        MemoryItem.user_id == user_id,
        MemoryItem.is_latest == True,  # noqa: E712
        MemoryItem.is_forgotten == False,  # noqa: E712
        MemoryItem.provenance != None,  # noqa: E711
        MemoryItem.visibility_gate <= ts.value,
    )
    items = list(db.scalars(stmt).all())
    # 有依据：provenance 非空；按充分性排序
    items = [m for m in items if m.provenance]
    items.sort(key=lambda m: (-len(m.provenance), -m.confidence))

    return [
        {
            "memory_id": m.id,
            "surface_text": m.surface_text,
            "depth": m.depth,
            "kind": m.kind,
            "confidence": m.confidence,
            "visibility_gate": m.visibility_gate,
            "provenance": m.provenance,
        }
        for m in items[:limit]
    ]
