"""实时通话：WS /ai/realtime。

RN <-> 本网关 <-> 阶跃 realtime。网关注入鉴权，并在连上后自动下发一帧默认
session.update（桌宠人设 / 音色 / server_vad / pcm16）。RN 可再发 session.update
覆盖（voice 除外，阶跃限制不可中途改）。

session.instructions 优先使用当前主桌宠的 system_prompt；无桌宠时回退全局默认。
需携带 ?token=<access_token>；无效即 4401 关闭，不中继上游付费实时模型。
"""
from fastapi import APIRouter, WebSocket

from app.config import get_settings
from app.db import SessionLocal
from app.deps import user_id_from_token
from app.models.user import User
from app.services.conversation_store import ConversationStore
from app.services.pet_store import PetStore
from app.stepfun.constants import WS_REALTIME
from app.stepfun.ws_relay import extract_transcript, relay

router = APIRouter(prefix="/ai", tags=["realtime"])


def _active_pet(user_id: int | None):
    """取用户当前主桌宠（id 与 system_prompt）；无用户/无桌宠返回 (None, None)。"""
    if user_id is None:
        return None, None
    db = SessionLocal()
    try:
        pet = PetStore(db).get_active(user_id)
        if pet is None:
            return None, None
        return pet.id, pet.system_prompt
    finally:
        db.close()


def persist_voice_call(
    user_id: int,
    transcript: list[tuple[str, str]],
    pet_id: int | None = None,
) -> int | None:
    """把一次语音通话的转写落库为 voice_call 会话。

    - transcript 为空 → 不落库（返回 None），避免脏记录。
    - 任何异常静默吞掉（落库失败不影响通话本身已结束的事实）。
    """
    if not transcript:
        return None
    db = SessionLocal()
    try:
        store = ConversationStore(db)
        conv = store.create(user_id=user_id, mode="voice_call", pet_id=pet_id)
        for role, text in transcript:
            store.add_message(conv.id, role=role, content=text)
        return conv.id
    except Exception:  # noqa: BLE001
        return None
    finally:
        db.close()


@router.websocket("/realtime")
async def realtime(ws: WebSocket):
    """实时通话中继：鉴权 -> 下发默认 session.update -> 双向转发，
    通话结束后把转写落库为 voice_call 会话。"""
    await ws.accept()

    # 强制鉴权：token 无效即拒绝中继，避免服务端 key 被匿名消耗
    token = ws.query_params.get("token")
    user_id = user_id_from_token(token)
    if user_id is None:
        await ws.close(code=4401)
        return

    s = get_settings()
    url = f"{s.stepfun_ws_base.rstrip('/')}{WS_REALTIME}?model={s.step_realtime_model}"

    # 优先用主桌宠人设；无桌宠时回退全局默认
    pet_id, pet_prompt = _active_pet(user_id)
    instructions = pet_prompt or s.step_realtime_instructions

    default_session = {
        "type": "session.update",
        "session": {
            "modalities": ["text", "audio"],
            "instructions": instructions,
            "voice": s.step_realtime_voice,
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "turn_detection": {"type": "server_vad"},
        },
    }

    # 旁路缓冲：转写事件按到达顺序累积，通话结束后统一落库
    transcript: list[tuple[str, str]] = []

    def _capture(msg: str) -> None:
        item = extract_transcript(msg)
        if item is None:
            return
        # 同一轮回复可能同时发 response.text.done 与 response.audio_transcript.done，
        # 内容相同时只记一条（去除紧邻重复）。
        if transcript and transcript[-1] == item:
            return
        transcript.append(item)

    try:
        await relay(ws, url, on_open=default_session, on_upstream_text=_capture)
    finally:
        persist_voice_call(user_id, transcript, pet_id=pet_id)
