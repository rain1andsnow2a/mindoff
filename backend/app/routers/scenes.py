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
    choice_id: str | None = None
    custom_text: str | None = None  # 「自己说」：用户自由输入的回应，优先于 choice_id


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

    # 渲染层（DAY-209）：旧数据缺字段时按 preset_3d 兼容
    render_kind: str = "preset_3d"
    theater_id: str | None = None
    bg_image: str | None = None
    characters: list | None = None

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


def _node(s: Scene) -> dict:
    """把 Scene 当前状态转成视觉小说节点（背景/角色/对话/可选回应）。"""
    speakers = set()
    for b in (s.beats or []):
        if isinstance(b, dict):
            sp = b.get("speaker")
            if sp and sp != "旁白":
                speakers.add(sp)
    return {
        "background": s.setting or "",
        "characters": [{"name": name, "sprite": None} for name in speakers],
        "dialogue": s.beats or [],
        "choices": s.choices or [],
    }


def _play_id_match(s: Scene, play_id: str) -> bool:
    return play_id in (str(s.id), f"play-{s.id}")


def _advance_scene(db: Session, s: Scene, choice_id: str) -> None:
    """非流式：验证选项并用 theater.advance 推进一幕。"""
    chosen = next((c for c in (s.choices or []) if str(c.get("id")) == choice_id), None)
    if chosen is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "无效的选项")
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


def _advance_stream_gen(scene_id: int, label: str, turn: int, final: bool):
    """流式推进的 SSE 生成器（被 /choices 与 /plays/{play_id}/choices 复用）。"""
    db2 = SessionLocal()
    try:
        sc = db2.get(Scene, scene_id)
        if sc is None:
            yield _sse("error", {"message": "场景不存在"})
            return
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


class PlayOut(BaseModel):
    play_id: str
    scene_id: int
    status: str
    turn: int
    node: dict

    model_config = {"from_attributes": True}


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


# ─── Plays 子资源（MVP 下每场 Scene 对应单次体验，play_id 复用 scene_id）────────

@router.post("/{scene_id}/plays", response_model=PlayOut)
def start_play(
    scene_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """开始一次场景体验，返回首个视觉小说节点。"""
    s = _get_owned(db, user.id, scene_id)
    if s.status == "settled":
        raise HTTPException(status.HTTP_409_CONFLICT, "场景已结算")
    return PlayOut(
        play_id=str(s.id), scene_id=s.id, status=s.status,
        turn=s.turn, node=_node(s),
    )


@router.get("/{scene_id}/plays/{play_id}", response_model=PlayOut)
def get_play(
    scene_id: int,
    play_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取某次体验的当前节点。"""
    s = _get_owned(db, user.id, scene_id)
    if not _play_id_match(s, play_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "体验不存在")
    return PlayOut(
        play_id=play_id, scene_id=s.id, status=s.status,
        turn=s.turn, node=_node(s),
    )


@router.post("/{scene_id}/plays/{play_id}/choices", response_model=None)
def play_choose(
    scene_id: int,
    play_id: str,
    body: ChoiceIn,
    stream: bool = Query(False, description="true 走 SSE 逐句浮现"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """在指定体验中提交一次回应，推进剧情。"""
    s = _get_owned(db, user.id, scene_id)
    if not _play_id_match(s, play_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "体验不存在")
    if s.status == "settled":
        raise HTTPException(status.HTTP_409_CONFLICT, "场景已结算")

    chosen = next((c for c in (s.choices or []) if str(c.get("id")) == body.choice_id), None)
    if chosen is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "无效的选项")

    if not stream:
        _advance_scene(db, s, body.choice_id)
        return PlayOut(
            play_id=play_id, scene_id=s.id, status=s.status,
            turn=s.turn, node=_node(s),
        )

    turn = s.turn + 1
    final = turn >= theater.MAX_TURNS
    return StreamingResponse(
        _advance_stream_gen(scene_id, chosen["label"], turn, final),
        media_type="text/event-stream",
    )


@router.post("/{scene_id}/plays/{play_id}/settlement")
def play_settle(
    scene_id: int,
    play_id: str,
    body: SettlementIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """结束本次体验 → 结算卡。"""
    s = _get_owned(db, user.id, scene_id)
    if not _play_id_match(s, play_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "体验不存在")
    if s.status == "settled":
        raise HTTPException(status.HTTP_409_CONFLICT, "场景已结算")
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
    return {"play_id": play_id, "scene_id": s.id, "status": "settled", "settlement": result}


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

    # 「自己说」：自由输入优先；否则按预设选项 id 校验。
    if body.custom_text and body.custom_text.strip():
        label = body.custom_text.strip()[:200]
    else:
        chosen = next((c for c in (s.choices or []) if str(c.get("id")) == body.choice_id), None)
        if chosen is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "无效的选项")
        label = chosen["label"]

    if not stream:
        res = theater.advance(
            {"setting": s.setting, "beats": s.beats, "history": s.history, "turn": s.turn},
            label,
        )
        s.turn = s.turn + 1
        s.beats = res["beats"]
        s.choices = res["choices"]
        s.history = (s.history or []) + [{"turn": s.turn, "choice": label}]
        db.commit()
        db.refresh(s)
        return SceneOut.model_validate(s)

    turn = s.turn + 1
    final = turn >= theater.MAX_TURNS

    return StreamingResponse(
        _advance_stream_gen(scene_id, label, turn, final),
        media_type="text/event-stream",
    )


@router.post("/{scene_id}/settlement")
def settle_scene(scene_id: int, body: SettlementIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """结束体验 → 结算卡。复用 stage.settle 回写（行动→待办、领悟→记忆、卡→珍藏/即焚）。"""
    s = _get_owned(db, user.id, scene_id)
    if s.status == "settled":
        raise HTTPException(status.HTTP_409_CONFLICT, "场景已结算")
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
