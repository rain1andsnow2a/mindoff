"""桌宠 Pets REST 接口。见 docs/api-design.md §2。

- GET    /pets/presets      预设桌宠列表（服务端内置）
- GET    /pets              我拥有/已定制的桌宠
- GET    /pets/{id}         桌宠详情
- PATCH  /pets/{id}         修改定制
- DELETE /pets/{id}         删除
- GET    /pets/active       当前主桌宠
- PUT    /pets/active       切换主桌宠 {petId} → 触发交接信生成，响应带最新 handoff

首次拥有桌宠的入口即 PUT /pets/active：petId 传预设 id（字符串）时先从预设实例化
再激活（api-design.md §2 没有 POST /pets，采用这个更简单的方式）；传整数则必须是
我已拥有的桌宠。所有接口按登录用户隔离。
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.pet import Pet
from app.models.user import User
from app.routers.handoffs import HandoffOut
from app.services.handoff_letter import compose_handoff_letter
from app.services.handoff_store import HandoffStore
from app.services.pet_presets import PET_PRESETS, get_preset
from app.services.pet_store import PetStore

router = APIRouter(prefix="/api/v1/pets", tags=["pets"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class PresetOut(BaseModel):
    id: str
    name: str
    personality: str
    tone: str
    actions: list[str]
    system_prompt: str | None = None


class PetOut(BaseModel):
    id: int
    preset_id: str | None
    name: str
    personality: str
    tone: str
    actions: list[str] = []
    system_prompt: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PetPatch(BaseModel):
    """定制修改（全可选，只更新传入字段）。"""
    name: str | None = Field(None, min_length=1, max_length=100)
    personality: str | None = Field(None, max_length=300)
    tone: str | None = Field(None, max_length=300)
    actions: list[str] | None = None
    system_prompt: str | None = None


class ActivateRequest(BaseModel):
    """petId：我拥有的桌宠 id（整数），或预设 id（字符串，先实例化再激活）。"""
    pet_id: int | str = Field(validation_alias=AliasChoices("pet_id", "petId"))


class ActivateResponse(BaseModel):
    pet: PetOut
    handoff: HandoffOut | None


# ─── 内部工具 ────────────────────────────────────────────────────────────────

def _require_pet(db: Session, user: User, pet_id: int) -> Pet:
    pet = PetStore(db).get(user.id, pet_id)
    if pet is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "桌宠不存在")
    return pet


# ─── 预设 / 列表 / 主桌宠 ────────────────────────────────────────────────────

@router.get("/presets", response_model=list[PresetOut])
def list_presets(user: User = Depends(get_current_user)):
    """预设桌宠列表（性格/语气/动作组合）。"""
    return PET_PRESETS


@router.get("", response_model=list[PetOut])
def list_pets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """我拥有/已定制的桌宠。为空时前端引导用户去选预设。"""
    return PetStore(db).list_for_user(user.id)


@router.get("/active", response_model=PetOut)
def get_active_pet(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """当前主桌宠；还没有主桌宠时 404。"""
    pet = PetStore(db).get_active(user.id)
    if pet is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "还没有主桌宠")
    return pet


@router.put("/active", response_model=ActivateResponse)
def activate_pet(
    body: ActivateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """切换主桌宠。触发交接信生成（LLM 失败走模板兜底，不阻断切换）。"""
    store = PetStore(db)

    if isinstance(body.pet_id, int):
        pet = store.get(user.id, body.pet_id)
        if pet is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "桌宠不存在")
    else:
        preset = get_preset(body.pet_id)
        if preset is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "预设不存在")
        # 复用该用户已由此预设实例化的桌宠，没有才新建（避免重复堆积同名桌宠）
        pet = store.get_by_preset(user.id, preset["id"]) \
            or store.create_from_preset(user_id=user.id, preset=preset)

    from_pet = store.get_active(user.id)

    # 已是主桌宠：不重复生成交接信，直接返回最近一次
    if from_pet is not None and from_pet.id == pet.id:
        latest = HandoffStore(db).list_for_user(user.id, limit=1)
        return ActivateResponse(pet=pet, handoff=latest[0] if latest else None)

    store.set_active(user.id, pet)

    # 去重守卫：60 秒内若已有相同 to_pet 的交接信，直接复用，避免并发/快速重复调
    # LLM（StepFun RPM 低，多实例并发或 double-tap 很容易打爆限额）。
    recent = HandoffStore(db).list_for_user(user.id, limit=1)
    if recent:
        last = recent[0]
        age = datetime.now(timezone.utc) - (last.created_at.replace(tzinfo=timezone.utc)
                                            if last.created_at.tzinfo is None else last.created_at)
        if age < timedelta(seconds=60) and last.to_pet_id == pet.id:
            return ActivateResponse(pet=pet, handoff=last)

    letter = compose_handoff_letter(
        db, user.id,
        from_pet_name=from_pet.name if from_pet else None,
        to_pet_name=pet.name,
    )
    handoff = HandoffStore(db).create(
        user_id=user.id,
        summary=letter,
        from_pet_id=from_pet.id if from_pet else None,
        to_pet_id=pet.id,
        from_pet_name=from_pet.name if from_pet else None,
        to_pet_name=pet.name,
    )
    return ActivateResponse(pet=pet, handoff=handoff)


# ─── 详情 / 定制 / 删除 ──────────────────────────────────────────────────────

@router.get("/{pet_id}", response_model=PetOut)
def get_pet(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _require_pet(db, user, pet_id)


@router.patch("/{pet_id}", response_model=PetOut)
def patch_pet(
    pet_id: int,
    body: PetPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """修改定制（名字/性格/语气/动作）。"""
    pet = _require_pet(db, user, pet_id)
    patch: dict[str, Any] = body.model_dump(exclude_unset=True)
    if patch:
        pet = PetStore(db).update(pet, patch)
    return pet


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pet(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除桌宠；若删的是主桌宠，之后 GET /pets/active 返回 404。"""
    pet = _require_pet(db, user, pet_id)
    PetStore(db).delete(pet)
