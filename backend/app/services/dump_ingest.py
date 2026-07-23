"""睡前倾倒编排服务。

流程：raw_ref 落库 → 调 extractor 图 → 逐条 store.create → 构建回执。
失败兜底：提取失败仍保留 raw_ref，返回「已收到」回执（Property 1）。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Generator

from sqlalchemy.orm import Session

from app.graphs.extractor import run_extractor
from app.services.memory_store import MemoryStore

logger = logging.getLogger(__name__)


@dataclass
class ReceiptItem:
    kind: str
    content: str
    memory_id: int


@dataclass
class DumpReceipt:
    dump_id: int
    total: int
    items: list[ReceiptItem] = field(default_factory=list)
    kind_counts: dict[str, int] = field(default_factory=dict)
    outputs: dict[str, list[int]] = field(default_factory=dict)  # 产出项引用（§5）
    fallback: bool = False  # True = 提取失败，走兜底
    error: str = ""


# kind → 产出引用键（§5/§6/§7.1）：片段即片场候选片段
KIND_TO_OUTPUT = {
    "待办": "todos",
    "小结": "summary",
    "灵感": "ideas",
    "情绪": "emotions",
    "片段": "candidates",
}

OUTPUT_KEYS = ("todos", "summary", "ideas", "emotions", "candidates")


def ingest_dump(db: Session, *, user_id: int, dump_text: str,
                raw_ref: str | None = None) -> Generator[dict[str, Any], None, DumpReceipt]:
    """生成器：边处理边 yield SSE 事件，最终返回 DumpReceipt。

    Yields:
        {"event": "item.classified", "data": {...}}  每分类成功一条
        {"event": "receipt", "data": {...}}          最终回执
        {"event": "done", "data": {}}                结束标记
    """
    store = MemoryStore(db)

    # 1. raw_ref 落库（创建一条 root 记忆作为倾倒原始记录）
    raw_item = store.create(
        user_id=user_id,
        layer="episodic",
        kind="片段",
        depth="surface",
        content=f"[原始倾倒] {dump_text[:200]}...",
        surface_text="你昨晚的一段倾诉",
        confidence=1.0,
        raw_ref=raw_ref or dump_text,
        status="processing",  # 处理中；收尾置 done（GET 回执的 status 语义）
        actor="dump_ingest",
    )
    dump_id = raw_item.id

    # 2. 调 LangGraph extractor
    try:
        facts = run_extractor(dump_text)
    except Exception as e:
        logger.error("Extractor crashed: %s", e)
        facts = []

    # 3. 提取失败 → 兜底回执（处理流程已结束，状态仍为 done）
    if not facts:
        store.set_status(dump_id, "done", actor="dump_ingest")
        receipt = DumpReceipt(
            dump_id=dump_id, total=0, fallback=True,
            outputs={k: [] for k in OUTPUT_KEYS},
            error="提取为空或失败，原始倾诉已安全保留",
        )
        yield {"event": "receipt", "data": _receipt_dict(receipt)}
        yield {"event": "done", "data": {}}
        return receipt

    # 4. 逐条写入 + 流式推送
    items: list[ReceiptItem] = []
    kind_counts: dict[str, int] = {}

    for fact in facts:
        mem = store.create(
            user_id=user_id,
            layer=fact["layer"],
            kind=fact["kind"],
            depth=fact["depth"],
            content=fact["content"],
            surface_text=fact.get("surface_text", ""),
            confidence=fact.get("confidence", 0.8),
            entities=fact.get("entities"),
            emotion=fact.get("emotion"),
            provenance=[dump_id],
            raw_ref=None,  # 子条目不重复存 raw
            actor="extractor",
        )
        ri = ReceiptItem(kind=fact["kind"], content=fact["content"], memory_id=mem.id)
        items.append(ri)
        kind_counts[fact["kind"]] = kind_counts.get(fact["kind"], 0) + 1

        # 流式推送每条分类结果
        yield {
            "event": "item.classified",
            "data": {
                "memory_id": mem.id,
                "layer": fact["layer"],
                "kind": fact["kind"],
                "depth": fact["depth"],
                "content": fact["content"],
                "surface_text": fact.get("surface_text", ""),
            },
        }

    # 5. 构建回执（含产出项引用：todos/summary/ideas/emotions/candidates 的 id）
    outputs: dict[str, list[int]] = {k: [] for k in OUTPUT_KEYS}
    for ri in items:
        key = KIND_TO_OUTPUT.get(ri.kind)
        if key:
            outputs[key].append(ri.memory_id)

    store.set_status(dump_id, "done", actor="dump_ingest")
    receipt = DumpReceipt(
        dump_id=dump_id, total=len(items),
        items=items, kind_counts=kind_counts, outputs=outputs,
    )
    yield {"event": "receipt", "data": _receipt_dict(receipt)}
    yield {"event": "done", "data": {}}
    return receipt


def _receipt_dict(r: DumpReceipt) -> dict:
    return {
        "dump_id": r.dump_id,
        "total": r.total,
        "kind_counts": r.kind_counts,
        "outputs": r.outputs,
        "fallback": r.fallback,
        "error": r.error,
        "items": [{"kind": i.kind, "content": i.content, "memory_id": i.memory_id} for i in r.items],
    }
