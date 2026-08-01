"""用户画像观察层 API：查看内容信号与当前用户的历史回填。"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.conversation import Conversation, Message
from app.models.content_signal import ContentSignal
from app.models.memory import MemoryItem
from app.models.scene import Scene
from app.models.user import User
from app.services.memory.content_signals import ContentSignalService
from app.models.preference import UserPreference
from app.services.memory.memory_store import MemoryStore
from app.services.memory.profile_consolidation import PROFILE_MARKER_PREFIX, ProfileConsolidator

router = APIRouter(prefix="/api/v1/profile", tags=["user-profile"])

SENSITIVITY_LABELS = {"surface": "日常", "personal": "个人", "vulnerable": "较私密", "core": "很私密"}


class ContentSignalOut(BaseModel):
    id: int
    source_type: str
    source_id: str
    topics: list
    entities: list
    intent: str
    events: list
    state: dict
    repetition_key: str | None
    emotion: dict | None
    confidence: float
    sensitivity: str
    extraction_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfileItemOut(BaseModel):
    id: int
    category: str
    statement: str
    confidence: float
    evidence_count: int
    evidence_sources: list[str]
    sensitivity: str
    updated_at: datetime


class ProfileOut(BaseModel):
    learning_enabled: bool
    items: list[ProfileItemOut]


class ProfileCorrection(BaseModel):
    statement: str


@router.get("/signals", response_model=list[ContentSignalOut])
def list_content_signals(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ContentSignalService(db).list_for_user(user.id, limit=limit)


@router.post("/signals/backfill")
def backfill_content_signals(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """对当前用户的历史来源做有界幂等回填；不读取其他用户内容。"""
    candidates: list[tuple[str, str, str]] = []

    messages = list(db.execute(
        select(Message, Conversation.mode)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == user.id, Message.role == "user")
        .order_by(Message.id.desc()).limit(limit)
    ).all())
    for message, mode in messages:
        source = "voice_call" if mode == "voice_call" else "conversation"
        candidates.append((source, f"message:{message.id}", message.content))

    remaining = max(0, limit - len(candidates))
    if remaining:
        dumps = list(db.scalars(select(MemoryItem).where(
            MemoryItem.user_id == user.id,
            MemoryItem.raw_ref.is_not(None),
            MemoryItem.content.like("[原始倾倒]%"),
        ).order_by(MemoryItem.id.desc()).limit(remaining)).all())
        for item in dumps:
            candidates.append(("brain_dump", f"dump:{item.id}", item.raw_ref or item.content))

    remaining = max(0, limit - len(candidates))
    if remaining:
        scenes = list(db.scalars(select(Scene).where(
            Scene.user_id == user.id,
        ).order_by(Scene.id.desc()).limit(remaining)).all())
        for scene in scenes:
            choices = [str(h.get("choice") or "").strip() for h in (scene.history or []) if isinstance(h, dict)]
            text = "\n".join(x for x in choices if x)
            if text:
                candidates.append(("scene", f"scene:{scene.id}:history", text))

    service = ContentSignalService(db)
    before = len(service.list_for_user(user.id, limit=10_000))
    processed = 0
    for source_type, source_id, text in candidates[:limit]:
        if service.extract(
            user_id=user.id, source_type=source_type, source_id=source_id, text=text,
        ) is not None:
            processed += 1
    after = len(service.list_for_user(user.id, limit=10_000))
    consolidation = ProfileConsolidator(db).consolidate(user.id)
    return {"processed": processed, "created": max(0, after - before), "total": after, "consolidation": consolidation}


def _preference(db: Session, user_id: int) -> UserPreference:
    pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref); db.commit(); db.refresh(pref)
    return pref


def _profile_item_or_404(db: Session, user_id: int, memory_id: int):
    item = MemoryStore(db).get(memory_id)
    if item is None or item.user_id != user_id or item.layer != "profile" or item.is_forgotten or not item.is_latest:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "画像不存在")
    if not any(str(e).startswith(PROFILE_MARKER_PREFIX) for e in (item.entities or [])):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "画像不存在")
    return item


def _profile_out(db: Session, item) -> ProfileItemOut:
    signal_ids = [x for x in (item.provenance or []) if isinstance(x, int)]
    source_rows = list(db.scalars(select(ContentSignal).where(
        ContentSignal.id.in_(signal_ids)
    )).all()) if signal_ids else []
    category = next((str(e) for e in (item.entities or []) if not str(e).startswith(PROFILE_MARKER_PREFIX)), "近期观察")
    return ProfileItemOut(
        id=item.id, category=category, statement=item.surface_text or item.content,
        confidence=item.confidence, evidence_count=len(signal_ids),
        evidence_sources=list(dict.fromkeys(s.source_type for s in source_rows)),
        sensitivity=SENSITIVITY_LABELS.get(item.depth, "个人"), updated_at=item.updated_at,
    )


@router.get("", response_model=ProfileOut)
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = [
        item for item in MemoryStore(db).list_by_layer(user.id, "profile")
        if any(str(e).startswith(PROFILE_MARKER_PREFIX) for e in (item.entities or []))
    ]
    return ProfileOut(
        learning_enabled=_preference(db, user.id).profile_learning_enabled,
        items=[_profile_out(db, item) for item in sorted(items, key=lambda x: x.updated_at, reverse=True)],
    )


@router.post("/consolidate")
def consolidate_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ProfileConsolidator(db).consolidate(user.id)


@router.patch("/{memory_id}", response_model=ProfileItemOut)
def correct_profile(
    memory_id: int, body: ProfileCorrection,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    statement = " ".join(body.statement.split()).strip()
    if not statement:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "请写下你希望我记住的理解")
    item = _profile_item_or_404(db, user.id, memory_id)
    updated = MemoryStore(db).update(item.id, {
        "content": statement, "surface_text": statement, "confidence": 1.0,
    }, actor="user")
    return _profile_out(db, updated)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    memory_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    item = _profile_item_or_404(db, user.id, memory_id)
    MemoryStore(db).forget(item.id, reason="user_delete_profile", event="DELETE", actor="user")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
