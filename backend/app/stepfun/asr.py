"""一次性语音识别：上传的音频字节 -> 阶跃 /audio/asr/sse -> 汇总文本。

用 SSE 接口（JSON + base64），无需公网 URL，适合"一段录音转文字"。
睡前倾倒的边说边转走 WS 流式（见 routers/stt.py 的 /ai/stt/stream）。
"""
import base64
import json
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.stepfun.constants import ASR_SSE


async def transcribe_once(
    audio_bytes: bytes,
    fmt: dict[str, Any],
    language: str = "zh",
    model: Optional[str] = None,
) -> dict[str, Any]:
    """返回 {"text": 完整文本, "usage": 用量}。fmt 见阶跃 format 结构。"""
    s = get_settings()
    body = {
        "audio": {
            "data": base64.b64encode(audio_bytes).decode(),
            "input": {
                "transcription": {
                    "language": language,
                    "model": model or s.step_asr_file_model,
                    "enable_itn": True,
                },
                "format": fmt,
            },
        }
    }
    url = s.stepfun_base_url.rstrip("/") + ASR_SSE
    headers = {**s.auth_header, "Content-Type": "application/json", "Accept": "text/event-stream"}

    text = ""
    usage: Any = None
    async with httpx.AsyncClient(timeout=None) as c:
        async with c.stream("POST", url, headers=headers, json=body) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                data = line[len("data:") :].strip()
                if not data:
                    continue
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                # transcript.text.done 带完整 text + usage；delta 期间 text 累计
                if obj.get("text"):
                    text = obj["text"]
                if obj.get("usage"):
                    usage = obj["usage"]
    return {"text": text, "usage": usage}
