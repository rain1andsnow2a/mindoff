"""记忆系统 REST 接口。见 docs/api-design.md §9。

用户可查看/修改/删除全部记忆，均按登录用户隔离（Bearer auth）。
产品口径：不做诊断、不把推测当事实——本层只如实返回记忆字段，不输出人格标签/冰山层名。
交接信共享的正是这些"用户允许保留的记忆"。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.memory import Depth, Kind, Layer
from app.models.user import User
from app.services.memory_store import MemoryStore

router = APIRouter(prefix="/api/v1/memories", tags=["memories"])


# ─── Schemas ───────────────────────────────────────────────────────────────────

class MemoryCreate(BaseModel):
    layer: Layer
    kind: Kind
    depth: Depth
    content: str
    surface_text: str = ""
    confidence: float = 1.0
    entities: list[str] | None = None
    emotion: dict | None = None
    provenance: list | None = None
    raw_ref: str | None = None


class MemoryUpdate(BaseModel):
    content: str | None = None
    surface_text: str | None = None
    confidence: float | None = None
    entities: list[str] | None = None
    emotion: dict | None = None


class MemoryOut(BaseModel):
    id: int
    user_id: int
    layer: str
    kind: str
    depth: str
    content: str
    surface_text: str
    confidence: float
    version: int
    root_id: int | None
    is_latest: bool
    is_forgotten: bool
    visibility_gate: float
    privacy: str
    entities: list | None
    emotion: dict | None
    provenance: list | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_item(cls, item) -> "MemoryOut":
        return cls(
            id=item.id,
            user_id=item.user_id,
            layer=item.layer,
            kind=item.kind,
            depth=item.depth,
            content=item.content,
            surface_text=item.surface_text,
            confidence=item.confidence,
            version=item.version,
            root_id=item.root_id,
            is_latest=item.is_latest,
            is_forgotten=item.is_forgotten,
            visibility_gate=item.visibility_gate,
            privacy=item.privacy,
            entities=item.entities,
            emotion=item.emotion,
            provenance=item.provenance,
            created_at=item.created_at.isoformat() if item.created_at else "",
            updated_at=item.updated_at.isoformat() if item.updated_at else "",
        )


# ─── 内部：取本人记忆或 404（隔离跨用户访问）──────────────────────────────────

def _own_item_or_404(store: MemoryStore, memory_id: int, user_id: int):
    item = store.get(memory_id)
    if item is None or item.user_id != user_id or item.is_forgotten:
        raise HTTPException(404, "Memory not found")
    return item


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=MemoryOut, status_code=201)
def create_memory(
    body: MemoryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    store = MemoryStore(db)
    item = store.create(
        user_id=user.id,
        layer=body.layer.value,
        kind=body.kind.value,
        depth=body.depth.value,
        content=body.content,
        surface_text=body.surface_text,
        confidence=body.confidence,
        entities=body.entities,
        emotion=body.emotion,
        provenance=body.provenance,
        raw_ref=body.raw_ref,
        actor="user",
    )
    return MemoryOut.from_item(item)


@router.get("", response_model=list[MemoryOut])
def list_memories(
    layer: str | None = None,
    kind: str | None = None,
    depth: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查看全部记忆（可按 layer/kind/depth 过滤），均限本人。"""
    store = MemoryStore(db)
    if layer:
        items = store.list_by_layer(user.id, layer)
    elif kind:
        items = store.list_by_kind(user.id, kind)
    elif depth:
        items = store.list_by_depth(user.id, depth)
    else:
        items = store.list_all_latest(user.id)
    return [MemoryOut.from_item(i) for i in items]


@router.delete("", status_code=200)
def clear_all_memories(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """清空本人全部记忆（走遗忘，保留 history）。返回清空条数。"""
    count = MemoryStore(db).clear_all(user.id, actor="user")
    return {"cleared": count}


@router.get("/{memory_id}", response_model=MemoryOut)
def get_memory(
    memory_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    store = MemoryStore(db)
    item = _own_item_or_404(store, memory_id, user.id)
    return MemoryOut.from_item(item)


@router.patch("/{memory_id}", response_model=MemoryOut)
def update_memory(
    memory_id: int,
    body: MemoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    store = MemoryStore(db)
    _own_item_or_404(store, memory_id, user.id)
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "No fields to update")
    try:
        item = store.update(memory_id, patch, actor="user")
    except ValueError as e:
        raise HTTPException(404, str(e))
    return MemoryOut.from_item(item)


@router.delete("/{memory_id}", status_code=204)
def delete_memory(
    memory_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    store = MemoryStore(db)
    _own_item_or_404(store, memory_id, user.id)
    store.forget(memory_id, reason="user_delete", event="DELETE", actor="user")


@router.get("/{memory_id}/versions", response_model=list[MemoryOut])
def get_versions(
    memory_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查看一条记忆的完整版本链。"""
    store = MemoryStore(db)
    item = _own_item_or_404(store, memory_id, user.id)
    root = item.root_id or item.id
    versions = store.list_by_root(root)
    return [MemoryOut.from_item(v) for v in versions]
