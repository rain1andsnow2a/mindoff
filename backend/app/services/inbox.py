"""信箱服务：今日待启、三日寄存遗忘、桌宠来信。

Property 6: build_today 只返回 depth=surface 记忆，绝不含 personal/vulnerable/core。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.memory import MemoryItem
from app.services.memory_store import MemoryStore

logger = logging.getLogger(__name__)

# 需行动的 kind（进「今日待启」）
ACTIONABLE_KINDS = {"待办"}

# 最小行动选项
ACTION_OPTIONS = ["加入日历", "加入待办", "暂缓一天", "补全时间", "确认已处理"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─── 今日待启 ──────────────────────────────────────────────────────────────────

def build_today(db: Session, user_id: int) -> dict[str, Any]:
    """构建「今日待启」：只取 depth=surface 且需行动的记忆。

    返回:
        {
            "actionable": [...],   # 可行动项（附最小行动选项）
            "needs_info": [...],   # 待补区（缺时间/地址）
        }
    """
    stmt = select(MemoryItem).where(
        MemoryItem.user_id == user_id,
        MemoryItem.depth == "surface",
        MemoryItem.kind.in_(ACTIONABLE_KINDS),
        MemoryItem.is_latest == True,  # noqa: E712
        MemoryItem.is_forgotten == False,  # noqa: E712
    )
    items = list(db.scalars(stmt).all())

    actionable = []
    needs_info = []

    for item in items:
        entry = {
            "memory_id": item.id,
            "content": item.content,
            "surface_text": item.surface_text,
            "kind": item.kind,
            "created_at": item.created_at.isoformat() if item.created_at else "",
            "actions": ACTION_OPTIONS,
        }
        # 判断是否缺必要信息（简单启发式：content 中无时间词）
        if _lacks_time_info(item.content):
            entry["missing"] = "时间"
            needs_info.append(entry)
        else:
            actionable.append(entry)

    return {"actionable": actionable, "needs_info": needs_info}


def _lacks_time_info(text: str) -> bool:
    """简单启发式：内容中是否含时间/日期相关词。"""
    time_hints = ["点", "号", "日", "周", "月", "年", "明天", "今天", "后天",
                  "上午", "下午", "晚上", "早", "午", ":"]
    return not any(h in text for h in time_hints)


# ─── 三日寄存遗忘 ──────────────────────────────────────────────────────────────

def expire_ephemeral(db: Session) -> int:
    """扫描过期的三日寄存内容，执行遗忘。返回遗忘条数。

    可由定时任务/启动时/请求前调用。幂等安全。
    """
    now = _utcnow()
    stmt = select(MemoryItem).where(
        MemoryItem.expires_at != None,  # noqa: E711
        MemoryItem.expires_at <= now,
        MemoryItem.is_forgotten == False,  # noqa: E712
    )
    expired = list(db.scalars(stmt).all())

    if not expired:
        return 0

    store = MemoryStore(db)
    count = 0
    for item in expired:
        try:
            store.forget(item.id, reason="ttl_72h_expired", actor="system")
            count += 1
        except Exception as e:
            logger.warning("Failed to expire item %d: %s", item.id, e)

    logger.info("Expired %d ephemeral items", count)
    return count


# ─── 桌宠来信 ──────────────────────────────────────────────────────────────────

def build_letters(db: Session, user_id: int) -> list[dict[str, Any]]:
    """生成桌宠来信（≤1-2 封/日）。

    黑客松简化版：基于近期记忆生成 1 封问候信。
    后续可接 LLM 生成个性化内容。
    """
    today = _utcnow().date()

    # 取近期（24h 内）的记忆作为素材
    from datetime import timedelta
    since = _utcnow() - timedelta(hours=24)
    stmt = select(MemoryItem).where(
        MemoryItem.user_id == user_id,
        MemoryItem.created_at >= since,
        MemoryItem.is_forgotten == False,  # noqa: E712
        MemoryItem.is_latest == True,  # noqa: E712
        MemoryItem.depth == "surface",  # 来信只引用表层
    )
    recent = list(db.scalars(stmt).all())

    letters: list[dict[str, Any]] = []

    # 信 1：早安问候（如果有近期记忆）
    if recent:
        # 挑一条作为话题
        topic = recent[0]
        letters.append({
            "type": "greeting",
            "title": "早安 ☀️",
            "body": f"昨晚你说的「{topic.surface_text[:30]}」，我帮你记着呢。今天也要加油哦。",
            "ref_memory_id": topic.id,
            "date": today.isoformat(),
        })

    # 信 2：待办提醒（如果有今日待办）
    todos = [r for r in recent if r.kind == "待办"]
    if todos and len(letters) < 2:
        todo_text = todos[0].surface_text[:30]
        letters.append({
            "type": "reminder",
            "title": "别忘了 📋",
            "body": f"今天有一件事：{todo_text}。准备好了随时可以开始。",
            "ref_memory_id": todos[0].id,
            "date": today.isoformat(),
        })

    return letters[:2]  # 硬限 ≤2 封
