"""实时通话：WS /ai/realtime。

RN <-> 本网关 <-> 阶跃 realtime。网关注入鉴权，并在连上后自动下发一帧默认
session.update（桌宠人设 / 音色 / server_vad / pcm16）。RN 可再发 session.update
覆盖（voice 除外，阶跃限制不可中途改）。
"""
from fastapi import APIRouter, WebSocket

from app.config import get_settings
from app.stepfun.constants import WS_REALTIME
from app.stepfun.ws_relay import relay

router = APIRouter(prefix="/ai", tags=["realtime"])


@router.websocket("/realtime")
async def realtime(ws: WebSocket):
    await ws.accept()
    s = get_settings()
    url = f"{s.stepfun_ws_base.rstrip('/')}{WS_REALTIME}?model={s.step_realtime_model}"
    default_session = {
        "type": "session.update",
        "session": {
            "modalities": ["text", "audio"],
            "instructions": s.step_realtime_instructions,
            "voice": s.step_realtime_voice,
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "turn_detection": {"type": "server_vad"},
        },
    }
    await relay(ws, url, on_open=default_session)
