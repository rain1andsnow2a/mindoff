"""验证到期硬删除 + 每周周报（service 层，免启动 HTTP）。

- 硬删除：造一条已过期寄存记忆（带历史），跑 expire_ephemeral 后，记忆行与其
  历史行都应从库里消失（真删，不留人物/地点/原话/事件）。
- 未过期的寄存不受影响。
- 周报：monkeypatch LLM，跑 generate_weekly_report，应落库一封 type=weekly 的信；
  二次调用幂等（本周不重复发）。

运行：cd backend && PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_ephemeral_weekly.py
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import preference  # noqa: F401
from app.models.letter import Letter
from app.models.memory import MemoryHistory, MemoryItem
from app.models.user import User
from app.services import weekly_report
from app.services.inbox import expire_ephemeral
from app.services.memory_store import MemoryStore

Base.metadata.create_all(bind=engine)


def _mk_user(db) -> int:
    u = User(username=f"eph_{uuid.uuid4().hex[:8]}", password_hash="x")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u.id


def main() -> None:
    db = SessionLocal()
    store = MemoryStore(db)
    ok = True
    now = datetime.now(timezone.utc)

    uid = _mk_user(db)

    # 过期寄存（1 天前到期）+ 未过期寄存（3 天后）
    expired = store.create(
        user_id=uid, layer="episodic", kind="情绪", depth="surface",
        content="那天很难过，具体的人和事", surface_text="你那天有点低落",
        entities=["某人"], expires_at=now - timedelta(days=1), actor="test",
    )
    alive = store.create(
        user_id=uid, layer="episodic", kind="情绪", depth="surface",
        content="还没到期", surface_text="还在寄存",
        expires_at=now + timedelta(days=3), actor="test",
    )
    expired_id, alive_id = expired.id, alive.id
    hist_before = db.scalars(
        select(MemoryHistory).where(MemoryHistory.memory_id == expired_id)
    ).all()

    n = expire_ephemeral(db)
    db.expire_all()

    gone = db.get(MemoryItem, expired_id) is None
    hist_after = db.scalars(
        select(MemoryHistory).where(MemoryHistory.memory_id == expired_id)
    ).all()
    hist_gone = len(hist_after) == 0
    alive_kept = db.get(MemoryItem, alive_id) is not None
    print(f"[硬删] 遗忘数={n}  记忆行已删={gone}  历史行已删={hist_gone}(前{len(hist_before)}→后{len(hist_after)})  未到期保留={alive_kept}")
    ok &= gone and hist_gone and alive_kept and n >= 1

    # ── 周报：monkeypatch LLM ──
    class _FakeResp:
        content = '{"title": "这一周", "body": "这周你完成了几件事，也有些起落，周末好好歇歇 🌱"}'

    class _FakeLLM:
        def invoke(self, _msgs):
            return _FakeResp()

    weekly_report.get_chat_model = lambda *a, **k: _FakeLLM()
    uid2 = _mk_user(db)
    store.create(user_id=uid2, layer="episodic", kind="情绪", depth="surface",
                 content="本周有点忙", surface_text="这周挺忙", actor="test")

    letter = weekly_report.generate_weekly_report(db, uid2)
    made = letter is not None and letter.type == "weekly" and bool(letter.body)
    # 幂等：再来一次不应新增
    again = weekly_report.generate_weekly_report(db, uid2)
    idempotent = again is not None and again.id == letter.id
    total = len(db.scalars(select(Letter).where(Letter.user_id == uid2, Letter.type == "weekly")).all())
    print(f"[周报] 已生成={made}  幂等不重复={idempotent}  本周周报数={total}")
    ok &= made and idempotent and total == 1

    print("\n结果：", "全部通过 ✅" if ok else "有失败 ❌")
    db.close()
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
