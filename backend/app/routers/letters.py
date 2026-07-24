"""桌宠来信 REST 接口（api-design §8.1）。

GET    /api/v1/letters        列表（?type=&unread=）
GET    /api/v1/letters/{id}   详情
PATCH  /api/v1/letters/{id}   标记已读 {read:true}
DELETE /api/v1/letters/{id}   删除

生成是服务端主动行为（proactive / 定时），不开放公开写接口。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services.letter_store import LETTER_TYPES, LetterStore

router = APIRouter(prefix="/api/v1/letters", tags=["letters"])


class LetterOut(BaseModel):
    id: int
    type: str
    title: str
    body: str
    pet_id: int | None
    ref_memory_id: int | None
    attachment: dict | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LetterPatch(BaseModel):
    read: bool | None = None


def _require_letter(db: Session, user: User, letter_id: int):
    letter = LetterStore(db).get(user.id, letter_id)
    if letter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "来信不存在")
    return letter


@router.get("", response_model=list[LetterOut])
def list_letters(
    type: str | None = Query(None, description="music|movie|book|greeting|relationship|scene_invite"),
    unread: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    cursor: int | None = Query(None, description="上一页最小 id，用于向更早翻页"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if type is not None and type not in LETTER_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"未知来信类型: {type}")
    return LetterStore(db).list_for_user(user.id, type=type, unread=unread,
                                         limit=limit, cursor=cursor)


@router.get("/{letter_id}", response_model=LetterOut)
def get_letter(
    letter_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _require_letter(db, user, letter_id)


@router.patch("/{letter_id}", response_model=LetterOut)
def patch_letter(
    letter_id: int,
    body: LetterPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    letter = _require_letter(db, user, letter_id)
    if body.read is not None:
        letter = LetterStore(db).mark_read(letter, body.read)
    return letter


@router.delete("/{letter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_letter(
    letter_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    letter = _require_letter(db, user, letter_id)
    LetterStore(db).delete(letter)
    return None
