"""DAY-171 冒烟：来信附件 + 角色档案结构化字段 REST 读写。

先启动服务：cd backend && uv run uvicorn app.main:app --port 8011
再运行：cd backend && uv run python scripts/test_field_ext.py
"""
import uuid

import httpx

B = "http://127.0.0.1:8011/api/v1"

# ─── 账号 + 播种一封带附件的信 ────────────────────────────────────────────────
u = {"username": f"fld_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok = httpx.post(f"{B}/auth/register", json=u).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}

import sys
sys.path.insert(0, ".")
from app.db import SessionLocal
from app.services.mailbox.letter_store import LetterStore

ATTACH = {"label": "信里夹了一首歌", "title": "Bloom", "artist": "ODESZA",
          "reason": "旋律很慢，适合把今天一点点放下来。"}
db = SessionLocal()
uid = httpx.get(f"{B}/users/me", headers=H).json()["id"]
letter = LetterStore(db).create(
    user_id=uid, type="music", title="给你的歌", body="慢慢听。", attachment=ATTACH,
)
db.close()
print(f"SEED: letter_id={letter.id}")

# ─── HTTP：来信列表/详情带 attachment ─────────────────────────────────────────
r = httpx.get(f"{B}/letters", headers=H)
assert r.status_code == 200, r.text
assert r.json()[0]["attachment"] == ATTACH, r.json()
r = httpx.get(f"{B}/letters/{letter.id}", headers=H)
assert r.json()["attachment"]["title"] == "Bloom"
print("LETTER attachment: list/detail both return PASS")

# ─── 角色档案结构化字段 REST 读写 ──────────────────────────────────────────────
role_payload = {
    "name": "妈妈",
    "relation": "母亲",
    "personality_summary": "说话直接，习惯否定式关心",
    "speaking_style": "语快、反问多",
    "conflict_response": "先提高音量，再沉默",
    "traits": ["关心但不直说", "担心表现为批评"],
    "notes": "",
}
r = httpx.post(f"{B}/role-profiles", headers=H, json=role_payload)
assert r.status_code == 201, r.text
role = r.json()
rid = role["id"]
assert role["personality_summary"] == role_payload["personality_summary"]
assert role["speaking_style"] == role_payload["speaking_style"]
assert role["conflict_response"] == role_payload["conflict_response"]
assert role["traits"] == role_payload["traits"]
print("ROLE create: structured fields returned PASS")

# 列表/详情
r = httpx.get(f"{B}/role-profiles", headers=H)
assert r.status_code == 200 and any(x["id"] == rid for x in r.json())
r = httpx.get(f"{B}/role-profiles/{rid}", headers=H)
assert r.status_code == 200
assert r.json()["name"] == "妈妈"
print("ROLE list/detail PASS")

# PATCH 更新结构化字段（与 notes 并存）
r = httpx.patch(f"{B}/role-profiles/{rid}", headers=H,
                json={"speaking_style": "语速快、爱反问", "notes": "新增备注"})
assert r.status_code == 200, r.text
assert r.json()["speaking_style"] == "语速快、爱反问"
assert r.json()["notes"] == "新增备注"
assert r.json()["personality_summary"] == role_payload["personality_summary"]
print("ROLE patch: structured fields + notes coexist PASS")

# 越权 404
u2 = {"username": f"fld_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok2 = httpx.post(f"{B}/auth/register", json=u2).json()["access_token"]
r = httpx.get(f"{B}/role-profiles/{rid}", headers={"Authorization": f"Bearer {tok2}"})
assert r.status_code == 404
print("ROLE isolation PASS")

# DELETE
r = httpx.delete(f"{B}/role-profiles/{rid}", headers=H)
assert r.status_code == 204
print("ROLE delete PASS")

print("\n=== Field Ext (DAY-171) ALL PASS ===")
