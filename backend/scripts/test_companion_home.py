"""DAY-168 冒烟：/companion/home 聚合。

先启动服务：.venv/Scripts/python.exe -m uvicorn app.main:app --port 8011
再运行：PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_companion_home.py
"""
import uuid

import httpx

B = "http://127.0.0.1:8011/api/v1"

# 账号 A：无主桌宠、无来信 → pet=null、behavior 有时段值、无邀请
ua = {"username": f"home_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok_a = httpx.post(f"{B}/auth/register", json=ua).json()["access_token"]
Ha = {"Authorization": f"Bearer {tok_a}"}

r = httpx.get(f"{B}/companion/home", headers=Ha, timeout=60)
print("HOME (new user):", r.status_code, r.json())
assert r.status_code == 200
body = r.json()
assert body["pet"] is None
assert body["behavior"] in ("打盹", "伸懒腰", "听歌", "午睡", "歪头看你", "发呆", "等你说话")
assert body["invitation"] is None

# 激活一只预设桌宠 → pet 出现
presets = httpx.get(f"{B}/pets/presets", headers=Ha, timeout=60).json()
pid = presets[0]["id"]
r = httpx.put(f"{B}/pets/active", headers=Ha, json={"petId": pid}, timeout=60)
assert r.status_code == 200, r.text
r = httpx.get(f"{B}/companion/home", headers=Ha, timeout=60)
print("HOME (with pet):", r.json()["pet"], "behavior =", r.json()["behavior"])
assert r.json()["pet"]["name"] == presets[0]["name"]

# 播种未读来信 → 邀请出现（letter 优先于 todo）
import sys
sys.path.insert(0, ".")
from app.db import SessionLocal
from app.services.mailbox.letter_store import LetterStore
from app.services.memory.memory_store import MemoryStore

uid = httpx.get(f"{B}/users/me", headers=Ha).json()["id"]
db = SessionLocal()
LetterStore(db).create_generated(
    user_id=uid, generation_key=f"test_home:{uuid.uuid4().hex}",
    type="greeting", title="早安", body="早。",
)
db.close()
r = httpx.get(f"{B}/companion/home", headers=Ha, timeout=60)
print("HOME (unread letter):", r.json()["invitation"])
assert r.json()["invitation"]["type"] == "letter"

# 无来信但有 surface 待办 → todo 邀请
tok_b = httpx.post(f"{B}/auth/register",
                   json={"username": f"home_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
                   ).json()["access_token"]
Hb = {"Authorization": f"Bearer {tok_b}"}
uid_b = httpx.get(f"{B}/users/me", headers=Hb).json()["id"]
db = SessionLocal()
MemoryStore(db).create(user_id=uid_b, layer="state", kind="待办", depth="surface",
                       content="明天下午3点见朋友", status="pending")
db.close()
r = httpx.get(f"{B}/companion/home", headers=Hb, timeout=60)
print("HOME (todo):", r.json()["invitation"])
assert r.json()["invitation"]["type"] == "todo" and r.json()["invitation"]["count"] == 1

# 越权：无 token
r = httpx.get(f"{B}/companion/home", timeout=60)
assert r.status_code in (401, 403)
print("AUTH: 无 token 被拒 OK")

print("\n=== Companion Home (DAY-168) ALL PASS ===")
