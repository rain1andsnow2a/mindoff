"""DAY-171 冒烟：来信附件 + 角色档案结构化字段。

先启动服务：.venv/Scripts/python.exe -m uvicorn app.main:app --port 8011
再运行：PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_field_ext.py
"""
import uuid

import httpx

B = "http://127.0.0.1:8011/api/v1"

# ─── 账号 + 播种一封带附件的信 ────────────────────────────────────────────────
u = {"username": f"fld_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok = httpx.post(f"{B}/auth/register", json=u).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
uid = httpx.get(f"{B}/users/me", headers=H).json()["id"]

import sys
sys.path.insert(0, ".")
from app.db import SessionLocal
from app.models.role_profile import RoleProfile
from app.services.letter_store import LetterStore

ATTACH = {"label": "信里夹了一首歌", "title": "Bloom", "artist": "ODESZA",
          "reason": "旋律很慢，适合把今天一点点放下来。"}
db = SessionLocal()
letter = LetterStore(db).create(
    user_id=uid, type="music", title="给你的歌", body="慢慢听。", attachment=ATTACH,
)
role = RoleProfile(
    user_id=uid, name="妈妈", relation="母亲",
    personality_summary="说话直接，习惯否定式关心",
    speaking_style="语快、反问多",
    conflict_response="先提高音量，再沉默",
    traits=["关心但不直说", "担心表现为批评"],
    notes="",
)
db.add(role)
db.commit()
db.refresh(role)
db.close()
print(f"SEED: letter_id={letter.id} role_id={role.id}")

# ─── HTTP：来信列表/详情带 attachment ─────────────────────────────────────────
r = httpx.get(f"{B}/letters", headers=H)
assert r.status_code == 200, r.text
assert r.json()[0]["attachment"] == ATTACH, r.json()
r = httpx.get(f"{B}/letters/{letter.id}", headers=H)
assert r.json()["attachment"]["title"] == "Bloom"
print("LETTER attachment: 列表/详情均返回 ✓")

# ─── 角色档案结构化字段读写 ────────────────────────────────────────────────────
db = SessionLocal()
r2 = db.get(RoleProfile, role.id)
assert r2.personality_summary == "说话直接，习惯否定式关心"
assert r2.speaking_style == "语快、反问多"
assert r2.conflict_response == "先提高音量，再沉默"
assert r2.traits == ["关心但不直说", "担心表现为批评"]
# 与 notes 并存（stage.settle 的领悟追加路径不受影响）
assert r2.notes == ""
db.close()
print("ROLE 结构化字段: 四字段读写正确，notes 并存 ✓")

print("\n=== Field Ext (DAY-171) ALL PASS ===")
