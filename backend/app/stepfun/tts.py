"""阶跃语音合成（POST /v1/audio/speech，默认 stepaudio-2.5-tts）。

文档：https://platform.stepfun.com/docs/guides/developer/tts
- 「桌宠语音回复」把桌宠的文字回复读成音频；音色默认「元气少女」(yuanqishaonv)，偏可爱活泼。
- input 上限 1000 字符，超长截断而非报错；默认返回 mp3 二进制流，转存本地供前端播放。
- key 只在服务端使用，绝不下发前端（与 chat/asr 一致）。
- ⚠️ 模型名跟着 base_url 走：Step Plan（step_plan/v1）只有 stepaudio-2.5-tts，
  step-tts-mini 在那里会 404。见 config.step_tts_model 的注释。
"""
import logging
import uuid
from pathlib import Path

import httpx

from app.config import get_settings
from app.stepfun.constants import AUDIO_SPEECH
from app.stepfun.image import STATIC_DIR

logger = logging.getLogger(__name__)

# input 上限（文档：最长 1000 字符），超长截断
MAX_INPUT_CHARS = 1000

# 转存目录：backend/static/tts_audio/
TTS_AUDIO_DIR = STATIC_DIR / "tts_audio"


class TtsError(RuntimeError):
    """语音合成失败（网络/响应异常），上层捕获后走降级（仍有字幕）。"""


def _url() -> str:
    return get_settings().stepfun_base_url.rstrip("/") + AUDIO_SPEECH


def _headers() -> dict[str, str]:
    s = get_settings()
    return {**s.auth_header, "Content-Type": "application/json"}


async def synthesize(
    text: str,
    *,
    voice: str | None = None,
    model: str | None = None,
    speed: float = 1.0,
) -> bytes:
    """调阶跃 TTS，返回音频 bytes（mp3）。失败统一抛 TtsError。"""
    text = (text or "").strip()[:MAX_INPUT_CHARS]
    if not text:
        raise TtsError("input 为空")

    s = get_settings()
    body = {
        "model": model or s.step_tts_model,
        "input": text,
        "voice": voice or s.step_tts_voice,
        "response_format": "mp3",
        "speed": speed,
    }
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(_url(), headers=_headers(), json=body)
            r.raise_for_status()
            return r.content
    except httpx.HTTPError as e:
        raise TtsError(f"语音合成请求失败: {e}") from e


async def synthesize_and_store(
    text: str,
    *,
    voice: str | None = None,
) -> str:
    """合成并转存到 backend/static/tts_audio/，返回相对 URL。

    返回形如 /static/tts_audio/{uuid}.mp3，前端拼 API_BASE 即可播放。
    """
    audio = await synthesize(text, voice=voice)

    TTS_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.mp3"
    path = TTS_AUDIO_DIR / name
    path.write_bytes(audio)
    logger.info("tts audio stored: %s (%d bytes)", path, len(audio))
    return f"/static/tts_audio/{name}"
