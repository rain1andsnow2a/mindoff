"""Phase 6 集成测试：深度隐私(Property 9) + 上下文容错(Property 11) + 审阅面(Property 10)。

隐私/上下文走 service 层 + 真实 dev 库；审阅面走真实 HTTP（先起服务 8011）。
运行：cd backend && PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_phase6.py
"""
import uuid

import httpx

from app.db import Base, SessionLocal, engine
from app.models import trust_state, role_profile  # noqa: F401  注册 metadata
from app.models.user import User
from app.services import context_builder, privacy
from app.services.memory_store import MemoryStore

Base.metadata.create_all(bind=engine)

B = "http://127.0.0.1:8011/api/v1"
db = SessionLocal()

# ─── 用户与素材 ──────────────────────────────────────────────────────────────
uname = f"p6_{uuid.uuid4().hex[:8]}"
r = httpx.post(f"{B}/auth/register", json={"username": uname, "password": "pass1234"})
assert r.status_code == 201, r.text
H = {"Authorization": f"Bearer {r.json()['access_token']}"}
uid = httpx.get(f"{B}/users/me", headers=H).json()["id"]

store = MemoryStore(db)
m_todo = store.create(user_id=uid, layer="state", kind="待办", depth="surface",
                      content="明天交报告", surface_text="你明天要交报告", provenance=[1])
m_prof = store.create(user_id=uid, layer="profile", kind="情绪", depth="personal",
                      content="怕黑", surface_text="你有点怕黑", provenance=[1])
m_vuln = store.create(user_id=uid, layer="profile", kind="情绪", depth="vulnerable",
                      content="脆弱的事", surface_text="一件脆弱的事", raw_ref="原文快照")
m_epi = store.create(user_id=uid, layer="episodic", kind="片段", depth="personal",
                     content="和妈妈打电话吵了", surface_text="你和妈妈吵了一架",
                     entities=["妈妈"])
m_core = store.create(user_id=uid, layer="profile", kind="情绪", depth="core",
                      content="核心渴望", surface_text="你渴望被信任",
                      relation_type="derives", relation_to_id=m_vuln.id)

# ─── Property 9：深度隐私 ────────────────────────────────────────────────────
assert m_vuln.privacy == "local" and m_core.privacy == "local"
assert not privacy.can_send_external(m_vuln)
assert not privacy.can_send_external(m_core)
assert privacy.can_send_external(m_core, explicit_consent=True)  # 显式授权放行
assert privacy.can_send_external(m_todo)  # surface 默认 cloud
external = privacy.filter_for_external([m_todo, m_prof, m_vuln, m_core])
assert [m.id for m in external] == [m_todo.id], "未授权时只有 surface 可外发"
print("PRIVACY: vulnerable/core 默认 local 且不外发，授权放行，surface 放行 ✓")

# 阈后即焚
privacy.burn_after_read(db, m_epi.id)
db.refresh(m_epi)
assert m_epi.is_forgotten
print("PRIVACY: burn_after_read 读取后遗忘 ✓")

# 原始倾诉即焚（raw_ref 清空 + history）
assert privacy.burn_raw_ref(db, m_vuln.id)
db.refresh(m_vuln)
assert m_vuln.raw_ref is None
from sqlalchemy import select
from app.models.memory import MemoryHistory
hs = db.scalars(select(MemoryHistory).where(MemoryHistory.memory_id == m_vuln.id)).all()
assert any(h.event == "UPDATE" and (h.meta or {}).get("action") == "burn" for h in hs)
print("PRIVACY: raw_ref 即焚（清空 + UPDATE 历史）✓")

# ─── Property 11：上下文构建器 ───────────────────────────────────────────────
# 补一条未被即焚的 episodic 供 query 召回
store.create(user_id=uid, layer="episodic", kind="片段", depth="personal",
             content="和妈妈打电话吵了", surface_text="你和妈妈吵了一架",
             entities=["妈妈"])
ctx = context_builder.build(db, uid, mode="full", query="妈妈")
assert ctx.startswith("<memory-context>") and ctx.endswith("</memory-context>")
assert "怕黑" in ctx, "profile 段应含稳定画像"
assert "交报告" in ctx, "profile 模式应含近期 state"
assert "妈妈" in ctx, "query 段应召回相关 episodic"
print("CONTEXT: full 模式围栏 + profile/state/episodic 齐备 ✓")

ctx_q = context_builder.build(db, uid, mode="query", query="完全无关的词xyz")
assert "怕黑" not in ctx_q and "交报告" not in ctx_q, "query 模式不含 profile/state"
print("CONTEXT: query 模式只召回相关 episodic ✓")

# 预算：profile 字符预算收紧后截断
ctx_b = context_builder.build(db, uid, mode="profile",
                              budgets={"profile": (1, 20), "state": (0, 0)})
assert ctx_b.count("- [") <= 1
print("CONTEXT: 分层预算生效 ✓")

# 容错：检索源抛异常 → 该段为空，不抛出（Property 11）
_orig = MemoryStore.list_by_layer
MemoryStore.list_by_layer = lambda self, u, l, **k: (_ for _ in ()).throw(RuntimeError("db down"))
try:
    ctx_fail = context_builder.build(db, uid, mode="full", query="妈妈")
    assert ctx_fail == "<memory-context>\n\n</memory-context>"
finally:
    MemoryStore.list_by_layer = _orig
print("CONTEXT: 检索异常退化为空段，不阻断 ✓")

# ─── Property 10：审阅面 ────────────────────────────────────────────────────
r = httpx.get(f"{B}/memory-review", headers=H)
assert r.status_code == 200, r.text
items = r.json()
ids = {i["id"] for i in items}
assert m_prof.id in ids and m_todo.id in ids, "应含 profile/state"
assert m_epi.id not in ids, "episodic 不在审阅面"
for i in items:
    assert set(i.keys()) == {"id", "kind", "surface_text", "sensitivity", "provenance", "updated_at"}
    assert i["sensitivity"] in ("日常", "个人", "较私密", "很私密")
    assert "depth" not in i and "layer" not in i, "不暴露轴原名"
labels = {i["id"]: i["sensitivity"] for i in items}
assert labels[m_vuln.id] == "较私密" and labels[m_core.id] == "很私密"
print("REVIEW: 软标签呈现，无轴名/诊断字段 ✓")

r = httpx.get(f"{B}/memory-review", headers=H, params={"sensitivity": "较私密"})
assert [i["id"] for i in r.json()] == [m_vuln.id]
r = httpx.get(f"{B}/memory-review", headers=H, params={"kind": "待办"})
assert [i["id"] for i in r.json()] == [m_todo.id]
print("REVIEW: 按敏感度/kind 过滤 ✓")

# 编辑经 UPDATE 生效（版本链），审阅面用最新版
r = httpx.patch(f"{B}/memories/{m_prof.id}", headers=H,
                json={"surface_text": "你其实更怕一个人待着"})
assert r.status_code == 200
r = httpx.get(f"{B}/memory-review", headers=H)
new_text = {i["id"]: i["surface_text"] for i in r.json()}
assert new_text[r.json()[0]["id"]]  # sanity
assert any("一个人待着" in t for t in new_text.values())
assert m_prof.id not in new_text, "旧版本不再出现"
print("REVIEW: 编辑走版本链，审阅面用最新版 ✓")

# 删除后不再召回
victim = new_text and [i for i in r.json() if "一个人待着" in i["surface_text"]][0]["id"]
r = httpx.delete(f"{B}/memories/{victim}", headers=H)
assert r.status_code == 204
r = httpx.get(f"{B}/memory-review", headers=H)
assert victim not in {i["id"] for i in r.json()}
print("REVIEW: 删除后不再召回 ✓")

db.close()
print("\n=== Phase 6 ALL PASS ===")
