"""验证睡前提醒 → 桌宠 agent → 信箱来信（service 层，免启动 HTTP）。

monkeypatch run_companion（避免打真 LLM），只测这根线：
  - 到点(过去时间)且今日未发 → 生成 type=reminder 来信、pet_id=激活桌宠、正文经 agent。
  - 幂等：再跑一次不新增。
  - 未到点(未来时间) → 不发。

运行：cd backend && PYTHONUTF8=1 PYTHONPATH=. .venv/Scripts/python.exe scripts/test_bedtime_reminder.py
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import preference  # noqa: F401
from app.models.letter import Letter
from app.models.preference import UserPreference
from app.models.user import User
from app.services.mailbox import bedtime_reminder as br
from app.services.pet.pet_presets import get_preset
from app.services.pet.pet_store import PetStore

Base.metadata.create_all(bind=engine)
CST = timezone(timedelta(hours=8))


def _mk_user_with_pet_and_time(db, hhmm: str) -> int:
    u = User(username=f"bed_{uuid.uuid4().hex[:8]}", password_hash="x", is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    ps = PetStore(db)
    pet = ps.create_from_preset(user_id=u.id, preset=get_preset("miro"))
    ps.set_active(u.id, pet)
    db.add(UserPreference(user_id=u.id, sleep_reminder_time=hhmm))
    db.commit()
    return u.id


def _reminders(db, uid):
    return db.scalars(
        select(Letter).where(Letter.user_id == uid, Letter.type == "reminder")
    ).all()


def main() -> None:
    db = SessionLocal()
    ok = True

    # agent 输出打桩（确认 run_companion 被调用，且 pet_prompt 传入的是激活桌宠人格）
    captured = {}

    def fake_run_companion(mode, history, *a, pet_prompt=None, **k):
        captured["pet_prompt"] = pet_prompt
        captured["mode"] = mode
        return "夜深了，把肩膀放松一点，我陪你收收心，早点歇息呀。"

    br.run_companion = fake_run_companion

    now = datetime.now(CST)

    # ── 到点：设一个已过去的时间 ──
    past = (now - timedelta(minutes=5)).strftime("%H:%M")
    uid = _mk_user_with_pet_and_time(db, past)
    res = br.run_due_bedtime_reminders(db)
    db.expire_all()
    sent = [r for r in res if r.get("user_id") == uid and r.get("sent")]
    letters = _reminders(db, uid)
    a1 = len(sent) == 1 and len(letters) == 1
    a2 = letters[0].type == "reminder" and letters[0].pet_id is not None and bool(letters[0].body)
    a3 = bool(captured.get("pet_prompt"))  # 传入了激活桌宠的 system_prompt
    print(f"[到点] 已发={a1}  信为reminder+带pet+有正文={a2}  经桌宠agent(pet_prompt非空)={a3}")
    ok &= a1 and a2 and a3

    # ── 幂等：再跑不新增 ──
    br.run_due_bedtime_reminders(db)
    db.expire_all()
    a4 = len(_reminders(db, uid)) == 1
    print(f"[幂等] 当天仍只有 1 条={a4}")
    ok &= a4

    # ── 未到点：未来时间不发 ──
    future = (now + timedelta(minutes=30)).strftime("%H:%M")
    # 避免跨午夜把 future 卷回过去导致误判：仅当 future 仍晚于 now 时测
    if datetime.strptime(future, "%H:%M").time() > now.time():
        uid2 = _mk_user_with_pet_and_time(db, future)
        br.run_due_bedtime_reminders(db)
        db.expire_all()
        a5 = len(_reminders(db, uid2)) == 0
        print(f"[未到点] 未发={a5}")
        ok &= a5
    else:
        print("[未到点] 跳过(临近午夜，未来时间已跨日)")

    print("\n结果：", "全部通过 ✅" if ok else "有失败 ❌")
    db.close()
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
