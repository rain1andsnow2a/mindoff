"""语音转文字。

- POST /ai/stt        一次性：上传音频文件 -> 文本（走阶跃 SSE 接口）
- WS   /ai/stt/stream 睡前倾倒边说边转：中继阶跃双向流式 ASR

注意（务必转达 RN）：流式转录返回的 transcription.delta.text 是**累计全量文本**，
前端应整体替换展示，不要再追加拼接。
"""
from fastapi import APIRouter, Depends, File, Form, UploadFile, WebSocket
from pydantic import BaseModel

from app.config import get_settings
from app.deps import get_current_user, user_id_from_token
from app.models.user import User
from app.stepfun.asr import transcribe_once
from app.stepfun.constants import WS_ASR_STREAM
from app.stepfun.tts import TtsError, synthesize_and_store
from app.stepfun.ws_relay import relay

router = APIRouter(prefix="/ai", tags=["stt"])


@router.post("/stt")
async def stt(
    file: UploadFile = File(...),
    type: str = Form("wav"),
    rate: int = Form(16000),
    bits: int = Form(16),
    channel: int = Form(1),
    language: str = Form("zh"),
    user: User = Depends(get_current_user),
):
    """一次性识别。type ∈ {wav,mp3,pcm,ogg}；pcm 需 rate/bits/channel。"""
    audio = await file.read()
    fmt: dict = {"type": type}
    if type == "pcm":
        fmt.update({"codec": "pcm_s16le", "rate": rate, "bits": bits, "channel": channel})
    return await transcribe_once(audio, fmt, language=language)


class TtsBody(BaseModel):
    text: str
    voice: str | None = None  # 缺省用 config 的「元气少女」音色


@router.post("/tts")
async def tts(body: TtsBody, user: User = Depends(get_current_user)):
    """桌宠语音回复：文本 -> 阶跃 TTS -> 转存本地，返回 {url}。

    失败返回 {url: null}，前端静默降级（仍保留字幕）。
    """
    try:
        url = await synthesize_and_store(body.text, voice=body.voice)
        return {"url": url}
    except TtsError:
        return {"url": None}


@router.websocket("/stt/stream")
async def stt_stream(ws: WebSocket):
    """双向流式 ASR 中继。客户端按阶跃协议发 session.update /
    input_audio_buffer.append(base64 pcm)；网关回传 transcription.delta/completed。

    需携带 ?token=<access_token>；无效即 4401 关闭，不中继上游付费模型。
    """
    await ws.accept()
    if user_id_from_token(ws.query_params.get("token")) is None:
        await ws.close(code=4401)
        return
    s = get_settings()
    url = f"{s.stepfun_ws_base.rstrip('/')}{WS_ASR_STREAM}?model={s.step_asr_stream_model}"
    await relay(ws, url)
