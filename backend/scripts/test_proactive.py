"""信任门控与主动陪伴（spec phase 5）集成测试：Property 8。

直接走 service 层 + 真实 dev 库，无需启动 HTTP 服务。
运行：cd backend && PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_proactive.py
"""
import uuid

from app.db import Base, SessionLocal, engine
from app.models import trust_state  # noqa: F401  注册 metadata
from app.models.user import User
from app.services import proactive, trust
from app.services.memory_store import MemoryStore

Base.metadata.create_all(bind=engine)

db = SessionLocal()
user = User(username=f"trust_{uuid.uuid4().hex[:8]}", password_hash="x")
db.add(user)
db.commit()
db.refresh(user)
uid = user.id
store = MemoryStore(db)

# ─── 信任演化 ────────────────────────────────────────────────────────────────
ts = trust.get_or_create(db, uid)
assert ts.value == 0.0 and ts.proactive_enabled
for _ in range(4):
    trust.record_interaction(db, uid)
ts = trust.get_or_create(db, uid)
assert abs(ts.value - 0.2) < 1e-6, ts.value  # 4 × 0.05
trust.record_confirm(db, uid)
trust.record_deny(db, uid)
ts = trust.get_or_create(db, uid)
assert abs(ts.value - (0.2 + 0.10 - 0.15)) < 1e-6, ts.value
print(f"TRUST 演化: interactions/confirms/denies → value={ts.value:.2f} ✓")

# ─── 候选记忆：不同 depth → 不同默认门控 ──────────────────────────────────────
m_surface = store.create(user_id=uid, layer="state", kind="待办", depth="surface",
                         content="表层事", provenance=[1])
m_personal = store.create(user_id=uid, layer="profile", kind="情绪", depth="personal",
                          content="私人事", provenance=[1, 2, 3])
m_vuln = store.create(user_id=uid, layer="profile", kind="情绪", depth="vulnerable",
                      content="脆弱事", provenance=[1, 2])
m_core = store.create(user_id=uid, layer="profile", kind="情绪", depth="core",
                      content="核心事", provenance=[1, 2, 3, 4],
                      relation_type="derives", relation_to_id=m_vuln.id)
gates = {m.depth: m.visibility_gate for m in (m_surface, m_personal, m_vuln, m_core)}
assert gates["surface"] < gates["personal"] < gates["vulnerable"] < gates["core"]
print(f"门控随 depth 收紧: {gates} ✓")

# ─── 门控过滤（Property 8）────────────────────────────────────────────────────
# 当前 trust=0.15：只有 surface(gate 0) 可提起
picks = proactive.pick(db, uid)
assert [p["memory_id"] for p in picks] == [m_surface.id], picks
print("门控: trust=0.15 只放过 surface ✓")

# 提升 trust 到 0.65（再加 9 次互动 + 2 次确认 = 0.15+0.45+0.20=0.80）
for _ in range(9):
    trust.record_interaction(db, uid)
trust.record_confirm(db, uid)
trust.record_confirm(db, uid)
ts = trust.get_or_create(db, uid)
picks = proactive.pick(db, uid, limit=10)
picked_ids = {p["memory_id"] for p in picks}
# gate ≤ 0.8 的都在；core(0.85) 仍被挡
assert m_core.id not in picked_ids
assert {m_surface.id, m_personal.id, m_vuln.id} <= picked_ids
for p in picks:
    assert p["visibility_gate"] <= ts.value, "Property 8 违反"
# provenance 充分性排序：personal(3) 在 vuln(2) 前
order = [p["memory_id"] for p in picks]
assert order.index(m_personal.id) < order.index(m_vuln.id)
print(f"门控: trust={ts.value:.2f} 放行 surface/personal/vulnerable，core 仍被挡 ✓")
print("排序: provenance 充分性降序 ✓")

# ─── 用户关闭主动陪伴（requirements 6.5）──────────────────────────────────────
trust.set_proactive_enabled(db, uid, False)
assert proactive.pick(db, uid) == []
trust.set_proactive_enabled(db, uid, True)
assert proactive.pick(db, uid) != []
print("用户开关: 关闭→空，开启→恢复 ✓")

# ─── 无 provenance 的记忆不做主动候选（有依据原则）─────────────────────────────
bare = store.create(user_id=uid, layer="state", kind="灵感", depth="surface",
                    content="无来源的灵感")
assert bare.id not in {p["memory_id"] for p in proactive.pick(db, uid, limit=50)}
print("有依据: 无 provenance 不候选 ✓")

db.close()
print("\n=== Trust & Proactive (phase 5) ALL PASS ===")
