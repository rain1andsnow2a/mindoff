"""DAY-169 冒烟：/preferences + 主动陪伴开关联动门控。

先启动服务：.venv/Scripts/python.exe -m uvicorn app.main:app --port 8011
再运行：PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_preferences.py
"""
import uuid

import httpx

B = "http://127.0.0.1:8011/api/v1"

u = {"username": f"pref_{uuid.uuid4().hex[:8]}", "password": "pass1234"}
tok = httpx.post(f"{B}/auth/register", json=u, timeout=30).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
uid = httpx.get(f"{B}/users/me", headers=H, timeout=30).json()["id"]

# 默认值
r = httpx.get(f"{B}/preferences", headers=H, timeout=30)
print("DEFAULT:", r.json())
assert r.status_code == 200
assert r.json() == {
    "proactive_enabled": True,
    "proactive_frequency": "温和",
    "sleep_reminder_time": "22:30",
    "keep_raw_dump": True,
}

# 部分修改
r = httpx.patch(f"{B}/preferences", headers=H, json={"sleep_reminder_time": "23:00"}, timeout=30)
assert r.status_code == 200 and r.json()["sleep_reminder_time"] == "23:00"
assert r.json()["proactive_frequency"] == "温和", "其他字段不受影响"
print("PATCH time: ok")

# 非法值
r = httpx.patch(f"{B}/preferences", headers=H, json={"sleep_reminder_time": "25:99"}, timeout=30)
assert r.status_code == 422
r = httpx.patch(f"{B}/preferences", headers=H, json={"proactive_frequency": "狂暴"}, timeout=30)
assert r.status_code == 422
print("VALIDATION: 非法时间/频率 422 ✓")

# 主动陪伴开关 → 同步 TrustState → proactive.pick 静默（Property 8 路径）
import sys
sys.path.insert(0, ".")
from app.db import SessionLocal
from app.services import proactive
from app.services.memory_store import MemoryStore
from app.services.trust import get_or_create

db = SessionLocal()
# 造一条可提起的记忆 + 足够信任
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
assert ts.proactive_enabled is False, "TrustState 已同步"
assert proactive.pick(db, uid) == [], "关闭后 pick 必须静默"
db.close()
print("PROACTIVE OFF: TrustState 同步 + pick 静默 ✓")

# 重新开启恢复
r = httpx.patch(f"{B}/preferences", headers=H, json={"proactive_enabled": True}, timeout=30)
db = SessionLocal()
assert proactive.pick(db, uid), "重开后恢复"
db.close()
print("PROACTIVE ON: 恢复 ✓")

print("\n=== Preferences (DAY-169) ALL PASS ===")
