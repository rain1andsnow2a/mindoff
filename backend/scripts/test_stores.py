"""DAY-162 五类存储冒烟：Todos / Summaries / Ideas / Emotions。"""
from datetime import datetime, timezone

import httpx

B = "http://127.0.0.1:8010/api/v1"

u = {"username": "stores_smoke", "password": "pass1234"}
r = httpx.post(f"{B}/auth/register", json=u)
if r.status_code == 409:
    r = httpx.post(f"{B}/auth/login", json=u)
H = {"Authorization": f"Bearer {r.json()['access_token']}"}
print("AUTH:", r.status_code)

# ── Todos ──
today_iso = datetime.now(timezone.utc).isoformat()
t = httpx.post(f"{B}/todos", headers=H, json={"content": "交季度报告", "due_date": today_iso})
assert t.status_code == 201, t.text
tid = t.json()["id"]
assert t.json()["status"] == "pending"
print("TODO create:", tid, "status=pending")

assert tid in [x["id"] for x in httpx.get(f"{B}/todos", headers=H).json()]
assert tid in [x["id"] for x in httpx.get(f"{B}/todos?status=pending", headers=H).json()]
assert tid not in [x["id"] for x in httpx.get(f"{B}/todos?status=done", headers=H).json()]
assert tid in [x["id"] for x in httpx.get(f"{B}/todos?due=today", headers=H).json()]
print("TODO filters (status/due=today) OK")

p = httpx.patch(f"{B}/todos/{tid}", headers=H, json={"status": "done"})
assert p.status_code == 200 and p.json()["status"] == "done", p.text
# PATCH 走版本链 → 新 id，旧 id 不再是 latest。用最新列表核对状态
done_ids = [x["id"] for x in httpx.get(f"{B}/todos?status=done", headers=H).json()]
assert done_ids, "expected a done todo"
print("TODO patch→done OK, done_ids:", done_ids)
newid = p.json()["id"]
assert httpx.delete(f"{B}/todos/{newid}", headers=H).status_code == 204
assert httpx.get(f"{B}/todos/{newid}", headers=H).status_code == 404
print("TODO delete OK")

# ── Ideas ──
i = httpx.post(f"{B}/ideas", headers=H, json={"content": "睡前语音日记"})
assert i.status_code == 201, i.text
iid = i.json()["id"]
assert iid in [x["id"] for x in httpx.get(f"{B}/ideas", headers=H).json()]
assert httpx.patch(f"{B}/ideas/{iid}", headers=H, json={"content": "睡前语音日记 v2"}).status_code == 200
newiid = httpx.get(f"{B}/ideas", headers=H).json()[0]["id"]
print("IDEA create/list/patch OK")

# ── Summaries（无 POST，用 /memories 造一条 kind=小结）──
s = httpx.post(f"{B}/memories", headers=H, json={
    "layer": "state", "kind": "小结", "depth": "surface",
    "content": "今天整体还行", "surface_text": "今天你过得还不错"})
assert s.status_code == 201, s.text
sid = s.json()["id"]
today_date = datetime.now(timezone.utc).date().isoformat()
assert sid in [x["id"] for x in httpx.get(f"{B}/summaries", headers=H).json()]
assert sid in [x["id"] for x in httpx.get(f"{B}/summaries?date={today_date}", headers=H).json()]
assert httpx.get(f"{B}/summaries/{sid}", headers=H).status_code == 200
assert httpx.patch(f"{B}/summaries/{sid}", headers=H, json={"surface_text": "改写"}).status_code == 200
print("SUMMARY list/date-filter/get/patch OK")

# ── Emotions（GET/DELETE only；用 /memories 造一条 kind=情绪）──
e = httpx.post(f"{B}/memories", headers=H, json={
    "layer": "profile", "kind": "情绪", "depth": "personal",
    "content": "有点焦虑", "surface_text": "你今天有点焦虑",
    "emotion": {"label": "焦虑", "intensity": 0.6}})
assert e.status_code == 201, e.text
eid = e.json()["id"]
assert eid in [x["id"] for x in httpx.get(f"{B}/emotions", headers=H).json()]
assert httpx.get(f"{B}/emotions/{eid}", headers=H).status_code == 200
assert httpx.delete(f"{B}/emotions/{eid}", headers=H).status_code == 204
assert httpx.get(f"{B}/emotions/{eid}", headers=H).status_code == 404
print("EMOTION list/get/delete OK")

# 跨类隔离：todo id 不能从 /ideas 取
assert httpx.get(f"{B}/ideas/{newiid}", headers=H).status_code == 200
assert httpx.get(f"{B}/emotions/{newiid}", headers=H).status_code == 404
print("CROSS-KIND isolation OK")

print("\n=== DAY-162 ALL PASS ===")
