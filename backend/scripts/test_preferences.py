"""DAY-193 冒烟：/preferences 扩字段读写 + TTL 真正影响到期清理。

先启动服务：cd backend && uv run uvicorn app.main:app --port 8011
再运行：cd backend && uv run python scripts/test_preferences.py
"""
import uuid
from datetime import datetime, timezone

import httpx

B = "http://127.0.0.1:8011/api/v1"

u = {"username": f"pref_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok = httpx.post(f"{B}/auth/register", json=u, timeout=30).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
uid = httpx.get(f"{B}/users/me", headers=H, timeout=30).json()["id"]

# 默认值（扩字段存在）
r = httpx.get(f"{B}/preferences", headers=H, timeout=30)
print("DEFAULT:", r.json())
assert r.status_code == 200
defaults = r.json()
assert defaults["proactive_enabled"] is True
assert defaults["proactive_frequency"] == "温和"
assert defaults["sleep_reminder_time"] == "22:30"
assert defaults["keep_raw_dump"] is True
assert defaults["ephemeral_ttl_days"] == 7
assert defaults["font_size"] == "标准"
assert defaults["companion_tone"] == "温和"
assert defaults["reduce_transparency"] is False
assert defaults["profile_learning_enabled"] is True

# 部分修改（扩字段）
r = httpx.patch(f"{B}/preferences", headers=H, timeout=30,
                json={"sleep_reminder_time": "23:00",
                      "ephemeral_ttl_days": 3,
                      "profile_learning_enabled": False,
                      "font_size": "大",
                      "companion_tone": "活泼",
                      "reduce_transparency": True})
assert r.status_code == 200, r.text
body = r.json()
assert body["sleep_reminder_time"] == "23:00"
assert body["ephemeral_ttl_days"] == 3
assert body["font_size"] == "大"
assert body["companion_tone"] == "活泼"
assert body["reduce_transparency"] is True
assert body["profile_learning_enabled"] is False
assert body["proactive_frequency"] == "温和", "其他字段不受影响"
print("PATCH extended fields: ok")

# 非法值校验
r = httpx.patch(f"{B}/preferences", headers=H, json={"sleep_reminder_time": "25:99"}, timeout=30)
assert r.status_code == 422
r = httpx.patch(f"{B}/preferences", headers=H, json={"proactive_frequency": "狂暴"}, timeout=30)
assert r.status_code == 422
r = httpx.patch(f"{B}/preferences", headers=H, json={"ephemeral_ttl_days": 99}, timeout=30)
assert r.status_code == 422
r = httpx.patch(f"{B}/preferences", headers=H, json={"font_size": "巨"}, timeout=30)
assert r.status_code == 422
print("VALIDATION: illegal time/frequency/ttl/font 422 PASS")

# 主动陪伴开关 -> 同步 TrustState -> proactive.pick 静默
import sys
sys.path.insert(0, ".")
from app.db import SessionLocal
from app.services.companion import proactive
from app.services.memory.memory_store import MemoryStore
from app.services.pet.trust import get_or_create

db = SessionLocal()
MemoryStore(db).create(user_id=uid, layer="state", kind="待办", depth="surface",
                       content="表层可提起", provenance=[1])
ts = get_or_create(db, uid)
ts.value = 0.5
db.commit()
assert proactive.pick(db, uid), "开关前应能挑到候选"
db.close()

r = httpx.patch(f"{B}/preferences", headers=H, json={"proactive_enabled": False}, timeout=30)
assert r.status_code == 200 and r.json()["proactive_enabled"] is False

db = SessionLocal()
ts = get_or_create(db, uid)
assert ts.proactive_enabled is False, "TrustState synced"
assert proactive.pick(db, uid) == [], "关闭后 pick 必须静默"
db.close()
print("PROACTIVE OFF: TrustState sync + pick silent PASS")

# 重新开启恢复
r = httpx.patch(f"{B}/preferences", headers=H, json={"proactive_enabled": True}, timeout=30)
db = SessionLocal()
assert proactive.pick(db, uid), "重开后恢复"
db.close()
print("PROACTIVE ON: restore PASS")

# TTL 真正影响倾倒产物的 expires_at
r = httpx.patch(f"{B}/preferences", headers=H, timeout=30,
                json={"ephemeral_ttl_days": 1})
assert r.status_code == 200
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

print("\n=== Preferences (DAY-193) ALL PASS ===")
