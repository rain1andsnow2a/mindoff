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
from app.services.scene_images import gen_scene_images
from app.services.scene_recommend import PRESET_THEATERS, detect_scene_intent
from app.services.scene_turn_images import schedule_bg_regen

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
    # 方案B-2：即时建场景可指定预置 3D 剧场；合法则落 preset_3d + theater_id
    theater_id: str | None = None
    render_kind: str | None = None


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


class SceneIntentIn(BaseModel):
    text: str  # 用户在通话中刚说的一句（或最近几句）转写


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


def _resolve_theater(theater_id: str | None) -> tuple[str, str | None]:
    """把入参 theater_id 归一化为 (render_kind, theater_id)。

    合法预置舞台 → ("preset_3d", tid)；否则退回默认 ("preset_3d", None)，绝不报错。
    """
    if theater_id and theater_id in PRESET_THEATERS:
        return "preset_3d", theater_id
    return "preset_3d", None


def _persist_opening(
    db: Session,
    user_id: int,
    opening: dict,
    fragment_id: int | None,
    theater_id: str | None = None,
    render_kind: str | None = None,
    bg_image: str | None = None,
    characters: list | None = None,
) -> Scene:
    # render_kind="dynamic_image" 时走 galgame（背景图+立绘），不绑定预置 3D 舞台；
    # 否则按预置舞台归一化为 preset_3d。
    if render_kind == "dynamic_image":
        rk, tid = "dynamic_image", None
    else:
        rk, tid = _resolve_theater(theater_id)
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
        render_kind=rk,
        theater_id=tid,
        bg_image=bg_image,
        characters=characters,
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
    # DAY-228：beats 追加而非整体替换，保住完整对白史，供结算摘要取材
    s.beats = (s.beats or []) + res["beats"]
    s.choices = res["choices"]
    s.history = (s.history or []) + [{"turn": s.turn, "choice": chosen["label"]}]
    db.commit()
    db.refresh(s)
    # DAY-229：galgame 场景推进后异步刷新背景图（旧图保留到新图就绪）
    if not res.get("ended") and s.render_kind == "dynamic_image":
        schedule_bg_regen(s.id)


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
        # DAY-228：beats 追加而非整体替换，保住完整对白史，供结算摘要取材
        sc.beats = (sc.beats or []) + [{"speaker": "旁白", "text": narrative.strip() or "……"}]
        sc.choices = [] if ended else choices
        sc.history = (sc.history or []) + [{"turn": turn, "choice": label}]
        db2.commit()
        # DAY-229：galgame 场景推进后异步刷新背景图（不阻塞 SSE，旧图保留到新图就绪）
        if not ended and sc.render_kind == "dynamic_image":
            schedule_bg_regen(sc.id)
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


@router.post("/detect-intent", response_model=None)
def scene_detect_intent(
    body: SceneIntentIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """通话中·单句实时场景意图识别（方案B-1）。

    纯判定：不写库、不发信。命中时返回 {worth:true, seed, render_kind, theater_id, confidence}，
    否则 {worth:false}。供前端在语音通话里逐句调用，触发「场景邀请提示条」。
    """
    rec = detect_scene_intent(body.text)
    if rec is None:
        return {"worth": False}
    return {
        "worth": True,
        "seed": rec.get("seed"),
        "render_kind": rec.get("render_kind"),
        "theater_id": rec.get("theater_id"),
        "confidence": rec.get("confidence"),
    }


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
        opening = theater.generate_manual(
            title=body.title, people=body.people, place=body.place, plot=body.plot, intent=body.intent)
        # 手动路径也支持 galgame：render_kind=dynamic_image 时并发生成背景图+立绘
        # （失败降级为无图，前端兜底渐变背景，绝不阻断建场景）。
        bg_image: str | None = None
        characters: list | None = None
        if body.render_kind == "dynamic_image":
            bg_image, characters = gen_scene_images(
                title=body.title, people=body.people, place=body.place,
                plot=body.plot, intent=body.intent, setting=opening.get("setting"),
            )
        return _persist_opening(
            db, user.id, opening, None,
            theater_id=body.theater_id, render_kind=body.render_kind,
            bg_image=bg_image, characters=characters,
        )

    uid = user.id
    title = body.title or "重演片刻"
    render_kind, tid = _resolve_theater(body.theater_id)

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
                          choices=choices, history=[], turn=0,
                          render_kind=render_kind, theater_id=tid)
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
        # DAY-228：beats 追加而非整体替换，保住完整对白史，供结算摘要取材
        s.beats = (s.beats or []) + res["beats"]
        s.choices = res["choices"]
        s.history = (s.history or []) + [{"turn": s.turn, "choice": label}]
        db.commit()
        db.refresh(s)
        # DAY-229：galgame 场景推进后异步刷新背景图（旧图保留到新图就绪）
        if not res.get("ended") and s.render_kind == "dynamic_image":
            schedule_bg_regen(s.id)
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


@router.post("/{scene_id}/summary")
def scene_summary(scene_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """生成结算摘要：LLM 根据场景对话史产出 key_quote / companion_comment / action_hint。"""
    s = _get_owned(db, user.id, scene_id)
    summary = theater.summarize({
        "setting": s.setting,
        "beats": s.beats,
        "history": s.history,
    })
    # DAY-228：LLM 失败/返空时 key_quote 退成占位「……」，这里用场景原文补足：
    # 最后一条对白 → 用户最后一次选择；都没有则返回空串，由前端隐藏该区块。
    kq = str(summary.get("key_quote") or "").strip()
    if not kq or kq == "……":
        summary["key_quote"] = _fallback_key_quote(s)
    return summary


def _fallback_key_quote(s: Scene) -> str:
    for b in reversed(s.beats or []):
        if isinstance(b, dict) and (b.get("text") or "").strip():
            return str(b["text"]).strip()[:30]
    for h in reversed(s.history or []):
        if isinstance(h, dict) and (h.get("choice") or "").strip():
            return str(h["choice"]).strip()[:30]
    return ""


@router.delete("/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scene(scene_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _get_owned(db, user.id, scene_id)
    db.delete(s)
    db.commit()
    return None
