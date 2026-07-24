"""片场 Scenes：创建/详情/推进/结算。见 docs/api-design.md §7.2、§7.3。

MVP：单场景单次体验（Scene 自带当前剧情状态），非流式。剧情生成/推进走 app/graphs/theater.py，
结算回写复用 app/services/stage.py 的 settle。均按登录用户隔离。
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.deps import get_current_user
from app.graphs import theater
from app.models.scene import Scene
from app.models.user import User
from app.services import stage

router = APIRouter(prefix="/api/v1/scenes", tags=["scenes"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ─── Schemas ─────────────────────────────────────────────────────────────────

class SceneCreate(BaseModel):
    title: str | None = None
    people: str | None = None
    place: str | None = None
    plot: str | None = None
    intent: str | None = None


class ChoiceIn(BaseModel):
    choice_id: str


class SettlementIn(BaseModel):
    action_text: str | None = None
    insight_text: str | None = None
    related_memory_ids: list[int] | None = None
    role_id: int | None = None
    keep: bool = True
    card_text: str | None = None


class SceneOut(BaseModel):
    id: int
    title: str
    status: str
    setting: str
    beats: list | None
    choices: list | None
    history: list | None
    turn: int
    source_fragment_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── 内部 ────────────────────────────────────────────────────────────────────

def _get_owned(db: Session, user_id: int, scene_id: int) -> Scene:
    s = db.get(Scene, scene_id)
    if s is None or s.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "场景不存在")
    return s


def _persist_opening(db: Session, user_id: int, opening: dict, fragment_id: int | None) -> Scene:
    s = Scene(
        user_id=user_id,
        title=opening["title"],
        status="active",
        source_fragment_id=fragment_id,
        setting=opening["setting"],
        beats=opening["beats"],
        choices=opening["choices"],
        history=[],
        turn=0,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=list[SceneOut])
def list_scenes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list(db.scalars(
        select(Scene).where(Scene.user_id == user.id).order_by(Scene.id.desc())
    ).all())


@router.post("", response_model=None, status_code=status.HTTP_201_CREATED)
def create_scene(
    body: SceneCreate,
    stream: bool = Query(False, description="true 走 SSE 逐句浮现"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """主动创建场景：用提供的人物/地点/经过/表达生成开场。`?stream=true` 逐句 SSE。"""
    desc = theater.manual_desc(
        title=body.title, people=body.people, place=body.place, plot=body.plot, intent=body.intent
    )
    if not stream:
        return _persist_opening(db, user.id, theater.generate_manual(
            title=body.title, people=body.people, place=body.place, plot=body.plot, intent=body.intent), None)

    uid = user.id
    title = body.title or "重演片刻"

    def gen():
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
            scene = Scene(user_id=uid, title=title, status="active", source_fragment_id=None,
                          setting="", beats=[{"speaker": "旁白", "text": narrative.strip()}],
                          choices=choices, history=[], turn=0)
            db2.add(scene)
            db2.commit()
            db2.refresh(scene)
            yield _sse("done", {"scene_id": scene.id, "status": scene.status, "turn": scene.turn})
        finally:
            db2.close()

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/{scene_id}", response_model=SceneOut)
def get_scene(scene_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_owned(db, user.id, scene_id)


@router.post("/{scene_id}/choices", response_model=None)
def choose(
    scene_id: int,
    body: ChoiceIn,
    stream: bool = Query(False, description="true 走 SSE 逐句浮现"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """提交一次回应选择，推进剧情。`?stream=true` 逐句 SSE。"""
    s = _get_owned(db, user.id, scene_id)
    if s.status == "settled":
        raise HTTPException(status.HTTP_409_CONFLICT, "场景已结算")
    chosen = next((c for c in (s.choices or []) if str(c.get("id")) == body.choice_id), None)
    if chosen is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "无效的选项")

    if not stream:
        res = theater.advance(
            {"setting": s.setting, "beats": s.beats, "history": s.history, "turn": s.turn},
            chosen["label"],
        )
        s.turn = s.turn + 1
        s.beats = res["beats"]
        s.choices = res["choices"]
        s.history = (s.history or []) + [{"turn": s.turn, "choice": chosen["label"]}]
        db.commit()
        db.refresh(s)
        return SceneOut.model_validate(s)

    label = chosen["label"]
    turn = s.turn + 1
    final = turn >= theater.MAX_TURNS

    def gen():
        db2 = SessionLocal()
        try:
            sc = db2.get(Scene, scene_id)
            narrative, choices = "", []
            for kind, val in theater.stream_advance_tokens(
                {"setting": sc.setting, "beats": sc.beats, "history": sc.history, "turn": sc.turn},
                label, final=final,
            ):
                if kind == "token":
                    narrative += val
                    yield _sse("token", {"delta": val})
                elif kind == "choices":
                    choices = val
                    yield _sse("choices", {"choices": val})
            ended = final or not choices
            sc.turn = turn
            sc.beats = [{"speaker": "旁白", "text": narrative.strip() or "……"}]
            sc.choices = [] if ended else choices
            sc.history = (sc.history or []) + [{"turn": turn, "choice": label}]
            db2.commit()
            yield _sse("done", {"scene_id": sc.id, "turn": turn, "ended": ended})
        finally:
            db2.close()

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/{scene_id}/settlement")
def settle_scene(scene_id: int, body: SettlementIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """结束体验 → 结算卡。复用 stage.settle 回写（行动→待办、领悟→记忆、卡→珍藏/即焚）。"""
    s = _get_owned(db, user.id, scene_id)
    result = stage.settle(
        db, user.id,
        action_text=body.action_text,
        insight_text=body.insight_text,
        related_memory_ids=body.related_memory_ids,
        role_id=body.role_id,
        keep=body.keep,
        card_text=body.card_text,
    )
    s.status = "settled"
    s.choices = []
    db.commit()
    return {"scene_id": s.id, "status": "settled", "settlement": result}


@router.delete("/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scene(scene_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _get_owned(db, user.id, scene_id)
    db.delete(s)
    db.commit()
    return None
