"""片场服务（spec phase 4）集成测试：supply 供给 + settle 结算回写。

直接走 service 层 + 真实 dev 库（SQLite），无需启动 HTTP 服务。
运行：cd backend && PYTHONUTF8=1 .venv/Scripts/python.exe scripts/test_stage.py
"""
import uuid

from app.db import Base, SessionLocal, engine
from app.models import role_profile  # noqa: F401  确保模型注册进 metadata
from app.models.user import User
from app.services.scene import stage
from app.services.mailbox.inbox import build_today
from app.services.memory.memory_store import MemoryStore

Base.metadata.create_all(bind=engine)  # dev 库对齐（role_profiles 新表）

db = SessionLocal()

# ─── 造用户与素材 ────────────────────────────────────────────────────────────
uname = f"stage_{uuid.uuid4().hex[:8]}"
user = User(username=uname, password_hash="x")
db.add(user)
db.commit()
db.refresh(user)
uid = user.id
other = User(username=f"{uname}_b", password_hash="x")
db.add(other)
db.commit()
db.refresh(other)

store = MemoryStore(db)

# 候选片段（episodic，提到"妈妈"）
frag = store.create(
    user_id=uid, layer="episodic", kind="片段", depth="personal",
    content="上次和妈妈打电话又吵起来了，她总是否定我的选择",
    surface_text="你又想起和妈妈的那通电话",
    entities=["妈妈"], confidence=0.9,
)
# 相关深层记忆（vulnerable，entities 含妈妈）
deep = store.create(
    user_id=uid, layer="profile", kind="情绪", depth="vulnerable",
    content="面对妈妈的否定会本能地自我怀疑",
    surface_text="你在妈妈面前容易怀疑自己",
    entities=["妈妈"], confidence=0.7,
)
# 无关深层记忆（不应被供给）
store.create(
    user_id=uid, layer="profile", kind="情绪", depth="vulnerable",
    content="怕黑", surface_text="你有点怕黑", entities=["黑暗"], confidence=0.7,
)
# 他人的角色与记忆（不应混入）
store.create(
    user_id=other.id, layer="profile", kind="情绪", depth="vulnerable",
    content="别人的秘密", surface_text="别人的秘密", entities=["妈妈"], confidence=0.7,
)
from app.models.role_profile import RoleProfile
role = RoleProfile(user_id=uid, name="妈妈", relation="母亲", notes="说话直接，习惯否定式关心")
db.add(role)
db.commit()
db.refresh(role)
role_b = RoleProfile(user_id=other.id, name="妈妈", relation="母亲", notes="别人的妈妈")
db.add(role_b)
db.commit()

# ─── supply ──────────────────────────────────────────────────────────────────
pack = stage.supply(db, uid, frag.id)
assert pack is not None
assert pack["fragment"].id == frag.id
assert [r.id for r in pack["roles"]] == [role.id], "应只匹配本人的妈妈"
assert [m.id for m in pack["deep_memories"]] == [deep.id], "应只取相关深层记忆"
print("SUPPLY: fragment + 1 role + 1 deep memory ✓")

assert stage.supply(db, uid, 999999) is None
assert stage.supply(db, other.id, frag.id) is None  # 越权
print("SUPPLY 边界: 不存在/越权 → None ✓")

# ─── settle ──────────────────────────────────────────────────────────────────
result = stage.settle(
    db, uid,
    action_text="明天给妈妈打个电话，先听她把话说完",
    insight_text="我好像一直在等妈妈先认可我",
    related_memory_ids=[frag.id, deep.id],
    role_id=role.id,
    keep=True,
    card_text="那句没说出口的话：妈，我需要的是你先信我一次。",
)
print("SETTLE:", result)

# 最小行动 → surface/待办，进次日信箱
today = build_today(db, uid)
actionable_ids = [e["memory_id"] for e in today["actionable"] + today["needs_info"]]
assert result["action_memory_id"] in actionable_ids, "行动应进今日待启"
am = store.get(result["action_memory_id"])
assert am.depth == "surface" and am.kind == "待办" and am.status == "pending"
print("SETTLE 行动: surface/待办/pending，已进今日待启 ✓")

# 领悟 → extends 关联 + provenance
im = store.get(result["insight_memory_id"])
assert im.relation_type == "extends" and im.relation_to_id == frag.id
assert set(im.provenance) == {frag.id, deep.id}
print("SETTLE 领悟: extends → 片段，provenance 全来源 ✓")

# 角色笔记追加
db.refresh(role)
assert "重演领悟" in role.notes and "等妈妈先认可我" in role.notes
print("SETTLE 角色笔记: 已追加 ✓")

# 珍藏卡：无 TTL + 同步生成长久珍藏
card = store.get(result["card_memory_id"])
assert card.expires_at is None
assert result["treasure_id"] is not None
from app.services.companion.treasure_store import TreasureStore
treasure = TreasureStore(db).get(uid, result["treasure_id"])
assert treasure is not None and treasure.content == "那句没说出口的话：妈，我需要的是你先信我一次。"
print("SETTLE 珍藏卡: 长久保存（无 TTL）+ 已生成 Treasure ✓")

# 即焚卡：带短 TTL，可被 expire 遗忘；不生成 Treasure
from datetime import datetime, timezone
r2 = stage.settle(db, uid, keep=False, card_text="即焚卡：今晚说完就放下")
burn = store.get(r2["card_memory_id"])
assert burn.expires_at is not None
assert r2["treasure_id"] is None, "即焚卡不应生成 Treasure"
# 手动把 expires_at 拨到过去，验证 expire 路径
burn.expires_at = datetime.now(timezone.utc)
db.commit()
from app.services.mailbox.inbox import expire_ephemeral
expire_ephemeral(db)
assert store.get(r2["card_memory_id"]) is None, "即焚卡到期应被物理删除"
print("SETTLE 即焚卡: 到期遗忘，无 Treasure ✓")

# history 完整性（Property 4）
from sqlalchemy import select
from app.models.memory import MemoryHistory
hs = db.scalars(select(MemoryHistory).where(MemoryHistory.memory_id == am.id)).all()
assert any(h.event == "ADD" for h in hs)
print("HISTORY: 创建必写 ADD ✓")

db.close()
print("\n=== Stage (phase 4) ALL PASS ===")
