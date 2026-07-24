"""信箱扩展冒烟：Letters / Ephemeral / Treasures / mailbox 聚合。

数据播种直接走 store（来信/寄存的服务端生成不在本 issue 范围），
接口验证全部走真实 HTTP。先启动服务：
    .venv/Scripts/python.exe -m uvicorn app.main:app --port 8011
再运行：PYTHONUTF8=1 .venv/Scripts/python.exe scripts/test_mailbox_ext.py
"""
import uuid
from datetime import datetime, timedelta, timezone

import httpx

B = "http://127.0.0.1:8011/api/v1"

# ─── 账号 ──────────────────────────────────────────────────────────────────
u = {"username": f"mbx_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
r = httpx.post(f"{B}/auth/register", json=u)
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
uid = httpx.get(f"{B}/users/me", headers=H).json()["id"]
print("AUTH:", r.status_code, "uid=", uid)

# ─── 播种：一封信 + 一条三日寄存（情绪，72h 后过期）──────────────────────────
import sys
sys.path.insert(0, ".")
from app.db import SessionLocal
from app.services.letter_store import LetterStore
from app.services.memory_store import MemoryStore

db = SessionLocal()
letter = LetterStore(db).create(
    user_id=uid, type="greeting", title="早安",
    body="昨晚的事我记着呢，今天慢慢来。", pet_id=1,
)
expires = datetime.now(timezone.utc) + timedelta(hours=72)
memo = MemoryStore(db).create(
    user_id=uid, layer="episodic", kind="情绪", depth="personal",
    content="今天开会被老板夸了，有点开心", surface_text="你今天被夸了，心里美滋滋的",
    confidence=0.9, expires_at=expires,
)
db.close()
print(f"SEED: letter_id={letter.id} memory_id={memo.id}")

# ─── Letters ────────────────────────────────────────────────────────────────
r = httpx.get(f"{B}/letters", headers=H)
print("LETTERS LIST:", r.status_code, "count=", len(r.json()))
assert r.status_code == 200 and len(r.json()) == 1

r = httpx.get(f"{B}/letters", headers=H, params={"unread": "true"})
assert len(r.json()) == 1, r.text

r = httpx.get(f"{B}/letters", headers=H, params={"type": "music"})
assert len(r.json()) == 0, r.text

r = httpx.get(f"{B}/letters/{letter.id}", headers=H)
print("LETTER DETAIL:", r.status_code, r.json()["title"])
assert r.status_code == 200

r = httpx.patch(f"{B}/letters/{letter.id}", headers=H, json={"read": True})
print("LETTER READ:", r.status_code, "is_read=", r.json()["is_read"])
assert r.json()["is_read"] is True
r = httpx.get(f"{B}/letters", headers=H, params={"unread": "true"})
assert len(r.json()) == 0, r.text

# ─── Ephemeral ──────────────────────────────────────────────────────────────
r = httpx.get(f"{B}/ephemeral", headers=H)
print("EPHEMERAL LIST:", r.status_code, "count=", len(r.json()))
assert r.status_code == 200 and len(r.json()) == 1
assert r.json()[0]["expires_at"] is not None

# keep → 转入珍藏
r = httpx.post(f"{B}/ephemeral/{memo.id}/keep", headers=H)
print("EPHEMERAL KEEP:", r.status_code, r.json())
assert r.status_code == 201
tid = r.json()["treasure_id"]

# keep 后不再出现在寄存列表
r = httpx.get(f"{B}/ephemeral", headers=H)
assert len(r.json()) == 0, r.text

# ─── Treasures ──────────────────────────────────────────────────────────────
r = httpx.get(f"{B}/treasures", headers=H)
print("TREASURES LIST:", r.status_code, "count=", len(r.json()))
assert len(r.json()) == 1
assert r.json()[0]["source_type"] == "ephemeral"

r = httpx.get(f"{B}/treasures/{tid}", headers=H)
assert r.status_code == 200 and "美滋滋" in r.json()["content"]

# 主动收藏（from memory，快照来源文本）
r = httpx.post(f"{B}/treasures", headers=H,
               json={"source_type": "memory", "source_id": memo.id})
print("TREASURE CREATE:", r.status_code, r.json()["title"])
assert r.status_code == 201
tid2 = r.json()["id"]

r = httpx.delete(f"{B}/treasures/{tid2}", headers=H)
assert r.status_code == 204

# ─── mailbox 聚合 ───────────────────────────────────────────────────────────
r = httpx.get(f"{B}/mailbox", headers=H)
ov = r.json()
print("MAILBOX:", r.status_code,
      {k: ov[k] for k in ("unread_letters_count", "ephemeral_count", "treasures_count")})
assert ov["unread_letters_count"] == 0
assert ov["ephemeral_count"] == 0
assert ov["treasures_count"] == 1

# ─── 越权隔离 ───────────────────────────────────────────────────────────────
u2 = {"username": f"mbx_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok2 = httpx.post(f"{B}/auth/register", json=u2).json()["access_token"]
H2 = {"Authorization": f"Bearer {tok2}"}
r = httpx.get(f"{B}/letters/{letter.id}", headers=H2)
assert r.status_code == 404, r.text
r = httpx.get(f"{B}/treasures/{tid}", headers=H2)
assert r.status_code == 404, r.text
r = httpx.post(f"{B}/ephemeral/{memo.id}/keep", headers=H2)
assert r.status_code == 404, r.text
print("ISOLATION: ok")

# ─── 删除来信 ───────────────────────────────────────────────────────────────
r = httpx.delete(f"{B}/letters/{letter.id}", headers=H)
assert r.status_code == 204
r = httpx.get(f"{B}/letters", headers=H)
assert len(r.json()) == 0
print("LETTER DELETE: ok")

# ephemeral delete 路径（再造一条寄存删掉）
db = SessionLocal()
memo2 = MemoryStore(db).create(
    user_id=uid, layer="episodic", kind="片段", depth="personal",
    content="路过一只很胖的猫", surface_text="你遇到一只很胖的猫",
    confidence=0.9, expires_at=expires,
)
db.close()
r = httpx.get(f"{B}/ephemeral", headers=H)
assert len(r.json()) == 1, r.text
r = httpx.delete(f"{B}/ephemeral/{memo2.id}", headers=H)
assert r.status_code == 204
r = httpx.get(f"{B}/ephemeral", headers=H)
assert len(r.json()) == 0, r.text
print("EPHEMERAL DELETE: ok")

# ───  synthesized letters persistence (DAY-163 fix) ─────────────────────────
# 新建用户：有 surface 记忆但无来信 → /mailbox 应自动合成并落库 Letter
u3 = {"username": f"mbx_synth_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok3 = httpx.post(f"{B}/auth/register", json=u3).json()["access_token"]
H3 = {"Authorization": f"Bearer {tok3}"}
uid3 = httpx.get(f"{B}/users/me", headers=H3).json()["id"]
db = SessionLocal()
MemoryStore(db).create(
    user_id=uid3, layer="state", kind="待办", depth="surface",
    content="下午三点交报告", surface_text="下午三点交报告", status="pending",
)
MemoryStore(db).create(
    user_id=uid3, layer="state", kind="小结", depth="surface",
    content="今天状态不错", surface_text="今天状态不错",
)
db.close()
r = httpx.get(f"{B}/mailbox", headers=H3)
assert r.status_code == 200, r.text
ov3 = r.json()
print("SYNTHESIZED MAILBOX:", ov3["letters_count"], "letters")
assert ov3["letters_count"] > 0, "应有合成的来信"
# 落库验证：GET /letters 能读到，且 type 合法
letters3 = httpx.get(f"{B}/letters", headers=H3).json()
assert len(letters3) == ov3["letters_count"], "mailbox 与 /letters 数量应一致"
for l in letters3:
    assert l["type"] in {"greeting", "reminder"}, f"未知来信类型: {l['type']}"
# 幂等验证：再次调用 /mailbox 不会重复创建
r2 = httpx.get(f"{B}/mailbox", headers=H3)
assert r2.json()["letters_count"] == ov3["letters_count"], "应幂等，不重复生成"
print("SYNTHESIZED LETTERS PERSISTED: ok")

print("\n=== Mailbox Ext ALL PASS ===")
