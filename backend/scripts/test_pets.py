"""Pets 冒烟测试：预设 → 实例化/定制 → 主桌宠切换 → 交接信 → 越权边界。

走真实 HTTP 路径（对齐 test_conversations.py）。交接信生成优先走 LLM，
没有 STEPFUN_API_KEY 时自动退回模板兜底，端点仍应 200。

先启动服务：cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8011
再运行：PYTHONUTF8=1 .venv/Scripts/python.exe scripts/test_pets.py
"""
import httpx

B = "http://127.0.0.1:8011/api/v1"


def auth(username: str) -> dict:
    u = {"username": username, "password": "pass1234"}
    r = httpx.post(f"{B}/auth/register", json=u)
    if r.status_code == 409:
        r = httpx.post(f"{B}/auth/login", json=u)
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


H = auth("pet_smoke_a")
H2 = auth("pet_smoke_b")
print("AUTH: ok (user A / user B)")

# 1. 预设列表
r = httpx.get(f"{B}/pets/presets", headers=H)
print("PRESETS:", r.status_code, "count=", len(r.json()))
assert r.status_code == 200 and len(r.json()) >= 1, r.text
preset = r.json()[0]
print(f"  first preset: {preset['id']} {preset['name']} actions={preset['actions']}")

# 2. 用预设 id 激活 → 先实例化再设为主桌宠（首次拥有桌宠的入口）
r = httpx.put(f"{B}/pets/active", headers=H, json={"petId": preset["id"]}, timeout=60)
print("ACTIVATE (from preset):", r.status_code)
assert r.status_code == 200, r.text
body = r.json()
pet_a = body["pet"]
assert pet_a["is_active"] is True and pet_a["preset_id"] == preset["id"]
assert body["handoff"] is not None and body["handoff"]["to_pet_id"] == pet_a["id"]
print(f"  pet id={pet_a['id']} name={pet_a['name']}")
print(f"  handoff: {body['handoff']['summary'][:50]}...")

# 3. 我的桌宠列表 + 详情
r = httpx.get(f"{B}/pets", headers=H)
print("LIST:", r.status_code, "count=", len(r.json()))
assert pet_a["id"] in [p["id"] for p in r.json()]

r = httpx.get(f"{B}/pets/{pet_a['id']}", headers=H)
print("DETAIL:", r.status_code, r.json()["name"])
assert r.status_code == 200, r.text

# 4. PATCH 修改定制
r = httpx.patch(f"{B}/pets/{pet_a['id']}", headers=H,
                json={"name": "小默默", "tone": "更软一点，多说短句"})
print("PATCH:", r.status_code)
assert r.status_code == 200, r.text
assert r.json()["name"] == "小默默" and r.json()["tone"] == "更软一点，多说短句"

# 5. 再激活另一只预设 → 触发交接信（旧 → 新）
r = httpx.put(f"{B}/pets/active", headers=H, json={"petId": "bobi"}, timeout=60)
print("SWITCH:", r.status_code)
assert r.status_code == 200, r.text
body = r.json()
pet_b = body["pet"]
h = body["handoff"]
assert pet_b["is_active"] is True
assert h["from_pet_id"] == pet_a["id"] and h["to_pet_id"] == pet_b["id"]
assert h["from_pet_name"] == "小默默"
print(f"  {h['from_pet_name']} -> {h['to_pet_name']}: {h['summary'][:50]}...")

# 6. GET /handoffs 能看到新交接信；GET /pets/active 返回新主桌宠
r = httpx.get(f"{B}/handoffs", headers=H)
print("HANDOFFS:", r.status_code, "count=", len(r.json()))
assert r.status_code == 200 and r.json()[0]["id"] == h["id"], r.text

r = httpx.get(f"{B}/pets/active", headers=H)
print("GET ACTIVE:", r.status_code, r.json()["name"])
assert r.json()["id"] == pet_b["id"], r.text

# 7. 重复激活同一只：不重复生成交接信
r = httpx.put(f"{B}/pets/active", headers=H, json={"petId": pet_b["id"]}, timeout=60)
assert r.status_code == 200 and r.json()["handoff"]["id"] == h["id"], r.text
print("RE-ACTIVATE same pet: ok（无新交接信）")

# 8. 越权边界：B 看不到/改不了/删不了/激活不了 A 的桌宠
for method, path, kw in [
    ("GET", f"/pets/{pet_a['id']}", {}),
    ("PATCH", f"/pets/{pet_a['id']}", {"json": {"name": "hack"}}),
    ("DELETE", f"/pets/{pet_a['id']}", {}),
]:
    r = httpx.request(method, f"{B}{path}", headers=H2, **kw)
    assert r.status_code == 404, f"{method} {path} -> {r.status_code}"
r = httpx.put(f"{B}/pets/active", headers=H2, json={"petId": pet_a["id"]})
assert r.status_code == 404, r.text
r = httpx.get(f"{B}/pets", headers=H2)
assert pet_a["id"] not in [p["id"] for p in r.json()]
print("ISOLATION: 他人 pet 读/改/删/激活均 404，列表不可见")

# 9. 未知预设 / 不存在的 pet id
r = httpx.put(f"{B}/pets/active", headers=H, json={"petId": "no_such_preset"})
assert r.status_code == 404, r.text
r = httpx.get(f"{B}/pets/999999", headers=H)
assert r.status_code == 404, r.text
print("404 边界: ok")

# 10. DELETE 删除主桌宠 → active 变 404
r = httpx.delete(f"{B}/pets/{pet_b['id']}", headers=H)
print("DELETE active pet:", r.status_code)
assert r.status_code == 204, r.text
r = httpx.get(f"{B}/pets/active", headers=H)
assert r.status_code == 404, r.text
print("  删除后 GET /pets/active = 404（无新主桌宠）")

print("\n=== Pets ALL PASS ===")
