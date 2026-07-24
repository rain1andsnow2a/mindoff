"""对话 Conversations REST 接口。见 docs/api-design.md §4。

文本对话 + 历史持久化。桌宠回应内部走 LangGraph（app/graphs/companion.py）。
- POST /conversations                开启对话
- GET  /conversations                历史列表
- GET  /conversations/{id}           详情 + 消息
- POST /conversations/{id}/messages  发消息 → 桌宠回应；?stream=true 走 SSE
- GET  /conversations/{id}/messages  消息分页

实时语音走 /ai/realtime（前端直连网关），不在此。
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.deps import get_current_user
from app.graphs.companion import run_companion, stream_companion
from app.models.conversation import ConversationMode
from app.models.user import User
from app.services.context_builder import build as build_memory_context
from app.services.conversation_store import ConversationStore
from app.services.memory_store import MemoryStore

router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    pet_id: int | None = None
    mode: ConversationMode = ConversationMode.free_chat
    fragment_id: int | None = None  # review_fragment 模式携带


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: int
    mode: str
    pet_id: int | None
    fragment_id: int | None
    title: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationOut):
    messages: list[MessageOut] = []


class SendMessageRequest(BaseModel):
    text: str


# ─── 内部工具 ────────────────────────────────────────────────────────────────

def _load_fragment_context(db: Session, conv) -> str | None:
    """review_fragment 模式下取片段文本，注入桌宠上下文。"""
    if conv.mode != ConversationMode.review_fragment.value or conv.fragment_id is None:
        return None
    frag = MemoryStore(db).get(conv.fragment_id)
    # 只在片段属于同一用户时才带入（隐私隔离）
    if frag is None or frag.user_id != conv.user_id or frag.is_forgotten:
        return None
    return frag.surface_text or frag.content


def _require_conversation(db: Session, user: User, conv_id: int):
    conv = ConversationStore(db).get(user.id, conv_id)
    if conv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")
    return conv


def _memory_context(db: Session, user_id: int, query: str) -> str | None:
    """按当前输入召回记忆上下文（结构化 + 向量语义）。best-effort，无实际记忆则返回 None。"""
    try:
        ctx = build_memory_context(db, user_id, mode="full", query=query)
    except Exception:  # noqa: BLE001  记忆上下文失败绝不阻断对话
        return None
    return ctx if "- [" in ctx else None  # 无记忆行时不注入空围栏


# ─── 会话 ────────────────────────────────────────────────────────────────────

@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """开启对话。review_fragment 模式需带 fragment_id。"""
    if body.mode == ConversationMode.review_fragment and body.fragment_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "回看片段模式需要 fragment_id")
    return ConversationStore(db).create(
        user_id=user.id,
        mode=body.mode.value,
        pet_id=body.pet_id,
        fragment_id=body.fragment_id,
    )


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    limit: int = Query(20, ge=1, le=100),
    cursor: int | None = Query(None, description="上一页最小 id，用于向更早翻页"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ConversationStore(db).list_for_user(user.id, limit=limit, cursor=cursor)


@router.get("/{conv_id}", response_model=ConversationDetail)
def get_conversation(
    conv_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """详情 + 全部消息（按时间正序）。"""
    conv = _require_conversation(db, user, conv_id)
    return conv


# ─── 消息 ────────────────────────────────────────────────────────────────────

@router.get("/{conv_id}/messages", response_model=list[MessageOut])
def list_messages(
    conv_id: int,
    limit: int = Query(50, ge=1, le=200),
    cursor: int | None = Query(None, description="上一页最大 id，取之后的消息"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_conversation(db, user, conv_id)
    return ConversationStore(db).list_messages(conv_id, limit=limit, cursor=cursor)


@router.post("/{conv_id}/messages")
def send_message(
    conv_id: int,
    body: SendMessageRequest,
    stream: bool = Query(False, description="true 走 SSE 逐 token 流式"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """发消息 → 桌宠回应。默认返回整条；?stream=true 返回 text/event-stream。"""
    conv = _require_conversation(db, user, conv_id)
    fragment_context = _load_fragment_context(db, conv)
    mode = conv.mode

    if not stream:
        store = ConversationStore(db)
        store.add_message(conv_id, role="user", content=body.text)
        history = store.history_as_dicts(conv_id)
        memory_context = _memory_context(db, user.id, body.text)
        reply_text = run_companion(mode, history, fragment_context, memory_context=memory_context)
        reply = store.add_message(conv_id, role="assistant", content=reply_text)
        return {
            "conversation_id": conv_id,
            "reply": MessageOut.model_validate(reply).model_dump(mode="json"),
        }

    # 流式：生成器自持一个 session（请求 session 会在响应开始后关闭）
    def event_stream():
        db2: Session = SessionLocal()
        try:
            store = ConversationStore(db2)
            store.add_message(conv_id, role="user", content=body.text)
            history = store.history_as_dicts(conv_id)
            memory_context = _memory_context(db2, user.id, body.text)

            parts: list[str] = []
            for delta in stream_companion(mode, history, fragment_context, memory_context=memory_context):
                parts.append(delta)
                data = json.dumps({"delta": delta}, ensure_ascii=False)
                yield f"event: token\ndata: {data}\n\n"

            reply_text = "".join(parts)
            reply = store.add_message(conv_id, role="assistant", content=reply_text)
            done = json.dumps(
                {"message_id": reply.id, "content": reply_text}, ensure_ascii=False
            )
            yield f"event: done\ndata: {done}\n\n"
        finally:
            db2.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
