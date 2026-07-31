"""信箱服务：今日待启、三日寄存遗忘、桌宠来信。

Property 6: build_today 只返回 depth=surface 记忆，绝不含 personal/vulnerable/core。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.memory import MemoryItem

logger = logging.getLogger(__name__)

# 寄存 TTL（天）：倾倒产生的情绪/未确认片段默认寄存时长，到期硬删。
# 单一事实源，dump_ingest 与文档口径都引用此值。
EPHEMERAL_TTL_DAYS = 7

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

def _hard_delete_memory(db: Session, item: MemoryItem) -> None:
    """物理删除一条记忆及其历史（隐私红线：到期真删，不留任何痕迹）。

    外键=ON，删前先断开所有指向本条的引用（其它记忆的 parent/root/relation
    及自身自引用），否则 FK 会拦截。历史行随 relationship cascade 一并删除。
    这是记忆系统「软删+历史审计」(Property 4) 的受限例外，仅用于到期寄存。
    """
    referers = db.scalars(
        select(MemoryItem).where(
            or_(
                MemoryItem.parent_id == item.id,
                MemoryItem.root_id == item.id,
                MemoryItem.relation_to_id == item.id,
            ),
            MemoryItem.id != item.id,
        )
    ).all()
    for r in referers:
        if r.parent_id == item.id:
            r.parent_id = None
        if r.root_id == item.id:
            r.root_id = None
        if r.relation_to_id == item.id:
            r.relation_to_id = None
    item.parent_id = None
    item.root_id = None
    item.relation_to_id = None
    db.flush()
    db.delete(item)  # cascade="all, delete-orphan" 连带删 history


def expire_ephemeral(db: Session) -> int:
    """扫描过期的寄存内容，到期真删（物理删除，不保留人物/地点/原话/事件）。

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

    count = 0
    for item in expired:
        try:
            _hard_delete_memory(db, item)
            count += 1
        except Exception as e:
            logger.warning("Failed to hard-delete expired item %d: %s", item.id, e)

    db.commit()
    logger.info("Hard-deleted %d expired ephemeral items", count)
    return count


# ─── 桌宠来信 ──────────────────────────────────────────────────────────────────

def build_letters(db: Session, user_id: int) -> list[dict[str, Any]]:
    """生成并持久化桌宠来信（≤1-2 封/日）。

    幂等：当天已有来信则直接返回，不再重复生成。
    黑客松简化版：基于近期记忆生成 1-2 封信，并落库为 Letter。
    """
    from datetime import timedelta

    from app.services.mailbox.letter_store import LetterStore
    from app.services.pet.pet_store import PetStore

    today_start = _utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # 当天已有来信 → 直接返回，避免重复生成
    # SQLite 存的是 naive UTC，需先补时区再比较
    existing_today = []
    for l in LetterStore(db).list_for_user(user_id, limit=10):
        if l.created_at is None:
            continue
        created = l.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if created >= today_start:
            existing_today.append(l)
    if existing_today:
        return [_letter_dict(l) for l in existing_today[:2]]

    # 取近期（24h 内）的记忆作为素材
    since = _utcnow() - timedelta(hours=24)
    stmt = select(MemoryItem).where(
        MemoryItem.user_id == user_id,
        MemoryItem.created_at >= since,
        MemoryItem.is_forgotten == False,  # noqa: E712
        MemoryItem.is_latest == True,  # noqa: E712
        MemoryItem.depth == "surface",  # 来信只引用表层
    )
    recent = list(db.scalars(stmt).all())

    letters_to_create: list[dict[str, Any]] = []

    # 信 1：早安问候（如果有近期记忆）
    if recent:
        topic = recent[0]
        letters_to_create.append({
            "type": "greeting",
            "title": "早安 ☀️",
            "body": f"昨晚你说的「{topic.surface_text[:30]}」，我帮你记着呢。今天也要加油哦。",
            "ref_memory_id": topic.id,
        })

    # 信 2：待办提醒（如果有今日待办）
    todos = [r for r in recent if r.kind == "待办"]
    if todos and len(letters_to_create) < 2:
        todo_text = todos[0].surface_text[:30]
        letters_to_create.append({
            "type": "reminder",
            "title": "别忘了 📋",
            "body": f"今天有一件事：{todo_text}。准备好了随时可以开始。",
            "ref_memory_id": todos[0].id,
        })

    pet = PetStore(db).get_active(user_id)
    created: list[dict[str, Any]] = []
    for data in letters_to_create[:2]:
        letter = LetterStore(db).create(
            user_id=user_id,
            type=data["type"],
            title=data["title"],
            body=data["body"],
            pet_id=pet.id if pet is not None else None,
            ref_memory_id=data.get("ref_memory_id"),
        )
        created.append(_letter_dict(letter))

    return created


def _letter_dict(letter: Any) -> dict[str, Any]:
    """把 Letter 模型转为与 /letters 输出一致的 dict。"""
    return {
        "id": letter.id,
        "type": letter.type,
        "title": letter.title,
        "body": letter.body,
        "pet_id": letter.pet_id,
        "ref_memory_id": letter.ref_memory_id,
        "attachment": letter.attachment,
        "is_read": letter.is_read,
        "created_at": letter.created_at.isoformat() if letter.created_at else "",
    }
