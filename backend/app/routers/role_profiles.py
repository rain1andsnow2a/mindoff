"""角色档案 REST 接口。

- GET    /role-profiles        列表
- POST   /role-profiles        创建
- GET    /role-profiles/{id}   详情
- PATCH  /role-profiles/{id}   修改
- DELETE /role-profiles/{id}   删除

按登录用户隔离；URL 里不放 userId。
"""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.role_profile import RoleProfile
from app.models.user import User

router = APIRouter(prefix="/api/v1/role-profiles", tags=["role-profiles"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class RoleProfileOut(BaseModel):
    id: int
    name: str
    relation: str
    notes: str
    personality_summary: str
    speaking_style: str
    conflict_response: str
    traits: list | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RoleProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    relation: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=5000)
    personality_summary: str = Field(default="", max_length=5000)
    speaking_style: str = Field(default="", max_length=300)
    conflict_response: str = Field(default="", max_length=300)
    traits: list[str] | None = None


class RoleProfilePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    relation: str | None = Field(None, max_length=100)
    notes: str | None = Field(None, max_length=5000)
    personality_summary: str | None = Field(None, max_length=5000)
    speaking_style: str | None = Field(None, max_length=300)
    conflict_response: str | None = Field(None, max_length=300)
    traits: list[str] | None = None


# ─── 内部工具 ────────────────────────────────────────────────────────────────

def _require_role(db: Session, user: User, role_id: int) -> RoleProfile:
    role = db.scalar(
        select(RoleProfile).where(
            RoleProfile.id == role_id, RoleProfile.user_id == user.id
        )
    )
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "角色档案不存在")
    return role


# ─── 端点 ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[RoleProfileOut])
def list_roles(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """我的角色档案列表。"""
    stmt = select(RoleProfile).where(RoleProfile.user_id == user.id)
    return db.scalars(stmt).all()


@router.post("", response_model=RoleProfileOut, status_code=status.HTTP_201_CREATED)
def create_role(
    body: RoleProfileCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建角色档案。"""
    role = RoleProfile(user_id=user.id, **body.model_dump(exclude_unset=True))
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.get("/{role_id}", response_model=RoleProfileOut)
def get_role(
    role_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _require_role(db, user, role_id)


@router.patch("/{role_id}", response_model=RoleProfileOut)
def patch_role(
    role_id: int,
    body: RoleProfilePatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = _require_role(db, user, role_id)
    patch: dict[str, Any] = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")
    for k, v in patch.items():
        setattr(role, k, v)
    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = _require_role(db, user, role_id)
    db.delete(role)
    db.commit()
    return None
