"""阶跃 chat 接入（OpenAI 兼容）。文本调用的唯一出口，路由与 LangGraph 都可复用。"""
from typing import Any, AsyncIterator

import httpx

from app.config import get_settings
from app.stepfun.constants import CHAT_COMPLETIONS


def _url(path: str) -> str:
    return get_settings().stepfun_base_url.rstrip("/") + path


def _headers() -> dict[str, str]:
    s = get_settings()
    return {**s.auth_header, "Content-Type": "application/json"}


async def chat_completion(payload: dict[str, Any]) -> dict[str, Any]:
    """非流式 chat。payload 为 OpenAI 风格 body（messages/tools/...）。

    未指定 model 时用默认文本模型。返回阶跃原始 JSON（透传，前端拿到标准结构）。
    """
    s = get_settings()
    body = {"model": s.step_text_model, **payload, "stream": False}
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(_url(CHAT_COMPLETIONS), headers=_headers(), json=body)
        r.raise_for_status()
        return r.json()


async def chat_stream(payload: dict[str, Any]) -> AsyncIterator[str]:
    """流式 chat：逐条 yield SSE data 内容（已去掉 'data:' 前缀，含结尾 '[DONE]'）。"""
    s = get_settings()
    body = {"model": s.step_text_model, **payload, "stream": True}
    async with httpx.AsyncClient(timeout=None) as c:
        async with c.stream(
            "POST", _url(CHAT_COMPLETIONS), headers=_headers(), json=body
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                line = line.strip()
                if line.startswith("data:"):
                    yield line[len("data:") :].strip()
