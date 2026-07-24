"""实时通话：WS /ai/realtime。

RN <-> 本网关 <-> 阶跃 realtime。网关注入鉴权，并在连上后自动下发一帧默认
session.update（桌宠人设 / 音色 / server_vad / pcm16）。RN 可再发 session.update
覆盖（voice 除外，阶跃限制不可中途改）。

session.instructions 优先使用当前主桌宠的 system_prompt；无桌宠或未鉴权时
回退到全局默认。
"""
from fastapi import APIRouter, WebSocket

from app.config import get_settings
from app.core.security import decode_token
from app.db import SessionLocal
from app.models.user import User
from app.services.pet_store import PetStore
from app.stepfun.constants import WS_REALTIME
from app.stepfun.ws_relay import relay

router = APIRouter(prefix="/ai", tags=["realtime"])


def _user_id_from_token(token: str | None) -> int | None:
    """从 Bearer token 解析用户 id；失败返回 None。"""
    if not token:
        return None
    if token.lower().startswith("bearer "):
        token = token[7:]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return int(payload["sub"])
    except Exception:  # noqa: BLE001
        return None


def _active_pet_system_prompt(user_id: int | None) -> str | None:
    """取用户当前主桌宠的系统提示词；无用户/无桌宠返回 None。"""
    if user_id is None:
        return None
    db = SessionLocal()
    try:
        pet = PetStore(db).get_active(user_id)
        return pet.system_prompt if pet else None
    finally:
        db.close()


@router.websocket("/realtime")
async def realtime(ws: WebSocket):
    await ws.accept()
    s = get_settings()
    url = f"{s.stepfun_ws_base.rstrip('/')}{WS_REALTIME}?model={s.step_realtime_model}"

    # 优先用主桌宠人设；无法取得则回退全局默认
    token = ws.query_params.get("token")
    user_id = _user_id_from_token(token)
    pet_prompt = _active_pet_system_prompt(user_id)
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
    await relay(ws, url, on_open=default_session)
