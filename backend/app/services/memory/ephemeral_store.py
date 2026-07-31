"""三日寄存（Ephemeral）：带 expires_at 的记忆，72h 到期由 inbox.expire_ephemeral 遗忘。

- GET 列表：未遗忘、最新版本、带 expires_at 的记忆（情绪/片段/未确认候选等）。
- keep：用户主动留下 → 清除 expires_at（不再过期），并转入长久珍藏。
- delete：立即遗忘（event=DELETE），与到期遗忘共用 MemoryStore.forget 路径。
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.memory import MemoryItem
from app.services.memory.memory_store import MemoryStore
from app.services.companion.treasure_store import TreasureStore


def list_ephemeral(db: Session, user_id: int, *, limit: int = 50) -> list[MemoryItem]:
    """三日寄存列表：带 expires_at、未遗忘、最新版本，按到期时间升序。"""
    stmt = (
        select(MemoryItem)
        .where(
            MemoryItem.user_id == user_id,
            MemoryItem.expires_at != None,  # noqa: E711
            MemoryItem.is_forgotten == False,  # noqa: E712
            MemoryItem.is_latest == True,  # noqa: E712
        )
        .order_by(MemoryItem.expires_at.asc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def to_dict(item: MemoryItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "kind": item.kind,
        "content": item.content,
        "surface_text": item.surface_text,
        "expires_at": item.expires_at.isoformat() if item.expires_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else "",
    }


def _get_owned(db: Session, user_id: int, memory_id: int) -> MemoryItem | None:
    item = db.get(MemoryItem, memory_id)
    if item is None or item.user_id != user_id or item.is_forgotten:
        return None
    return item


def keep(db: Session, user_id: int, memory_id: int):
    """主动留下：清除过期时间（转为长久保存）+ 生成一条珍藏。返回 (item, treasure)。"""
    item = _get_owned(db, user_id, memory_id)
    if item is None:
        return None
    # 清除 TTL（生命周期元数据变更，不走版本链；keep 行为本身由珍藏落库记录）
    item.expires_at = None
    db.commit()
    db.refresh(item)

    treasure = TreasureStore(db).create(
        user_id=user_id,
        source_type="ephemeral",
        source_id=item.id,
        title=f"留下的{item.kind}",
        content=item.surface_text or item.content,
    )
    return item, treasure


def delete(db: Session, user_id: int, memory_id: int) -> bool:
    """立即删除：遗忘并写 DELETE 历史。"""
    item = _get_owned(db, user_id, memory_id)
    if item is None:
        return False
    MemoryStore(db).forget(item.id, reason="user_deleted_ephemeral",
                           event="DELETE", actor="user")
    return True
