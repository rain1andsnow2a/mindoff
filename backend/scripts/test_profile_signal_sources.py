"""四类内容信号来源 + 回填隔离的 HTTP/服务集成测试（无真实 LLM）。"""
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models.content_signal import ContentSignal
from app.models.conversation import Conversation, Message
from app.models.memory import MemoryItem
from app.models.memory import MemoryHistory
from app.models.scene import Scene
from app.models.user import User
from app.services.memory.content_signals import ContentSignalService


engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
)
TestingSession = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)

with TestingSession() as db:
    user = User(username="signal_owner", password_hash="x", is_active=True)
    other = User(username="signal_other", password_hash="x", is_active=True)
    db.add_all([user, other]); db.commit(); db.refresh(user); db.refresh(other)
    OWNER_ID, OTHER_ID = user.id, other.id


def db_override():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


def user_override():
    with TestingSession() as db:
        return db.get(User, OWNER_ID)


def fake_llm(messages):
    payload = json.loads(messages[-1]["content"])
    user_text = payload["user_text"]
    return SimpleNamespace(content=json.dumps({
        "topics": ["测试主题"], "entities": ["朋友"], "intent": "idea",
        "events": [{"summary": "测试事件", "status": "ongoing"}],
        "state": {"summary": "正在发生"},
        "confidence": 0.8, "sensitivity": "personal",
        "memory_candidates": [{
            "memory_key": "朋友沟通", "action": "add", "target_memory_id": None,
            "category": "重要关系", "statement": "用户重视和朋友把话说清楚",
            "surface_text": "你似乎很重视和朋友把话说清楚",
            "evidence_quote": user_text[:240], "entities": ["朋友"],
            "durability": "emerging", "confidence": 0.8,
        }],
    }, ensure_ascii=False))


# 所有采集路径共享同一个确定性 extractor，测试不访问真实 provider。
original_extract = ContentSignalService.extract
def deterministic_extract(self, **kwargs):
    kwargs["invoke"] = fake_llm
    return original_extract(self, **kwargs)
ContentSignalService.extract = deterministic_extract

app.dependency_overrides[get_db] = db_override
app.dependency_overrides[get_current_user] = user_override

import app.services.memory.content_signals as content_module
import app.routers.companion.conversations as conversations_module
import app.routers.memory.brain_dumps as dumps_module
import app.routers.scene.scenes as scenes_module

content_module.SessionLocal = TestingSession
conversations_module.run_companion = lambda *args, **kwargs: "我听见了"


def fake_ingest(_db, *, user_id, dump_text, raw_ref=None):
    yield {"event": "receipt", "data": {"dump_id": 77, "total": 0}}
    yield {"event": "done", "data": {}}
dumps_module.ingest_dump = fake_ingest

scenes_module.theater.manual_desc = lambda **kwargs: "用户描述的片场内容"
scenes_module.theater.generate_manual = lambda **kwargs: {
    "title": "测试片场", "setting": "学校门口",
    "beats": [{"speaker": "旁白", "text": "开始"}],
    "choices": [{"id": "a", "label": "把话说完"}],
}

client = TestClient(app)

# 普通聊天来源（真实路由 + BackgroundTasks）
r = client.post("/api/v1/conversations", json={"mode": "free_chat"})
assert r.status_code == 201, r.text
conv_id = r.json()["id"]
r = client.post(f"/api/v1/conversations/{conv_id}/messages", json={"text": "我想到一个新办法"})
assert r.status_code == 200, r.text

# 睡前倾倒来源（SSE 完成后的 BackgroundTask）
r = client.post("/api/v1/brain-dumps", json={"text": "今天和朋友聊了很久"})
assert r.status_code == 200, r.text

# 片场来源（创建场景后的 BackgroundTasks）
r = client.post("/api/v1/scenes", json={"title": "那一天", "plot": "我想把话说完"})
assert r.status_code == 201, r.text

# voice_call 旁路落库来源
import app.routers.ai.realtime as realtime_module
realtime_module.SessionLocal = TestingSession
voice_id = realtime_module.persist_voice_call(
    OWNER_ID, [("user", "我和朋友在学校聊了这件事"), ("assistant", "我在听")],
)
assert voice_id is not None

with TestingSession() as db:
    source_types = {s.source_type for s in db.scalars(select(ContentSignal)).all()}
assert source_types == {"conversation", "brain_dump", "scene", "voice_call"}, source_types
print("SOURCES: conversation/voice_call/brain_dump/scene hooks PASS")

# 历史回填：加入另一用户数据，当前用户响应和信号都不得包含它。
with TestingSession() as db:
    other_conv = Conversation(user_id=OTHER_ID, mode="free_chat")
    db.add(other_conv); db.flush()
    db.add(Message(conversation_id=other_conv.id, role="user", content="另一个用户的秘密"))
    db.add(MemoryItem(
        user_id=OTHER_ID, layer="episodic", kind="片段", depth="surface",
        content="[原始倾倒] 别人的内容", surface_text="别人的倾倒", raw_ref="别人的内容",
        confidence=1, visibility_gate=0, privacy="cloud",
    ))
    db.add(Scene(
        user_id=OTHER_ID, title="别人的片场", setting="", beats=[], choices=[],
        history=[{"turn": 1, "choice": "别人的选择"}], turn=1,
    ))
    db.commit()

r = client.post("/api/v1/profile/signals/backfill?limit=50")
assert r.status_code == 200, r.text
r2 = client.post("/api/v1/profile/signals/backfill?limit=50")
assert r2.status_code == 200 and r2.json()["created"] == 0, r2.text
r = client.get("/api/v1/profile/signals?limit=200")
assert r.status_code == 200
assert all("另一个用户" not in json.dumps(item, ensure_ascii=False) for item in r.json())
assert all(item["source_type"] in {"conversation", "voice_call", "brain_dump", "scene"} for item in r.json())
print("BACKFILL: bounded idempotency + current-user isolation PASS")

# 重复信号自动收敛为一条画像；用户纠正后自动合并不得覆盖。
r = client.post("/api/v1/profile/consolidate")
assert r.status_code == 200, r.text
r = client.get("/api/v1/profile")
assert r.status_code == 200 and r.json()["items"], r.text
profile_id = r.json()["items"][0]["id"]
assert r.json()["items"][0]["evidence_count"] >= 2

r = client.patch(f"/api/v1/profile/{profile_id}", json={"statement": "我更在意的是把话说清楚"})
assert r.status_code == 200, r.text
corrected_id = r.json()["id"]
with TestingSession() as db:
    assert db.scalar(select(MemoryHistory.id).where(
        MemoryHistory.memory_id == corrected_id, MemoryHistory.actor == "user",
    )) is not None
    service = ContentSignalService(db)
    service.extract(
        user_id=OWNER_ID, source_type="conversation", source_id="message:new",
        text="我又和朋友聊到这件事",
    )
from app.services.memory.profile_consolidation import ProfileConsolidator
with TestingSession() as db:
    result = ProfileConsolidator(db).consolidate(OWNER_ID)
    assert result["protected"] >= 1
r = client.get("/api/v1/profile")
assert r.json()["items"][0]["statement"] == "我更在意的是把话说清楚"
print("PROFILE: gated evidence merge + user correction version + overwrite protection PASS")

# 学习开关关闭后不新增观察，已有画像仍可删除管理。
r = client.patch("/api/v1/preferences", json={"profile_learning_enabled": False})
assert r.status_code == 200 and r.json()["profile_learning_enabled"] is False
with TestingSession() as db:
    before = len(list(db.scalars(select(ContentSignal)).all()))
    assert ContentSignalService(db).extract(
        user_id=OWNER_ID, source_type="conversation", source_id="paused:1",
        text="暂停后不应学习",
    ) is None
    after = len(list(db.scalars(select(ContentSignal)).all()))
    assert after == before
r = client.delete(f"/api/v1/profile/{corrected_id}")
assert r.status_code == 204
assert client.get("/api/v1/profile").json()["items"] == []
print("PROFILE: pause learning + existing profile deletion PASS")

app.dependency_overrides.clear()
ContentSignalService.extract = original_extract
print("\n=== Profile Signal Sources ALL PASS ===")
