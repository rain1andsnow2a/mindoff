"""信箱 REST 接口。

GET /api/v1/mailbox        → 聚合概览
GET /api/v1/mailbox/today  → 今日待启
GET /api/v1/mailbox/letters → 桌宠来信
POST /api/v1/mailbox/expire → 手动触发过期清理（开发/演示用）
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services import ephemeral_store
from app.services.inbox import build_letters, build_today, expire_ephemeral
from app.services.letter_store import LetterStore
from app.services.treasure_store import TreasureStore

router = APIRouter(prefix="/api/v1/mailbox", tags=["mailbox"])


@router.get("")
def mailbox_overview(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """信箱聚合概览：今日待启数、未读来信、三日寄存概况、珍藏入口。"""
    today = build_today(db, user.id)
    letters = build_letters(db, user.id)
    ephemeral = ephemeral_store.list_ephemeral(db, user.id, limit=100)

    return {
        "today_count": len(today["actionable"]),
        "needs_info_count": len(today["needs_info"]),
        "letters_count": len(letters),
        "letters": letters,
        "unread_letters_count": LetterStore(db).unread_count(user.id),
        "ephemeral_count": len(ephemeral),
        "treasures_count": TreasureStore(db).count_for_user(user.id),
        "today": today,
    }


@router.get("/today")
def get_today(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """今日待启：只含 depth=surface 需行动记忆 + 待补区。"""
    return build_today(db, user.id)


@router.get("/letters")
def get_letters(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """桌宠来信（≤1-2 封/日）。"""
    return {"letters": build_letters(db, user.id)}


@router.post("/expire")
def trigger_expire(db: Session = Depends(get_db)):
    """手动触发三日寄存过期清理（开发/演示用）。"""
    count = expire_ephemeral(db)
    return {"expired_count": count}
