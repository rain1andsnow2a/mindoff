"""流式语音中继的错误边界回归测试（不连接真实上游）。"""
import asyncio
import json
import logging
from types import SimpleNamespace

from websockets.datastructures import Headers
from websockets.exceptions import InvalidStatus
from websockets.http11 import Response

import app.stepfun.ws_relay as ws_relay
from app.core.logging import AccessTokenRedactionFilter
from app.routers.ai.stt import _claim_stream, _release_stream


class FakeClientWebSocket:
    def __init__(self) -> None:
        self.messages: list[str] = []
        self.close_code: int | None = None

    async def send_text(self, message: str) -> None:
        self.messages.append(message)

    async def close(self, code: int) -> None:
        self.close_code = code


class RejectConnection:
    async def __aenter__(self):
        response = Response(429, "Too Many Requests", Headers())
        raise InvalidStatus(response)

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None


async def main() -> None:
    original_connect = ws_relay.connect
    original_settings = ws_relay.get_settings
    ws_relay.connect = lambda *args, **kwargs: RejectConnection()
    ws_relay.get_settings = lambda: SimpleNamespace(stepfun_api_key="test-key")
    try:
        client = FakeClientWebSocket()
        await ws_relay.relay(client, "wss://example.invalid/stt")
    finally:
        ws_relay.connect = original_connect
        ws_relay.get_settings = original_settings

    assert client.close_code == 1013
    assert len(client.messages) == 1
    frame = json.loads(client.messages[0])
    assert frame["type"] == "error"
    assert frame["error"]["code"] == "upstream_rate_limited"
    assert frame["error"]["retry_after_ms"] == 3000
    assert "test-key" not in client.messages[0]

    user_id = 987654
    assert await _claim_stream(user_id) is True
    assert await _claim_stream(user_id) is False
    await _release_stream(user_id)
    assert await _claim_stream(user_id) is True
    await _release_stream(user_id)

    record = logging.LogRecord(
        "uvicorn.error",
        logging.INFO,
        __file__,
        1,
        '%s - "WebSocket %s" [accepted]',
        ("127.0.0.1:1234", "/ai/stt/stream?token=secret-value&model=test"),
        None,
    )
    AccessTokenRedactionFilter().filter(record)
    rendered = record.getMessage()
    assert "secret-value" not in rendered
    assert "token=[REDACTED]&model=test" in rendered
    print("ws relay errors: all assertions passed")


if __name__ == "__main__":
    asyncio.run(main())
