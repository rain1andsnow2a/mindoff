"""深度隐私策略（spec phase 6, task 22）。

Property 9：vulnerable/core 记忆默认 privacy=local（创建时由 DEPTH_DEFAULTS 落），
不进入任何跨设备同步或外部 Provider，除非用户显式授权。
本模块是"外发前"的唯一判定点：任何要把记忆内容发往外部（云端模型以外的
同步、第三方 Provider、导出）的路径都应先过 can_send_external / filter_for_external。
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.memory import MemoryItem
from app.services.memory.memory_store import MemoryStore

# 默认禁止外发的深度（requirements 7.5）
EXTERNAL_FORBIDDEN_DEPTHS = {"vulnerable", "core"}


def can_send_external(item: MemoryItem, *, explicit_consent: bool = False) -> bool:
    """这条记忆能否离开本机（同步/外部 Provider/导出）。

    - vulnerable/core：默认禁止，显式授权才放行（Property 9）
    - privacy=local：默认禁止，显式授权才放行
    - privacy=burn_after_read：永不外发
    """
    if item.privacy == "burn_after_read":
        return False
    if item.depth in EXTERNAL_FORBIDDEN_DEPTHS and not explicit_consent:
        return False
    if item.privacy == "local" and not explicit_consent:
        return False
    return True


def filter_for_external(
    items: list[MemoryItem], *, explicit_consent: bool = False
) -> list[MemoryItem]:
    """外发前过滤：剔除不该离开本机的记忆。"""
    return [i for i in items if can_send_external(i, explicit_consent=explicit_consent)]


def filter_for_cloud_prompt(items: list[MemoryItem]) -> list[MemoryItem]:
    """云端模型 prompt 前过滤：伦理红线——vulnerable/core 与即焚记忆不进外部 LLM。

    与 can_send_external 的区别：同步/导出连 privacy=local（含 personal）都默认拦；
    云端模型 prompt 是产品既定链路（桌宠对话/晚间来信），只拦红线深度与
    burn_after_read。任何拼记忆进外部 LLM prompt 的路径都应先过这里。
    """
    return [
        i for i in items
        if i.depth not in EXTERNAL_FORBIDDEN_DEPTHS and i.privacy != "burn_after_read"
    ]


def burn_after_read(db: Session, memory_id: int, *, actor: str = "system") -> None:
    """阈后即焚：记忆被读取/交还后按策略遗忘（requirements 7.3）。"""
    MemoryStore(db).forget(memory_id, reason="burn_after_read", actor=actor)


def burn_raw_ref(db: Session, memory_id: int, *, actor: str = "system") -> bool:
    """原始倾诉即焚：清空 raw_ref，仅保留整理后的 surface_text（requirements 7.4）。

    raw_ref 属原文快照、非版本链内容，原地清空并写一条 UPDATE 历史。
    """
    store = MemoryStore(db)
    item = store.get(memory_id)
    if item is None or not item.raw_ref:
        return False
    old = item.raw_ref
    item.raw_ref = None
    store._write_history(  # noqa: SLF001  复用 store 的历史写入，保证 Property 4
        memory_id, "UPDATE", actor=actor,
        meta={"field": "raw_ref", "action": "burn", "old_len": len(old)},
    )
    db.commit()
    return True
