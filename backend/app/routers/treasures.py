"""长久珍藏 REST 接口（api-design §8.3）。

GET    /api/v1/treasures        列表
POST   /api/v1/treasures        主动收藏（from summary/idea/memory/ephemeral）
GET    /api/v1/treasures/{id}   详情
DELETE /api/v1/treasures/{id}   删除
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services.memory_store import MemoryStore
from app.services.treasure_store import SOURCE_TYPES, TreasureStore

router = APIRouter(prefix="/api/v1/treasures", tags=["treasures"])


class TreasureOut(BaseModel):
    id: int
    source_type: str
    source_id: int | None
    title: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TreasureCreate(BaseModel):
    source_type: str  # summary | idea | memory | ephemeral
    source_id: int | None = None
    title: str | None = None
    content: str | None = None  # 缺省时从来源记忆取快照


def _require_treasure(db: Session, user: User, treasure_id: int):
    t = TreasureStore(db).get(user.id, treasure_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "珍藏不存在")
    return t


@router.get("", response_model=list[TreasureOut])
def list_treasures(
    limit: int = Query(50, ge=1, le=100),
    cursor: int | None = Query(None, description="上一页最小 id，用于向更早翻页"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return TreasureStore(db).list_for_user(user.id, limit=limit, cursor=cursor)


@router.post("", response_model=TreasureOut, status_code=status.HTTP_201_CREATED)
def create_treasure(
    body: TreasureCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.source_type not in SOURCE_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"未知珍藏来源: {body.source_type}")

    title = body.title
    content = body.content
    # 记忆类来源可缺省取快照（校验归属）；conversation/scene 需显式给 title/content
    MEMORY_BACKED = {"memory", "ephemeral", "summary", "idea"}
    if (body.source_type in MEMORY_BACKED and body.source_id is not None
            and (title is None or content is None)):
        mem = MemoryStore(db).get(body.source_id)
        if mem is None or mem.user_id != user.id or mem.is_forgotten:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "来源记忆不存在")
        title = title or f"留下的{mem.kind}"
        content = content or mem.surface_text or mem.content
    if not title or not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "title 与 content 必填（或提供可快照的 source_id）")

    return TreasureStore(db).create(
        user_id=user.id,
        source_type=body.source_type,
        source_id=body.source_id,
        title=title,
        content=content,
    )


@router.get("/{treasure_id}", response_model=TreasureOut)
def get_treasure(
    treasure_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _require_treasure(db, user, treasure_id)


@router.delete("/{treasure_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_treasure(
    treasure_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _require_treasure(db, user, treasure_id)
    TreasureStore(db).delete(t)
    return None
