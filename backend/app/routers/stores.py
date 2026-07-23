"""五类存储的 REST 视图（§6）：Todos / Summaries / Ideas / Emotions。

这四类不是独立表，而是 MemoryItem 按 kind 的视图（睡前整理把内容分流到这五类）。
共用一套读写：均按登录用户隔离、只操作最新未遗忘条目、删除走 forget。

- Todos(待办)    : GET(?status=&due=today) / POST / GET{id} / PATCH / DELETE
- Summaries(小结): GET(?date=) / GET{id} / PATCH / DELETE
- Ideas(灵感)    : GET / POST / GET{id} / PATCH / DELETE
- Emotions(情绪) : GET / GET{id} / DELETE   （只承接不强转、一般不编辑，可删除）
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.memory import Kind, MemoryItem
from app.models.user import User
from app.services.memory_store import MemoryStore


# ─── 共用输出 ────────────────────────────────────────────────────────────────

class StoreItemOut(BaseModel):
    id: int
    kind: str
    layer: str
    depth: str
    content: str
    surface_text: str
    status: str | None = None
    due_date: datetime | None = None
    entities: list | None = None
    emotion: dict | None = None
    provenance: list | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _out(item: MemoryItem) -> StoreItemOut:
    return StoreItemOut.model_validate(item)


def _own_of_kind_or_404(store: MemoryStore, mem_id: int, user_id: int, kind: str) -> MemoryItem:
    item = store.get(mem_id)
    if item is None or item.user_id != user_id or item.is_forgotten \
            or not item.is_latest or item.kind != kind:
        raise HTTPException(404, "Not found")
    return item


def _list_kind(store: MemoryStore, user_id: int, kind: str) -> list[MemoryItem]:
    return store.list_by_kind(user_id, kind)


# ════════════════════════════════════════════════════════════════════════════
# Todos（待办）
# ════════════════════════════════════════════════════════════════════════════

todos_router = APIRouter(prefix="/api/v1/todos", tags=["todos"])


class TodoCreate(BaseModel):
    content: str
    surface_text: str = ""
    due_date: datetime | None = None


class TodoPatch(BaseModel):
    content: str | None = None
    surface_text: str | None = None
    due_date: datetime | None = None
    status: str | None = None  # pending / done / canceled


def _is_today(dt: datetime | None) -> bool:
    if dt is None:
        return False
    now = datetime.now(timezone.utc)
    return dt.astimezone(timezone.utc).date() == now.date()


@todos_router.get("", response_model=list[StoreItemOut])
def list_todos(
    status: str | None = Query(None, description="pending|done|canceled"),
    due: str | None = Query(None, description="today = 今日待启"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = _list_kind(MemoryStore(db), user.id, Kind.todo.value)
    out = []
    for it in items:
        # 未显式置状态的（如倾倒产出）视为 pending
        eff_status = it.status or "pending"
        if status and eff_status != status:
            continue
        if due == "today" and not _is_today(it.due_date):
            continue
        out.append(it)
    return [_out(i) for i in out]


@todos_router.post("", response_model=StoreItemOut, status_code=201)
def create_todo(
    body: TodoCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = MemoryStore(db).create(
        user_id=user.id, layer="episodic", kind=Kind.todo.value, depth="surface",
        content=body.content, surface_text=body.surface_text,
        status="pending", due_date=body.due_date, actor="user",
    )
    return _out(item)


@todos_router.get("/{item_id}", response_model=StoreItemOut)
def get_todo(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(_own_of_kind_or_404(MemoryStore(db), item_id, user.id, Kind.todo.value))


@todos_router.patch("/{item_id}", response_model=StoreItemOut)
def patch_todo(
    item_id: int, body: TodoPatch,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    store = MemoryStore(db)
    _own_of_kind_or_404(store, item_id, user.id, Kind.todo.value)
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "No fields to update")
    return _out(store.update(item_id, patch, actor="user"))


@todos_router.delete("/{item_id}", status_code=204)
def delete_todo(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = MemoryStore(db)
    _own_of_kind_or_404(store, item_id, user.id, Kind.todo.value)
    store.forget(item_id, reason="user_delete", event="DELETE", actor="user")


# ════════════════════════════════════════════════════════════════════════════
# Summaries（小结 / 日卡）
# ════════════════════════════════════════════════════════════════════════════

summaries_router = APIRouter(prefix="/api/v1/summaries", tags=["summaries"])


class SummaryPatch(BaseModel):
    content: str | None = None
    surface_text: str | None = None


@summaries_router.get("", response_model=list[StoreItemOut])
def list_summaries(
    date: str | None = Query(None, description="YYYY-MM-DD，按小结所属日期过滤"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = _list_kind(MemoryStore(db), user.id, Kind.summary.value)
    if date:
        items = [i for i in items if i.created_at and i.created_at.date().isoformat() == date]
    return [_out(i) for i in items]


@summaries_router.get("/{item_id}", response_model=StoreItemOut)
def get_summary(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(_own_of_kind_or_404(MemoryStore(db), item_id, user.id, Kind.summary.value))


@summaries_router.patch("/{item_id}", response_model=StoreItemOut)
def patch_summary(
    item_id: int, body: SummaryPatch,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    store = MemoryStore(db)
    _own_of_kind_or_404(store, item_id, user.id, Kind.summary.value)
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "No fields to update")
    return _out(store.update(item_id, patch, actor="user"))


@summaries_router.delete("/{item_id}", status_code=204)
def delete_summary(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = MemoryStore(db)
    _own_of_kind_or_404(store, item_id, user.id, Kind.summary.value)
    store.forget(item_id, reason="user_delete", event="DELETE", actor="user")


# ════════════════════════════════════════════════════════════════════════════
# Ideas（灵感）
# ════════════════════════════════════════════════════════════════════════════

ideas_router = APIRouter(prefix="/api/v1/ideas", tags=["ideas"])


class IdeaCreate(BaseModel):
    content: str
    surface_text: str = ""


class IdeaPatch(BaseModel):
    content: str | None = None
    surface_text: str | None = None


@ideas_router.get("", response_model=list[StoreItemOut])
def list_ideas(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_out(i) for i in _list_kind(MemoryStore(db), user.id, Kind.idea.value)]


@ideas_router.post("", response_model=StoreItemOut, status_code=201)
def create_idea(body: IdeaCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = MemoryStore(db).create(
        user_id=user.id, layer="state", kind=Kind.idea.value, depth="surface",
        content=body.content, surface_text=body.surface_text, actor="user",
    )
    return _out(item)


@ideas_router.get("/{item_id}", response_model=StoreItemOut)
def get_idea(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(_own_of_kind_or_404(MemoryStore(db), item_id, user.id, Kind.idea.value))


@ideas_router.patch("/{item_id}", response_model=StoreItemOut)
def patch_idea(
    item_id: int, body: IdeaPatch,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    store = MemoryStore(db)
    _own_of_kind_or_404(store, item_id, user.id, Kind.idea.value)
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "No fields to update")
    return _out(store.update(item_id, patch, actor="user"))


@ideas_router.delete("/{item_id}", status_code=204)
def delete_idea(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = MemoryStore(db)
    _own_of_kind_or_404(store, item_id, user.id, Kind.idea.value)
    store.forget(item_id, reason="user_delete", event="DELETE", actor="user")


# ════════════════════════════════════════════════════════════════════════════
# Emotions（情绪）—— 只承接不强转，一般不编辑，可删除（隐私）
# ════════════════════════════════════════════════════════════════════════════

emotions_router = APIRouter(prefix="/api/v1/emotions", tags=["emotions"])


@emotions_router.get("", response_model=list[StoreItemOut])
def list_emotions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_out(i) for i in _list_kind(MemoryStore(db), user.id, Kind.emotion.value)]


@emotions_router.get("/{item_id}", response_model=StoreItemOut)
def get_emotion(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(_own_of_kind_or_404(MemoryStore(db), item_id, user.id, Kind.emotion.value))


@emotions_router.delete("/{item_id}", status_code=204)
def delete_emotion(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    store = MemoryStore(db)
    _own_of_kind_or_404(store, item_id, user.id, Kind.emotion.value)
    store.forget(item_id, reason="user_delete", event="DELETE", actor="user")
