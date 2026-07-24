"""DAY-167 扩展冒烟：/scenes/templates + PATCH /scenes/{id} + 角色校准。

先启动服务：.venv/Scripts/python.exe -m uvicorn app.main:app --port 8011
再运行：PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_theater_ext.py
"""
import uuid

import httpx

B = "http://127.0.0.1:8011/api/v1"

u = {"username": f"thx_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok = httpx.post(f"{B}/auth/register", json=u, timeout=30).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}

# ─── templates ───────────────────────────────────────────────────────────────
r = httpx.get(f"{B}/scenes/templates", headers=H, timeout=30)
print("TEMPLATES:", r.status_code, [t["id"] for t in r.json()])
assert r.status_code == 200
ids = [t["id"] for t in r.json()]
assert ids == ["night-call", "dinner-table", "leaving-road"]
assert all(t["title"] and t["desc"] and t["relationships"] and t["colors"] for t in r.json())

# ─── 造一个场景（非流式，走 LLM 或兜底）───────────────────────────────────────
r = httpx.post(f"{B}/scenes", headers=H, timeout=90,
               json={"title": "和妈妈的那顿饭", "people": "妈妈", "place": "家中餐桌",
                     "plot": "她总是否定我的选择，上次又吵了", "intent": "说出没说的话"})
assert r.status_code == 201, r.text
scene = r.json()
sid = scene["id"]
print(f"SCENE: id={sid} title={scene['title']!r}")

# ─── PATCH 补充细节 ───────────────────────────────────────────────────────────
r = httpx.patch(f"{B}/scenes/{sid}", headers=H, timeout=30,
                json={"setting": "家中餐桌，晚饭刚上桌，灯光偏暖"})
print("PATCH:", r.status_code)
assert r.status_code == 200
assert r.json()["setting"] == "家中餐桌，晚饭刚上桌，灯光偏暖"

# ─── 角色校准 ────────────────────────────────────────────────────────────────
r = httpx.post(f"{B}/scenes/{sid}/calibrate", headers=H, timeout=30,
               json={"role_name": "妈妈", "adjustment": "她其实更固执一点，不会先低头"})
print("CALIBRATE:", r.status_code)
assert r.status_code == 200, r.text
body = r.json()
assert "【用户校准】她其实更固执一点" in body["setting"], "校准应写入场景设定"
role = body["role"]
assert role["name"] == "妈妈"
assert "她其实更固执一点，不会先低头" in role["traits"]
assert "校准" in role["notes"]

# 再次校准 → 追加而非覆盖；traits 去重
r = httpx.post(f"{B}/scenes/{sid}/calibrate", headers=H, timeout=30,
               json={"role_name": "妈妈", "adjustment": "她批评完会偷偷看我反应"})
role2 = r.json()["role"]
assert len(role2["traits"]) == 2
assert role2["notes"].count("校准") == 2
print("CALIBRATE x2: 追加+去重 ✓")

# 后续剧情推进使用校准后设定（advance 读库里的 setting）
r = httpx.post(f"{B}/scenes/{sid}/choices", headers=H, timeout=90,
               json={"choice_id": (scene["choices"] or [{"id": "x"}])[0]["id"]})
print("ADVANCE after calibrate:", r.status_code)
assert r.status_code == 200, r.text
# setting 保留校准（推进只改 beats/choices/history）
r = httpx.get(f"{B}/scenes/{sid}", headers=H, timeout=30)
assert "【用户校准】" in r.json()["setting"]
print("ADVANCE: 校准设定随场景保留，供后续生成使用 ✓")

# 越权
tok2 = httpx.post(f"{B}/auth/register",
                  json={"username": f"thx_{uuid.uuid4().hex[:8]}", "password": "pass1234"},
                  timeout=30).json()["access_token"]
H2 = {"Authorization": f"Bearer {tok2}"}
r = httpx.patch(f"{B}/scenes/{sid}", headers=H2, json={"title": "x"}, timeout=30)
assert r.status_code == 404
r = httpx.post(f"{B}/scenes/{sid}/calibrate", headers=H2,
               json={"role_name": "妈妈", "adjustment": "y"}, timeout=30)
assert r.status_code == 404
print("ISOLATION: 越权 PATCH/calibrate 均 404 ✓")

print("\n=== Theater Ext (DAY-167) ALL PASS ===")
