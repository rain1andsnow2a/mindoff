"""睡前倾倒 REST 接口。

POST /api/v1/brain-dumps → SSE 流式回执（边分类边推 item.classified → receipt → done）。
GET  /api/v1/brain-dumps/{id} → 事后回取回执（status + 产出项引用，§5）。
"""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.deps import get_current_user
from app.models.memory import MemoryItem
from app.models.user import User
from app.services.conversation_store import ConversationStore
from app.services.dump_ingest import KIND_TO_OUTPUT, OUTPUT_KEYS, ingest_dump
from app.services.memory_store import MemoryStore

router = APIRouter(prefix="/api/v1/brain-dumps", tags=["brain-dumps"])


class BrainDumpRequest(BaseModel):
    text: str | None = None
    audio_ref: str | None = None       # 预留：语音引用
    conversation_id: int | None = None  # 把一段对话喂进来（§12 决策）


def _assemble_dump_text(db: Session, user: User, body: BrainDumpRequest) -> str:
    """决定这次倾倒的原始文本：显式 text 优先，其次从会话拼装用户发言。"""
    if body.text and body.text.strip():
        return body.text
    if body.conversation_id is not None:
        conv = ConversationStore(db).get(user.id, body.conversation_id)
        if conv is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")
        user_turns = [
            m["content"]
            for m in ConversationStore(db).history_as_dicts(body.conversation_id)
            if m["role"] == "user" and m["content"].strip()
        ]
        if not user_turns:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "会话里没有可整理的发言")
        return "\n".join(user_turns)
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "需要 text 或 conversation_id")


@router.post("")
async def create_brain_dump(
    body: BrainDumpRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """一次倾倒 → 返回 text/event-stream，边分类边推事件。

    入口三选一（§5）：text / audio_ref（预留）/ conversation_id。
    """
    dump_text = _assemble_dump_text(db, user, body)

    def event_stream():
        db: Session = SessionLocal()
        try:
            gen = ingest_dump(db, user_id=user.id, dump_text=dump_text,
                              raw_ref=body.audio_ref)
            for event in gen:
                evt_type = event.get("event", "message")
                data = json.dumps(event.get("data", {}), ensure_ascii=False)
                yield f"event: {evt_type}\ndata: {data}\n\n"
        finally:
            db.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/{dump_id}")
def get_brain_dump(
    dump_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """事后回取（§5）：status(processing|done) + 回执 + 产出项引用。

    产出项引用按 kind 分流：待办→todos、小结→summary、灵感→ideas、
    情绪→emotions、片段→candidates（片场候选片段，§7.1）。
    """
    store = MemoryStore(db)
    root = store.get(dump_id)
    if root is None or root.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dump not found")

    # 找所有 provenance 包含 dump_id 的记忆
    stmt = select(MemoryItem).where(
        MemoryItem.user_id == root.user_id,
        MemoryItem.is_forgotten == False,  # noqa: E712
        MemoryItem.is_latest == True,  # noqa: E712
    )
    all_items = list(db.scalars(stmt).all())
    children = [i for i in all_items if i.provenance and dump_id in i.provenance]

    kind_counts: dict[str, int] = {}
    outputs: dict[str, list[int]] = {k: [] for k in OUTPUT_KEYS}
    items_out = []
    for c in children:
        kind_counts[c.kind] = kind_counts.get(c.kind, 0) + 1
        key = KIND_TO_OUTPUT.get(c.kind)
        if key:
            outputs[key].append(c.id)
        items_out.append({
            "memory_id": c.id,
            "layer": c.layer,
            "kind": c.kind,
            "depth": c.depth,
            "content": c.content,
            "surface_text": c.surface_text,
        })

    return {
        "dump_id": dump_id,
        # 旧数据无标记，视为已完成
        "status": root.status or "done",
        "total": len(children),
        "kind_counts": kind_counts,
        "outputs": outputs,
        "items": items_out,
    }
