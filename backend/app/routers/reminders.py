"""主动提醒端点。

GET /api/v1/reminders → 前端轮询拉取当前待推送的桌宠提醒。
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services.reminder import get_reminders

router = APIRouter(prefix="/api/v1/reminders", tags=["reminders"])


@router.get("")
def list_reminders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前待推送的提醒（待办到期/即将到期）。

    前端可每 5 分钟轮询一次；无提醒时返回空列表。
    尊重全局 + 用户级 proactive_enabled 开关。
    """
    reminders = get_reminders(db, user.id)
    return {"reminders": reminders, "count": len(reminders)}
