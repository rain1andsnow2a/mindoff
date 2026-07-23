"""片场服务：重演供给与结算回写（spec phase 4, task 18/19）。

供给 supply：给定候选片段，组装 episodic 上下文 + 相关角色档案（普通笔记）
+ 相关深层（vulnerable/core）记忆，作为视觉小说的剧本动机来源。
记忆系统只提供内容，不涉及渲染（requirements 5.5）。

结算 settle：
- 最小行动 → 新建 surface/待办 记忆（进次日信箱「今日待启」）
- 触碰的期待/领悟 → 关联相关记忆（relation_type=extends）或追加角色档案笔记
- 结算卡：珍藏 → 长久保存；即焚 → 挂短 TTL，会话结束后由 expire_ephemeral 遗忘
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.memory import MemoryItem
from app.models.role_profile import RoleProfile
from app.services.memory_store import MemoryStore

logger = logging.getLogger(__name__)

# 即焚结算卡的近似"会话结束"时长（黑客松简化：1 小时后由过期任务遗忘）
BURN_AFTER_HOURS = 1


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─── 供给 ──────────────────────────────────────────────────────────────────

def supply(db: Session, user_id: int, segment_id: int) -> dict[str, Any] | None:
    """组装片场供给包。片段不存在/不属于该用户/已遗忘时返回 None。"""
    frag = MemoryStore(db).get(segment_id)
    if frag is None or frag.user_id != user_id or frag.is_forgotten:
        return None

    entities = set(frag.entities or [])
    text = f"{frag.content} {frag.surface_text}"

    # 相关角色档案：名字出现在片段 entities 或文本里
    roles = list(db.scalars(
        select(RoleProfile).where(RoleProfile.user_id == user_id)
    ).all())
    matched_roles = [r for r in roles if r.name and (r.name in entities or r.name in text)]

    # 相关深层记忆（vulnerable/core）：entities 交集，或提及匹配角色
    role_names = [r.name for r in matched_roles]
    deep_memories: list[MemoryItem] = []
    for depth in ("vulnerable", "core"):
        for m in MemoryStore(db).list_by_depth(user_id, depth):
            if m.id == frag.id:
                continue
            m_entities = set(m.entities or [])
            m_text = f"{m.content} {m.surface_text}"
            if (entities & m_entities) or any(n in m_text for n in role_names):
                deep_memories.append(m)

    return {
        "fragment": frag,
        "roles": matched_roles,
        "deep_memories": deep_memories,
    }


# ─── 结算回写 ────────────────────────────────────────────────────────────────

def settle(
    db: Session,
    user_id: int,
    *,
    action_text: str | None = None,
    insight_text: str | None = None,
    related_memory_ids: list[int] | None = None,
    role_id: int | None = None,
    keep: bool = True,
    card_text: str | None = None,
    actor: str = "stage",
) -> dict[str, Any]:
    """结算回写。返回各产出引用的 id。"""
    store = MemoryStore(db)
    related_memory_ids = related_memory_ids or []
    result: dict[str, Any] = {"action_memory_id": None, "insight_memory_id": None,
                              "role_note_appended": False, "card_memory_id": None}

    # 1) 最小行动 → surface/待办（进次日信箱「今日待启」，requirements 5.3）
    if action_text:
        action = store.create(
            user_id=user_id, layer="state", kind="待办", depth="surface",
            content=action_text,
            surface_text=f"重演之后，你想：{action_text}",
            provenance=[*related_memory_ids], status="pending", actor=actor,
        )
        result["action_memory_id"] = action.id

    # 2) 领悟 → 关联相关记忆 / 角色档案笔记
    if insight_text:
        anchor_id = related_memory_ids[0] if related_memory_ids else None
        insight = store.create(
            user_id=user_id, layer="episodic", kind="小结", depth="personal",
            content=insight_text,
            surface_text=insight_text,
            confidence=0.9,
            relation_type="extends" if anchor_id else None,
            relation_to_id=anchor_id,
            provenance=[*related_memory_ids], actor=actor,
        )
        result["insight_memory_id"] = insight.id

        if role_id is not None:
            role = db.get(RoleProfile, role_id)
            if role is not None and role.user_id == user_id:
                stamp = _utcnow().date().isoformat()
                role.notes = (role.notes + f"\n[{stamp} 重演领悟] {insight_text}").strip()
                db.commit()
                result["role_note_appended"] = True

    # 3) 结算卡：珍藏长久保存 / 即焚短 TTL（requirements 5.4）
    if card_text:
        expires = None if keep else _utcnow() + timedelta(hours=BURN_AFTER_HOURS)
        card = store.create(
            user_id=user_id, layer="episodic", kind="小结", depth="personal",
            content=card_text,
            surface_text=card_text,
            provenance=[*related_memory_ids],
            expires_at=expires, actor=actor,
        )
        result["card_memory_id"] = card.id

    return result
