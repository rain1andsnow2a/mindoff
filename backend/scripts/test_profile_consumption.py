"""画像消费链路测试：上下文注入、伦理措辞和关闭时降级（无真实 LLM）。"""
import json
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.graphs import companion, extractor
from app.models.conversation import Conversation, Message
from app.models.preference import UserPreference
from app.models.user import User
from app.services.memory.memory_store import MemoryStore
from app.services.memory import context_builder
from app.services.scene import scene_recommend
from app.services.signals import decision
from app.services.signals.context import build_decision_context, now_local
from app.services.signals.date_context import get_date_context


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)

with TestingSession() as db:
    user = User(username="profile_consumer", password_hash="x", is_active=True)
    db.add(user); db.commit(); db.refresh(user)
    pref = UserPreference(user_id=user.id)
    db.add(pref); db.commit()
    MemoryStore(db).create(
        user_id=user.id, layer="profile", kind="小结", depth="surface",
        content="用户可能更喜欢先独处整理，再讨论复杂问题",
        surface_text="你似乎更喜欢先独处整理，再讨论复杂问题",
        confidence=0.72, entities=["signal-key:preference:quiet"], actor="test",
    )

    enabled = context_builder.build(db, user.id, mode="profile")
    assert "先独处整理" in enabled
    original_settings = context_builder.get_settings
    context_builder.get_settings = lambda: SimpleNamespace(user_profile_enabled=False)
    disabled = context_builder.build(db, user.id, mode="profile")
    context_builder.get_settings = original_settings
    assert "先独处整理" not in disabled
    print("CONTEXT: profile injected; global switch degrades to empty context PASS")

    messages = companion._build_messages(
        "free_chat", [{"role": "user", "content": "今天有点累"}], memory_context=enabled,
    )
    system_text = messages[0].content
    assert "待验证线索" in system_text and "绝不能断言" in system_text
    print("COMPANION: tentative, non-labeling instruction PASS")

    captured = {}
    class FakeModel:
        def invoke(self, messages):
            captured["extractor"] = messages[-1].content
            return SimpleNamespace(content="[]")
    original_extractor_model = extractor.get_chat_model
    extractor.get_chat_model = lambda **kwargs: FakeModel()
    extractor.call_llm({"dump_text": "今天想先安静一下", "profile_context": enabled})
    extractor.get_chat_model = original_extractor_model
    assert "先独处整理" in captured["extractor"] and "不可覆盖原文" in captured["extractor"]
    print("ORGANIZE: existing profile helps disambiguation without adding facts PASS")

    ctx = build_decision_context(
        db, user_id=user.id, pref=pref, signal={"type": "scheduled"},
        date_context=get_date_context(now_local()),
    ).to_dict()
    assert "先独处整理" in ctx["profile_context"]

    class DecisionModel:
        def invoke(self, messages):
            captured["decision"] = messages[-1]["content"]
            return SimpleNamespace(content=json.dumps({
                "decision": "suppress", "reason": "无需打扰", "message": "",
                "title": "", "delivery_mode": "silent",
            }, ensure_ascii=False))
    original_decision_model = decision.get_chat_model
    decision.get_chat_model = lambda **kwargs: DecisionModel()
    decision.decide(ctx, signal_type="scheduled", scenario="test")
    decision.get_chat_model = original_decision_model
    assert "长期理解" in captured["decision"] and "先独处整理" in captured["decision"]
    print("PROACTIVE: profile reaches decision payload with uncertainty guard PASS")

    conv = Conversation(user_id=user.id, mode="voice_call")
    db.add(conv); db.commit(); db.refresh(conv)
    db.add(Message(conversation_id=conv.id, role="user", content="我想重演一次那次告别")); db.commit()

    class SceneModel:
        def invoke(self, messages):
            captured["scene"] = messages[-1]["content"]
            return SimpleNamespace(content=json.dumps({
                "worth": False, "title": "", "people": [], "place": "", "plot": "",
                "intent": "", "theater_id": None, "confidence": 0,
            }, ensure_ascii=False))
    original_scene_model = scene_recommend.get_chat_model
    scene_recommend.get_chat_model = lambda **kwargs: SceneModel()
    scene_recommend.analyze_for_user(db, user.id)
    scene_recommend.get_chat_model = original_scene_model
    assert "先独处整理" in captured["scene"] and "仅供消歧" in captured["scene"]
    print("SCENE: profile context injected without inventing scene facts PASS")

print("\n=== Profile Consumption ALL PASS ===")
