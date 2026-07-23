"""实时语音链路冒烟：验证 /ai/realtime 的鉴权注入 + WS 双向中继（无需真音频）。

    uv run python scripts/ws_smoke.py
成功标准：收到上游 session.created，且发出 session.update 后收到 session.updated
=> 网关<->阶跃 握手/鉴权/中继链路通。
"""
import asyncio
import json

from websockets.asyncio.client import connect

URL = "ws://127.0.0.1:8000/ai/realtime"


async def main() -> None:
    got_created = False
    got_updated = False
    async with connect(URL, max_size=None) as ws:
        # 网关连上阶跃后会自动发默认 session.update；这里再主动发一帧覆盖
        await ws.send(json.dumps({"type": "session.update", "session": {"instructions": "冒烟测试"}}))
        for _ in range(12):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=15)
            except asyncio.TimeoutError:
                break
            evt = json.loads(msg).get("type")
            print("<-", evt)
            if evt == "session.created":
                got_created = True
            elif evt == "session.updated":
                got_updated = True
            elif evt == "error":
                print("   error payload:", msg[:300])
            if got_created and got_updated:
                break
    print("RESULT:", "OK 链路通" if (got_created and got_updated) else "未收齐 created/updated")


if __name__ == "__main__":
    asyncio.run(main())
