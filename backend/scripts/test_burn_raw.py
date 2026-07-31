"""验证 keep_raw_dump → burn_raw_ref 自动挂接（service 层，免启动 HTTP）。

monkeypatch 掉 run_extractor（避免打真 LLM），只测这根线：
  - keep_raw_dump=False：提取成功后 root 记录的 raw_ref 被清空，但 surface_text 与
    提取出的子条目仍在（记忆本体不丢，agent 上下文不受影响）。
  - keep_raw_dump=True（默认）：raw_ref 原样保留。
  - 提取失败（facts 为空）即使 keep=False 也不焚（Property 1：至少接住用户）。

运行：cd backend && PYTHONUTF8=1 .venv/Scripts/python.exe scripts/test_burn_raw.py
"""
import uuid

from app.db import Base, SessionLocal, engine
from app.models import preference  # noqa: F401  注册模型
from app.models.preference import UserPreference
from app.models.user import User
from app.services.memory import dump_ingest
from app.services.memory.memory_store import MemoryStore

Base.metadata.create_all(bind=engine)

FAKE_FACTS = [
    {"layer": "episodic", "kind": "情绪", "depth": "surface",
     "content": "今天工作压力很大", "surface_text": "你昨晚提到工作上的压力", "confidence": 0.9},
    {"layer": "episodic", "kind": "待办", "depth": "surface",
     "content": "周一交周报", "surface_text": "记得周一交周报", "confidence": 0.9},
]


def _mk_user(db) -> int:
    u = User(username=f"burn_{uuid.uuid4().hex[:8]}", password_hash="x")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u.id


def _set_pref(db, uid: int, keep: bool) -> None:
    db.add(UserPreference(user_id=uid, keep_raw_dump=keep))
    db.commit()


def _run(db, uid: int) -> int:
    """跑完生成器，返回 dump_id。"""
    gen = dump_ingest.ingest_dump(db, user_id=uid, dump_text="今天真的好累……", raw_ref="audio://blob-123")
    receipt = None
    try:
        while True:
            next(gen)
    except StopIteration as e:
        receipt = e.value
    return receipt.dump_id


def main() -> None:
    db = SessionLocal()
    store = MemoryStore(db)
    ok = True

    # ── Case A：keep=False → 提取成功后焚原文 ──
    dump_ingest.run_extractor = lambda _txt: list(FAKE_FACTS)
    uid = _mk_user(db)
    _set_pref(db, uid, keep=False)
    dump_id = _run(db, uid)
    db.expire_all()
    root = store.get(dump_id)
    a1 = root.raw_ref is None
    a2 = bool(root.surface_text)  # 整理后文案仍在
    children = [m for m in store.list_all_latest(uid) if m.provenance and dump_id in m.provenance]
    a3 = len(children) == len(FAKE_FACTS)
    # 情绪落 7 天 TTL、待办不过期
    emo = next((m for m in children if m.kind == "情绪"), None)
    todo = next((m for m in children if m.kind == "待办"), None)
    a4 = emo is not None and emo.expires_at is not None
    a5 = todo is not None and todo.expires_at is None
    print(f"[A keep=False] raw_ref已清={a1}  surface仍在={a2}  子条目保留={a3}({len(children)})")
    print(f"[A TTL] 情绪有寄存期={a4}  待办不过期={a5}")
    ok &= a1 and a2 and a3 and a4 and a5

    # ── Case B：keep=True → 原文保留 ──
    uid2 = _mk_user(db)
    _set_pref(db, uid2, keep=True)
    dump_id2 = _run(db, uid2)
    db.expire_all()
    b1 = store.get(dump_id2).raw_ref is not None
    print(f"[B keep=True ] raw_ref保留={b1}")
    ok &= b1

    # ── Case C：提取失败 + keep=False → 不焚（兜底保住原话）──
    dump_ingest.run_extractor = lambda _txt: []
    uid3 = _mk_user(db)
    _set_pref(db, uid3, keep=False)
    dump_id3 = _run(db, uid3)
    db.expire_all()
    c1 = store.get(dump_id3).raw_ref is not None
    print(f"[C fail+keep=False] raw_ref保留(不焚)={c1}")
    ok &= c1

    print("\n结果：", "全部通过 ✅" if ok else "有失败 ❌")
    db.close()
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
