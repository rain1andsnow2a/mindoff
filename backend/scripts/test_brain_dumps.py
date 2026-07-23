"""Brain Dumps 冒烟测试（§5）：POST SSE 流式倾倒 → GET 事后回取。

走真实 HTTP 路径（对齐 test_conversations.py）。验证：
- SSE 事件序列：item.classified* → receipt → done
- GET /brain-dumps/{id} 返回 status=done，且含产出项引用
  outputs（todos/summary/ideas/emotions/candidates 的 id 列表）
- GET 带鉴权：他人 dump 不可读（404）

提取没有 STEPFUN_API_KEY 时走温和兜底（fallback=True），此时只验结构不验条数。

先启动服务：cd backend && uv run uvicorn app.main:app --port 8011
再运行：uv run python scripts/test_brain_dumps.py
"""
import json

import httpx

B = "http://127.0.0.1:8011/api/v1"

# 账号：注册（已存在则登录）
u = {"username": "dump_smoke", "password": "pass1234"}
r = httpx.post(f"{B}/auth/register", json=u)
if r.status_code == 409:
    r = httpx.post(f"{B}/auth/login", json=u)
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
print("AUTH:", r.status_code)

# 1. POST /brain-dumps（text 入口）→ SSE
dump_text = (
    "明天上午十点要陪妈妈去医院复查，别忘了。今天项目评审被怼了一顿，心里挺不是滋味的。"
    "突然想到可以给 App 加个语音倾倒的功能。周末想去趟郊外走走，就我自己。"
)
events: list[tuple[str, dict]] = []
with httpx.stream("POST", f"{B}/brain-dumps", headers=H,
                  json={"text": dump_text}, timeout=120) as s:
    print("POST DUMP:", s.status_code)
    assert s.status_code == 200, s.read()
    cur_event = "message"
    for ln in s.iter_lines():
        if ln.startswith("event:"):
            cur_event = ln[6:].strip()
        elif ln.startswith("data:"):
            try:
                d = json.loads(ln[5:].strip())
            except json.JSONDecodeError:
                continue
            events.append((cur_event, d))

names = [e for e, _ in events]
classified = [d for e, d in events if e == "item.classified"]
receipts = [d for e, d in events if e == "receipt"]
print(f"  sse events={names}")
assert "receipt" in names, "缺 receipt 事件"
assert names[-1] == "done", "最后一个事件应为 done"
receipt = receipts[-1]
dump_id = receipt["dump_id"]
print(f"  dump_id={dump_id} total={receipt['total']} fallback={receipt['fallback']}")
print(f"  kind_counts={receipt['kind_counts']}")
assert "outputs" in receipt, "receipt 缺 outputs 产出引用"

# 2. GET /brain-dumps/{id} → status=done + 产出项引用
r2 = httpx.get(f"{B}/brain-dumps/{dump_id}", headers=H)
print("GET DUMP:", r2.status_code)
assert r2.status_code == 200, r2.text
got = r2.json()
print(f"  status={got['status']} total={got['total']}")
assert got["status"] == "done", f"status 应为 done，实为 {got['status']}"

outputs = got.get("outputs")
assert outputs is not None, "GET 缺 outputs 产出引用"
for key in ("todos", "summary", "ideas", "emotions", "candidates"):
    assert key in outputs, f"outputs 缺 {key}"
    assert isinstance(outputs[key], list), f"outputs.{key} 应为 id 列表"
print(f"  outputs={ {k: v for k, v in outputs.items()} }")

# 3. 交叉校验：outputs 与 items / SSE 事件一致
out_ids = sorted(i for ids in outputs.values() for i in ids)
item_ids = sorted(i["memory_id"] for i in got["items"])
assert out_ids == item_ids, "outputs 的 id 合集应等于 items 的 memory_id 合集"
sse_ids = sorted(d["memory_id"] for d in classified)
assert sse_ids == item_ids, "GET items 应与 SSE item.classified 一致"
assert got["total"] == len(item_ids) == receipt["total"]
if receipt["fallback"]:
    print("  （无 LLM key，走兜底：只验结构，产出为空）")
else:
    # 片段（片场候选）若被分到，必须出现在 candidates 引用里
    frag_ids = sorted(i["memory_id"] for i in got["items"] if i["kind"] == "片段")
    assert sorted(outputs["candidates"]) == frag_ids, "candidates 引用与片段条目不匹配"
    print(f"  candidates 引用校验通过：{outputs['candidates']}")

# 4. 鉴权：他人不可读
u2 = {"username": "dump_smoke_other", "password": "pass1234"}
r = httpx.post(f"{B}/auth/register", json=u2)
if r.status_code == 409:
    r = httpx.post(f"{B}/auth/login", json=u2)
H2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
r3 = httpx.get(f"{B}/brain-dumps/{dump_id}", headers=H2)
print("GET DUMP (other user):", r3.status_code)
assert r3.status_code == 404, "他人 dump 应 404"

# 5. 无鉴权 → 401/403
r4 = httpx.get(f"{B}/brain-dumps/{dump_id}")
print("GET DUMP (no auth):", r4.status_code)
assert r4.status_code in (401, 403)

print("\n=== Brain Dumps ALL PASS ===")
