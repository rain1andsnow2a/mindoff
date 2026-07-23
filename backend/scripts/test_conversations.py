"""Conversations 冒烟测试：对话闭环 + 从会话生成 brain-dump。

走真实 HTTP 路径（对齐 test_phase2.py）。桌宠回应/提取即使没有 STEPFUN_API_KEY
也会走温和兜底，端点仍应 200。

先启动服务：cd backend && uv run uvicorn app.main:app --port 8010
再运行：uv run python scripts/test_conversations.py
"""
import json

import httpx

B = "http://127.0.0.1:8010/api/v1"

# 账号：注册（已存在则登录）
u = {"username": "conv_smoke", "password": "pass1234"}
r = httpx.post(f"{B}/auth/register", json=u)
if r.status_code == 409:
    r = httpx.post(f"{B}/auth/login", json=u)
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
print("AUTH:", r.status_code)

# 1. 开启对话（自由聊聊）
r1 = httpx.post(f"{B}/conversations", headers=H,
                json={"mode": "free_chat", "pet_id": 1})
print("CREATE CONV:", r1.status_code)
conv = r1.json()
cid = conv["id"]
assert r1.status_code == 201, r1.text
print(f"  id={cid} mode={conv['mode']}")

# 2. 发消息（非流式）
r2 = httpx.post(f"{B}/conversations/{cid}/messages", headers=H,
                json={"text": "今天有点累，但还算撑住了。"}, timeout=60)
print("SEND MSG:", r2.status_code)
assert r2.status_code == 200, r2.text
reply = r2.json()["reply"]
print(f"  reply(role={reply['role']}): {reply['content'][:60]}")

# 3. 会话详情 + 消息
r3 = httpx.get(f"{B}/conversations/{cid}", headers=H)
print("DETAIL:", r3.status_code, "messages=", len(r3.json()["messages"]))
assert len(r3.json()["messages"]) == 2, r3.text

# 4. 消息分页
r4 = httpx.get(f"{B}/conversations/{cid}/messages", headers=H, params={"limit": 10})
print("LIST MSGS:", r4.status_code, "count=", len(r4.json()))

# 5. 历史会话列表
r5 = httpx.get(f"{B}/conversations", headers=H)
print("LIST CONV:", r5.status_code, "count=", len(r5.json()))
assert cid in [c["id"] for c in r5.json()]

# 6. 流式发消息（SSE）
with httpx.stream("POST", f"{B}/conversations/{cid}/messages", headers=H,
                  params={"stream": "true"},
                  json={"text": "帮我记住明天要早点睡。"}, timeout=60) as s:
    print("STREAM:", s.status_code)
    events = [ln for ln in s.iter_lines() if ln.startswith("event:")]
    print(f"  sse events={len(events)} (含 token/done)")

# 7. 从会话生成 brain-dump（conversation_id 入口，§12）
with httpx.stream("POST", f"{B}/brain-dumps", headers=H,
                  json={"conversation_id": cid}, timeout=120) as s:
    print("DUMP FROM CONV:", s.status_code)
    kinds = []
    for ln in s.iter_lines():
        if ln.startswith("data:"):
            try:
                d = json.loads(ln[5:].strip())
            except json.JSONDecodeError:
                continue
            if "kind" in d:
                kinds.append(d["kind"])
    print(f"  classified kinds={kinds}")

print("\n=== Conversations ALL PASS ===")
