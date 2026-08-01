"""内容信号模型/提取服务回归测试（独立内存库，无真实 LLM）。"""
import json
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base
from app.models import ContentSignal, ProfileWriteCandidate  # noqa: F401 - 注册 metadata
from app.services.memory.content_signals import ContentSignalService
from app.services.memory.vad import extract_vad


engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)

vad = extract_vad("今天不太开心，也有点无力")
assert vad["valence"] < 0 and vad["dominance"] < 0.5 and vad["matched"]
print("VAD: lexicon + negation/degree modifiers PASS")


def fake_llm(_messages):
    return SimpleNamespace(content=json.dumps({
        "topics": ["工作交付"], "entities": ["同事", "公司"], "intent": "todo",
        "events": [{"summary": "明天交报告", "status": "planned"}],
        "state": {"summary": "报告还没交"},
        "confidence": 0.84, "sensitivity": "personal",
        "memory_candidates": [{
            "memory_key": "工作交付偏好", "action": "add", "target_memory_id": None,
            "category": "近期关注", "statement": "用户近期关注工作交付",
            "surface_text": "你近期比较关注工作交付",
            "evidence_quote": "明天在公司交报告", "entities": ["公司", "报告"],
            "durability": "emerging", "confidence": 0.78,
        }],
    }, ensure_ascii=False))


with Session(engine) as db:
    service = ContentSignalService(db)
    first = service.extract(
        user_id=1, source_type="conversation", source_id="message:10",
        text="我和同事说好明天在公司交报告", invoke=fake_llm,
    )
    assert first and first.intent == "todo" and first.topics == ["工作交付"]
    assert first.extraction_status == "ready" and first.sensitivity == "personal"
    assert first.emotion["method"] == "vad_lexicon"
    assert len(list(db.query(ProfileWriteCandidate))) == 1

    duplicate = service.extract(
        user_id=1, source_type="conversation", source_id="message:10",
        text="我和同事说好明天在公司交报告", invoke=fake_llm,
    )
    assert duplicate.id == first.id and len(service.list_for_user(1)) == 1
    print("SIGNAL: structured extraction + source idempotency PASS")

    fallback = service.extract(
        user_id=1, source_type="brain_dump", source_id="dump:3",
        text="明天记得去学校交材料", invoke=lambda _: (_ for _ in ()).throw(RuntimeError("provider down")),
    )
    assert fallback and fallback.extraction_status == "emotion_only" and fallback.intent == "other"
    assert fallback.topics == [] and fallback.entities == []
    assert fallback.extraction_error == "provider down"
    print("SIGNAL: provider failure degrades without losing observation PASS")

    called = False
    def forbidden(_):
        nonlocal_called[0] = True
        raise AssertionError("sensitive text must stay local")
    nonlocal_called = [False]
    sensitive = service.extract(
        user_id=1, source_type="voice_call", source_id="message:99",
        text="我经历过家暴，这件事让我很害怕", invoke=forbidden,
    )
    assert sensitive and sensitive.sensitivity == "vulnerable"
    assert sensitive.extraction_status == "emotion_only" and not nonlocal_called[0]
    assert sensitive.topics == [] and sensitive.emotion["matched"]
    print("SIGNAL: vulnerable content stays on local VAD-only path PASS")

print("\n=== Content Signals ALL PASS ===")
