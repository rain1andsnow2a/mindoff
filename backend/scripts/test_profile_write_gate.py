"""画像写入门控边界测试：暂存、聚合、拒绝删除、保护用户纠正。"""
import json
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db import Base
from app.models import MemoryHistory, MemoryItem, ProfileWriteCandidate  # noqa: F401
from app.services.memory.content_signals import ContentSignalService
from app.services.memory.profile_consolidation import ProfileConsolidator


engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)


def response_for(*, key="安静工作环境", action="add", durability="emerging", confidence=0.82):
    def invoke(messages):
        text = json.loads(messages[-1]["content"])["user_text"]
        return SimpleNamespace(content=json.dumps({
            "topics": ["工作环境"], "entities": ["办公室"], "intent": "other",
            "events": [], "state": {"summary": ""}, "confidence": confidence,
            "sensitivity": "personal", "memory_candidates": [{
                "memory_key": key, "action": action, "target_memory_id": None,
                "category": "偏好", "statement": "用户偏好安静的工作环境",
                "surface_text": "你更喜欢安静的工作环境",
                "evidence_quote": text, "entities": ["办公室"],
                "durability": durability, "confidence": confidence,
            }],
        }, ensure_ascii=False))
    return invoke


with Session(engine) as db:
    service = ContentSignalService(db)
    service.extract(user_id=1, source_type="conversation", source_id="m:1", text="我在安静的办公室更容易专注", invoke=response_for())
    first = ProfileConsolidator(db).consolidate(1)
    assert first["staged"] == 1
    assert db.scalar(select(MemoryItem.id).where(MemoryItem.layer == "profile")) is None

    service.extract(user_id=1, source_type="conversation", source_id="m:2", text="办公时我还是更喜欢周围安静一点", invoke=response_for())
    second = ProfileConsolidator(db).consolidate(1)
    assert second["created"] == 1
    profile = db.scalar(select(MemoryItem).where(MemoryItem.layer == "profile", MemoryItem.is_latest == True))  # noqa: E712
    assert profile and len(profile.provenance) == 2
    applied = list(db.scalars(select(ProfileWriteCandidate).where(ProfileWriteCandidate.status == "applied")).all())
    assert len(applied) == 2 and all(row.applied_memory_id == profile.id for row in applied)
    print("GATE: one observation staged; two independent observations applied PASS")

    service.extract(user_id=1, source_type="conversation", source_id="m:3", text="把我的工作偏好删掉", invoke=response_for(key="删除工作偏好", action="delete"))
    deleted = ProfileConsolidator(db).consolidate(1)
    assert deleted["rejected"] == 1
    assert db.get(MemoryItem, profile.id).is_forgotten is False
    print("GATE: model-proposed automatic delete rejected PASS")

    transient = response_for(key="临时烦躁", durability="transient")
    service.extract(user_id=1, source_type="conversation", source_id="m:4", text="今天开会时有点烦", invoke=transient)
    service.extract(user_id=1, source_type="conversation", source_id="m:5", text="今天下班前也有点烦", invoke=transient)
    ignored = ProfileConsolidator(db).consolidate(1)
    assert ignored["noop"] == 2
    assert len(list(db.scalars(select(MemoryItem).where(MemoryItem.layer == "profile", MemoryItem.is_latest == True)).all())) == 1  # noqa: E712
    print("GATE: transient observations do not become profile PASS")

print("\n=== Profile Write Gate ALL PASS ===")
