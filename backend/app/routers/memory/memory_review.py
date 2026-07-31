"""记忆审阅控制面「我的·记忆」（spec phase 6, task 24）。

GET /api/v1/memory-review  列出 profile/state 层记忆（来源可见 + 敏感度软标签）

口径红线（requirements 9.4, 10.1）：只呈现「日常/个人/较私密/很私密」软标签，
绝不输出冰山层名、诊断、人格标签。
编辑/删除复用 `/api/v1/memories` 的 PATCH/DELETE（UPDATE 版本链 / FORGET 不再召回）。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services.memory.memory_store import MemoryStore

router = APIRouter(prefix="/api/v1/memory-review", tags=["memory-review"])

# depth → 面向用户的敏感度软标签（不出现 depth 原名，更不见冰山术语）
SENSITIVITY_LABELS = {
    "surface": "日常",
    "personal": "个人",
    "vulnerable": "较私密",
    "core": "很私密",
}

# 审阅面只列这两层（requirements 9.1）
REVIEW_LAYERS = ("profile", "state")


class ReviewItem(BaseModel):
    id: int
    kind: str
    surface_text: str
    sensitivity: str
    provenance: list | None
    updated_at: datetime


def _to_review(item) -> ReviewItem:
    return ReviewItem(
        id=item.id,
        kind=item.kind,
        surface_text=item.surface_text or item.content,
        sensitivity=SENSITIVITY_LABELS.get(item.depth, "个人"),
        provenance=item.provenance,
        updated_at=item.updated_at,
    )


@router.get("", response_model=list[ReviewItem])
def list_review(
    sensitivity: str | None = Query(None, description="按敏感度过滤：日常|个人|较私密|很私密"),
    kind: str | None = Query(None, description="按 kind 过滤：待办|小结|灵感|情绪|片段"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    store = MemoryStore(db)
    items = []
    for layer in REVIEW_LAYERS:
        items.extend(store.list_by_layer(user.id, layer))

    reviews = [_to_review(i) for i in items]
    if sensitivity:
        reviews = [r for r in reviews if r.sensitivity == sensitivity]
    if kind:
        reviews = [r for r in reviews if r.kind == kind]
    reviews.sort(key=lambda r: r.id, reverse=True)
    return reviews
