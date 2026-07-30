"""文本调用：POST /ai/chat。代理阶跃 chat/completions，key 服务端注入。

支持 tools（透传，已验证阶跃 function calling）与 stream（SSE）。
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.deps import get_current_user
from app.models.user import User
from app.stepfun.client import chat_completion, chat_stream

router = APIRouter(prefix="/ai", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    model: Optional[str] = None
    tools: Optional[list[dict[str, Any]]] = None
    tool_choice: Optional[Any] = None
    temperature: Optional[float] = None
    stream: bool = False


def _payload(req: ChatRequest) -> dict[str, Any]:
    p: dict[str, Any] = {"messages": req.messages}
    if req.model:
        p["model"] = req.model
    if req.tools is not None:
        p["tools"] = req.tools
    if req.tool_choice is not None:
        p["tool_choice"] = req.tool_choice
    if req.temperature is not None:
        p["temperature"] = req.temperature
    return p


@router.post("/chat")
async def chat(req: ChatRequest, user: User = Depends(get_current_user)):
    """代理阶跃 chat/completions（非流式直接返回，stream=True 时转 SSE）。

    需登录：服务端注入 key，匿名开放会变成公网免费中继。
    """
    payload = _payload(req)
    if not req.stream:
        return await chat_completion(payload)

    async def gen():
        async for chunk in chat_stream(payload):
            yield f"data: {chunk}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
