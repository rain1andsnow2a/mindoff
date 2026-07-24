"""PetStore：桌宠读写的唯一入口，面向单个 DB session。

对齐 ConversationStore/HandoffStore：commit+refresh 在 store 内完成，读写按 user 隔离。
set_active 负责"同一用户同时只有一只主桌宠"的不变量。
"""
from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.pet import Pet


class PetStore:
    def __init__(self, db: Session):
        self._db = db

    # ─── 创建 ──────────────────────────────────────────────────────────────

    def create_from_preset(self, *, user_id: int, preset: dict) -> Pet:
        """从预设实例化一只桌宠（快照预设字段，之后互不影响）。"""
        pet = Pet(
            user_id=user_id,
            preset_id=preset["id"],
            name=preset["name"],
            personality=preset["personality"],
            tone=preset["tone"],
            actions=list(preset.get("actions") or []),
            system_prompt=preset.get("system_prompt"),
        )
        self._db.add(pet)
        self._db.commit()
        self._db.refresh(pet)
        return pet

    # ─── 读取 ──────────────────────────────────────────────────────────────

    def get(self, user_id: int, pet_id: int) -> Pet | None:
        """按 user 隔离取桌宠。"""
        return self._db.scalar(
            select(Pet).where(Pet.id == pet_id, Pet.user_id == user_id)
        )

    def list_for_user(self, user_id: int) -> Sequence[Pet]:
        """按 id 倒序（最新创建的在前）。"""
        stmt = select(Pet).where(Pet.user_id == user_id).order_by(Pet.id.desc())
        return self._db.scalars(stmt).all()

    def get_active(self, user_id: int) -> Pet | None:
        return self._db.scalar(
            select(Pet).where(Pet.user_id == user_id, Pet.is_active == True)  # noqa: E712
        )

    # ─── 定制修改 ──────────────────────────────────────────────────────────

    def update(self, pet: Pet, patch: dict[str, Any]) -> Pet:
        """原地更新定制字段（只允许 router 过滤后的白名单字段）。"""
        for k, v in patch.items():
            setattr(pet, k, v)
        self._db.commit()
        self._db.refresh(pet)
        return pet

    # ─── 主桌宠切换 ────────────────────────────────────────────────────────

    def set_active(self, user_id: int, pet: Pet) -> Pet:
        """把 pet 设为主桌宠，同时清掉该用户其他桌宠的 active 标记。"""
        self._db.execute(
            update(Pet).where(Pet.user_id == user_id).values(is_active=False)
        )
        pet.is_active = True
        self._db.commit()
        self._db.refresh(pet)
        return pet

    # ─── 删除 ──────────────────────────────────────────────────────────────

    def delete(self, pet: Pet) -> None:
        self._db.delete(pet)
        self._db.commit()
