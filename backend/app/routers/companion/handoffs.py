"""交接信 Handoffs：读接口（列表 / 详情）。见 docs/api-design.md §3。

生成时机 = 切换桌宠（PUT /pets/active，Pets 系统落地后调用 HandoffStore.create）。
本模块只提供读，均按登录用户隔离。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services.pet.handoff_store import HandoffStore

router = APIRouter(prefix="/api/v1/handoffs", tags=["handoffs"])


class HandoffOut(BaseModel):
    id: int
    from_pet_id: int | None
    to_pet_id: int | None
    from_pet_name: str | None
    to_pet_name: str | None
    summary: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[HandoffOut])
def list_handoffs(
    limit: int = Query(20, ge=1, le=100),
    cursor: int | None = Query(None, description="上一页最小 id，用于向更早翻页"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return HandoffStore(db).list_for_user(user.id, limit=limit, cursor=cursor)


@router.get("/{handoff_id}", response_model=HandoffOut)
def get_handoff(
    handoff_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    h = HandoffStore(db).get(user.id, handoff_id)
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "交接信不存在")
    return h
