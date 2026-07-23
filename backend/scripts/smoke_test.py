"""网关冒烟测试：需先启动服务（uv run uvicorn app.main:app）。

    uv run python scripts/smoke_test.py
验证：/health、/ai/chat（普通 / tool calling / SSE 流式）。
"""
import asyncio
import json

import httpx

BASE = "http://127.0.0.1:8000"


async def main() -> None:
    async with httpx.AsyncClient(timeout=60) as c:
        h = await c.get(f"{BASE}/health")
        print("[health]", h.status_code, h.json())

        # 1) 普通文本
        r = await c.post(
            f"{BASE}/ai/chat",
            json={"messages": [{"role": "user", "content": "用一句话温柔地跟我说晚安"}]},
        )
        reply = r.json()["choices"][0]["message"]["content"]
        print("[chat]", r.status_code, "->", reply[:80])

        # 2) tool calling
        tools = [{
            "type": "function",
            "function": {
                "name": "classify",
                "description": "把用户思绪分类",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": ["todo", "emotion", "idea", "summary"]},
                        "content": {"type": "string"},
                    },
                    "required": ["kind", "content"],
                },
            },
        }]
        r = await c.post(
            f"{BASE}/ai/chat",
            json={
                "messages": [{"role": "user", "content": "Classify: I must submit homework at 3pm tomorrow, annoying. Call classify."}],
                "tools": tools,
            },
        )
        tc = r.json()["choices"][0]["message"].get("tool_calls")
        print("[tool]", "OK ->" if tc else "NONE", json.dumps(tc, ensure_ascii=False) if tc else "")

        # 3) SSE 流式
        n = 0
        async with c.stream(
            "POST", f"{BASE}/ai/chat",
            json={"messages": [{"role": "user", "content": "从一数到三"}], "stream": True},
        ) as s:
            async for line in s.aiter_lines():
                if line.startswith("data:") and "[DONE]" not in line:
                    n += 1
        print("[stream]", f"received {n} SSE chunks")


if __name__ == "__main__":
    asyncio.run(main())
