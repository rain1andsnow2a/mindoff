"""通用双向 WebSocket 中继——本层复用核心。

RN 端 <-> 本网关 <-> 阶跃 WS。连接阶跃时注入 Authorization（key 只在服务端，
前端永远拿不到）。`/ai/realtime` 与 `/ai/stt/stream` 都用它，只是上游 URL 和
连接时的首帧配置不同。
"""
import asyncio
import json
from typing import Any, Optional

from websockets.asyncio.client import connect

from app.config import get_settings


async def relay(
    client_ws,
    upstream_url: str,
    on_open: Optional[dict[str, Any]] = None,
) -> None:
    """双向泵消息，直到任一端断开。

    - client_ws: 已 accept 的 FastAPI WebSocket。
    - upstream_url: 阶跃 WS 完整地址（含必要 query）。
    - on_open: 连上上游后先发的一帧（如默认 session.update），可为空。
    """
    s = get_settings()
    headers = {"Authorization": f"Bearer {s.stepfun_api_key}"}

    async with connect(upstream_url, additional_headers=headers, max_size=None) as up:
        if on_open is not None:
            await up.send(json.dumps(on_open))

        async def client_to_up() -> None:
            try:
                while True:
                    msg = await client_ws.receive_text()
                    await up.send(msg)
            except Exception:
                pass

        async def up_to_client() -> None:
            try:
                async for msg in up:
                    if isinstance(msg, bytes):
                        await client_ws.send_bytes(msg)
                    else:
                        await client_ws.send_text(msg)
            except Exception:
                pass

        tasks = {asyncio.create_task(client_to_up()), asyncio.create_task(up_to_client())}
        _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
