"""三日寄存 REST 接口（api-design §8.2，72h TTL）。

GET    /api/v1/ephemeral            列表（每项带 expires_at）
POST   /api/v1/ephemeral/{id}/keep  主动留下 → 转入长久珍藏
DELETE /api/v1/ephemeral/{id}       立即删除

到期遗忘由 inbox.expire_ephemeral 执行（隐私红线：到期真删）。
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services.memory import ephemeral_store

router = APIRouter(prefix="/api/v1/ephemeral", tags=["ephemeral"])


@router.get("")
def list_ephemeral(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = ephemeral_store.list_ephemeral(db, user.id, limit=limit)
    return [ephemeral_store.to_dict(i) for i in items]


@router.post("/{memory_id}/keep", status_code=status.HTTP_201_CREATED)
def keep_ephemeral(
    memory_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = ephemeral_store.keep(db, user.id, memory_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "寄存内容不存在")
    item, treasure = result
    return {
        "kept_memory_id": item.id,
        "treasure_id": treasure.id,
        "message": "已转入长久珍藏",
    }


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ephemeral(
    memory_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not ephemeral_store.delete(db, user.id, memory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "寄存内容不存在")
    return None
