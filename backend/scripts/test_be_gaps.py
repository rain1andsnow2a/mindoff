"""BE 缺口联合冒烟：DAY-194 treasure 来源引用 / DAY-193 preferences 扩字段+TTL / DAY-192 来信回信。

先启动服务：.venv/Scripts/python.exe -m uvicorn app.main:app --port 8011
再运行：PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_be_gaps.py
"""
import uuid
from datetime import datetime, timezone

import httpx

B = "http://127.0.0.1:8011/api/v1"

u = {"username": f"gap_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok = httpx.post(f"{B}/auth/register", json=u, timeout=30).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
uid = httpx.get(f"{B}/users/me", headers=H, timeout=30).json()["id"]

# ─── DAY-194：treasure 支持 conversation/scene 来源引用 ──────────────────────
r = httpx.post(f"{B}/treasures", headers=H, timeout=30,
               json={"source_type": "scene", "source_id": 42,
                     "title": "我终于把那句话说了出来", "content": "场景：和妈妈的对话"})
print("TREASURE scene-ref:", r.status_code)
assert r.status_code == 201, r.text
tid_scene = r.json()["id"]
assert r.json()["source_type"] == "scene" and r.json()["source_id"] == 42

r = httpx.post(f"{B}/treasures", headers=H, timeout=30,
               json={"source_type": "conversation", "source_id": 7,
                     "title": "那次长谈", "content": "聊到凌晨两点"})
assert r.status_code == 201, r.text
print("TREASURE conversation-ref: 201 PASS")

# conversation/scene 缺 title/content → 422（不做记忆快照）
r = httpx.post(f"{B}/treasures", headers=H, timeout=30,
               json={"source_type": "scene", "source_id": 42})
assert r.status_code == 422
# memory 快照路径不受影响
import sys
sys.path.insert(0, ".")
from app.db import SessionLocal
from app.services.memory.memory_store import MemoryStore

db = SessionLocal()
mem = MemoryStore(db).create(user_id=uid, layer="state", kind="灵感", depth="personal",
                             content="做个睡前语音日记", surface_text="你冒出一个点子")
db.close()
r = httpx.post(f"{B}/treasures", headers=H, timeout=30,
               json={"source_type": "memory", "source_id": mem.id})
assert r.status_code == 201 and "点子" in r.json()["content"]
print("TREASURE memory snapshot compatible PASS")

# ─── DAY-193：preferences 扩字段 + TTL 生效 ──────────────────────────────────
r = httpx.get(f"{B}/preferences", headers=H, timeout=30)
print("PREF defaults:", r.json())
assert r.json()["ephemeral_ttl_days"] == 7
assert r.json()["font_size"] == "标准"
assert r.json()["companion_tone"] == "温和"
assert r.json()["reduce_transparency"] is False

r = httpx.patch(f"{B}/preferences", headers=H, timeout=30,
                json={"ephemeral_ttl_days": 1, "font_size": "大", "reduce_transparency": True})
assert r.status_code == 200, r.text
assert r.json()["ephemeral_ttl_days"] == 1
print("PREF patch: ttl=1 PASS")

r = httpx.patch(f"{B}/preferences", headers=H, json={"ephemeral_ttl_days": 99}, timeout=30)
assert r.status_code == 422
r = httpx.patch(f"{B}/preferences", headers=H, json={"font_size": "巨"}, timeout=30)
assert r.status_code == 422
print("PREF validation: 422 PASS")

# TTL 真正影响倾倒产物的 expires_at
from app.services.infra.preferences import ttl_days_for
db = SessionLocal()
assert ttl_days_for(db, uid) == 1
db.close()
r = httpx.post(f"{B}/brain-dumps", headers=H, timeout=90,
               json={"text": "今天有点难过，感觉什么都不顺利。"})
evs = [l for l in r.text.split("\n") if l.startswith("data:")]
db = SessionLocal()
from sqlalchemy import select
from app.models.memory import MemoryItem
items = db.scalars(select(MemoryItem).where(
    MemoryItem.user_id == uid, MemoryItem.kind == "情绪",
    MemoryItem.is_latest == True,  # noqa: E712
    MemoryItem.expires_at != None,  # noqa: E711
).order_by(MemoryItem.id.desc())).all()
db.close()
assert items, "情绪应入寄存带 TTL"
delta_days = (items[0].expires_at.replace(tzinfo=timezone.utc)
              - datetime.now(timezone.utc)).total_seconds() / 86400
assert 0.5 < delta_days < 1.1, f"TTL 应≈1 天，实际 {delta_days:.2f}"
print(f"TTL effective: expires_at ~ {delta_days:.2f} days later PASS")

# ─── DAY-192：来信回信端点 ────────────────────────────────────────────────────
from app.services.mailbox.letter_store import LetterStore
db = SessionLocal()
letter = LetterStore(db).create(user_id=uid, type="greeting", title="早安",
                                body="昨晚的事我记着呢，今天慢慢来。", pet_id=None)
db.close()

r = httpx.post(f"{B}/letters/{letter.id}/reply", headers=H, timeout=90,
               json={"text": "嗯，今天感觉好一点了，谢谢你。"})
print("LETTER REPLY:", r.status_code)
assert r.status_code == 201, r.text
body = r.json()
cid = body["conversation_id"]
assert body["reply"]["content"], "桌宠应有续写"
print(f"  reply: {body['reply']['content'][:40]}")

# 对话持久化：信内容(assistant) + 回信(user) + 续写(assistant) 共 3 条
r = httpx.get(f"{B}/conversations/{cid}", headers=H, timeout=30)
msgs = r.json()["messages"]
assert len(msgs) == 3, msgs
assert "早安" in msgs[0]["content"]
assert msgs[1]["content"] == "嗯，今天感觉好一点了，谢谢你。"
assert msgs[2]["role"] == "assistant"

# 回信后来信自动已读
r = httpx.get(f"{B}/letters/{letter.id}", headers=H, timeout=30)
assert r.json()["is_read"] is True

# 空回信 422 / 越权 404
r = httpx.post(f"{B}/letters/{letter.id}/reply", headers=H, json={"text": "  "}, timeout=30)
assert r.status_code == 422
tok2 = httpx.post(f"{B}/auth/register",
                  json={"username": f"gap_{uuid.uuid4().hex[:8]}", "password": "pass1234"},
                  timeout=30).json()["access_token"]
r = httpx.post(f"{B}/letters/{letter.id}/reply",
               headers={"Authorization": f"Bearer {tok2}"}, json={"text": "hi"}, timeout=30)
assert r.status_code == 404
print("LETTER REPLY: persist/read/boundary PASS")

print("\n=== BE Gaps (DAY-192/193/194) ALL PASS ===")
