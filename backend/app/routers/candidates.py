"""片场候选片段 Candidates：待确认候选的读 + 确认/忽略。见 docs/api-design.md §7.1。

候选 = memory_items 里 kind=片段、由倾倒提取产生（raw_ref 为空，排除原始倾倒 root 记录）、
尚未确认（status 空/pending/candidate）的条目。产品 §4.4：候选当晚静默入草稿箱、次日提醒确认。

确认后转为正式 scene 属于「片场」层，本轮只做状态流转（scene 生成留 TODO）。
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.deps import get_current_user
from app.graphs import theater
from app.models.memory import MemoryItem
from app.models.scene import Scene
from app.models.user import User
from app.services import stage
from app.services.memory_store import MemoryStore

router = APIRouter(prefix="/api/v1/candidates", tags=["candidates"])

# 视为"待确认"的 status 值（None 表示提取时未显式赋状态）
_PENDING = ("pending", "candidate")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class CandidateOut(BaseModel):
    id: int
    content: str
    surface_text: str
    status: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


def _pending_stmt(user_id: int):
    return select(MemoryItem).where(
        MemoryItem.user_id == user_id,
        MemoryItem.kind == "片段",
        MemoryItem.raw_ref.is_(None),  # 排除原始倾倒 root（那条 kind 也是片段但带 raw_ref）
        MemoryItem.is_latest == True,  # noqa: E712
        MemoryItem.is_forgotten == False,  # noqa: E712
        or_(MemoryItem.status.is_(None), MemoryItem.status.in_(_PENDING)),
    )


def _get_owned(db: Session, user_id: int, candidate_id: int) -> MemoryItem:
    item = db.scalar(_pending_stmt(user_id).where(MemoryItem.id == candidate_id))
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "候选片段不存在或已处理")
    return item


@router.get("", response_model=list[CandidateOut])
def list_candidates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """待确认候选（草稿箱）。"""
    return list(db.scalars(_pending_stmt(user.id).order_by(MemoryItem.created_at.desc())).all())


@router.post("/{candidate_id}/confirm")
def confirm_candidate(
    candidate_id: int,
    stream: bool = Query(False, description="true 走 SSE 逐字揭幕开场"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """确认候选 → 标记 confirmed，并生成正式片场场景（供给包 + LLM 开场）。

    `?stream=true` 时逐 token 揭幕开场（SSE：confirmed → token… → choices → done）。
    """
    frag = _get_owned(db, user.id, candidate_id)
    MemoryStore(db).set_status(candidate_id, "confirmed", actor="user")
    pkg = stage.supply(db, user.id, candidate_id)

    if not stream:
        if pkg is None:
            return {"id": candidate_id, "status": "confirmed", "scene": None,
                    "note": "已确认，但供给包组装失败，暂未生成场景"}
        opening = theater.generate_opening(pkg)
        scene = Scene(
            user_id=user.id, title=opening["title"], status="active",
            source_fragment_id=candidate_id, setting=opening["setting"],
            beats=opening["beats"], choices=opening["choices"], history=[], turn=0,
        )
        db.add(scene)
        db.commit()
        db.refresh(scene)
        return {
            "id": candidate_id, "status": "confirmed",
            "scene": {"id": scene.id, "title": scene.title, "setting": scene.setting,
                      "beats": scene.beats, "choices": scene.choices},
        }

    # 流式揭幕
    uid = user.id
    title = ((frag.surface_text or frag.content or "重演片刻").strip())[:30]
    desc = theater.pkg_desc(pkg) if pkg else None

    def gen():
        yield _sse("confirmed", {"candidate_id": candidate_id})
        if desc is None:
            yield _sse("done", {"scene_id": None, "note": "供给失败，未生成场景"})
            return
        db2 = SessionLocal()
        try:
            narrative, choices = "", []
            for kind, val in theater.stream_opening_tokens(desc):
                if kind == "token":
                    narrative += val
                    yield _sse("token", {"delta": val})
                elif kind == "choices":
                    choices = val
                    yield _sse("choices", {"choices": val})
            scene = Scene(
                user_id=uid, title=title, status="active",
                source_fragment_id=candidate_id, setting="",
                beats=[{"speaker": "旁白", "text": narrative.strip()}],
                choices=choices, history=[], turn=0,
            )
            db2.add(scene)
            db2.commit()
            db2.refresh(scene)
            yield _sse("done", {"scene_id": scene.id})
        finally:
            db2.close()

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_candidate(
    candidate_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """忽略候选 → 遗忘（写 FORGET 历史，不再召回）。"""
    _get_owned(db, user.id, candidate_id)
    MemoryStore(db).forget(candidate_id, reason="candidate_dismissed", actor="user")
    return None
