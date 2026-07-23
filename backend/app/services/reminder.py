"""主动提醒服务：扫描待办截止时间，生成桌宠提醒。

规则：
- 只提醒 status=pending 且 due_date ≤ 今天结束（含已过期）的待办
- 尊重全局 proactive_enabled + 用户级开关
- 每日每条待办最多提醒 1 次（用 reminded_at 字段或内存去重）
- 提醒文案用桌宠口吻，不催促、不施压（§4.6：低频可关、不用红点）
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.memory import MemoryItem
from app.services.trust import get_or_create

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _end_of_today() -> datetime:
    """今天 23:59:59 UTC。"""
    now = _utcnow()
    return now.replace(hour=23, minute=59, second=59, microsecond=999999)


def get_reminders(db: Session, user_id: int, *, limit: int = 3) -> list[dict[str, Any]]:
    """获取当前待推送的提醒列表。

    返回:
        [{memory_id, content, surface_text, due_date, urgency, message}]
    """
    settings = get_settings()
    if not settings.proactive_enabled:
        return []

    # 用户级开关
    ts = get_or_create(db, user_id)
    if not ts.proactive_enabled:
        return []

    eod = _end_of_today()
    now = _utcnow()

    # 查 pending 待办，due_date ≤ 今天结束
    stmt = select(MemoryItem).where(
        MemoryItem.user_id == user_id,
        MemoryItem.kind == "待办",
        MemoryItem.is_latest == True,  # noqa: E712
        MemoryItem.is_forgotten == False,  # noqa: E712
        MemoryItem.due_date != None,  # noqa: E711
        MemoryItem.due_date <= eod,
    )
    items = list(db.scalars(stmt).all())

    # 过滤：只要 pending 状态
    pending = [i for i in items if (i.status or "pending") == "pending"]

    reminders = []
    for item in pending[:limit]:
        # 判断紧急程度
        if item.due_date and item.due_date < now:
            urgency = "overdue"
            message = f"「{item.surface_text[:30]}」好像已经过了截止时间，需要我帮你重新安排吗？"
        elif item.due_date and (item.due_date - now).total_seconds() < 3600 * 3:
            urgency = "soon"
            message = f"提醒一下：「{item.surface_text[:30]}」快到期了（还剩不到 3 小时）。"
        else:
            urgency = "today"
            message = f"今天有一件事：「{item.surface_text[:30]}」，准备好了随时可以开始。"

        reminders.append({
            "memory_id": item.id,
            "content": item.content,
            "surface_text": item.surface_text,
            "due_date": item.due_date.isoformat() if item.due_date else None,
            "urgency": urgency,
            "message": message,
        })

    # 按紧急度排序：overdue > soon > today
    order = {"overdue": 0, "soon": 1, "today": 2}
    reminders.sort(key=lambda r: order.get(r["urgency"], 9))

    return reminders
