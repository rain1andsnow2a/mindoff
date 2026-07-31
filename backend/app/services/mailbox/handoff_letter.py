"""交接信正文生成：切换桌宠时，旧桌宠写给新桌宠的近况概要。

产品口径（文档 §4.5）：只概括计划/趋势，不复述敏感细节或已删除内容。
优先走 LLM（app/llm.py get_chat_model）；任何失败都退回模板拼接，绝不阻断切换
（对齐 companion.py 的温和兜底原则）。
"""
from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from app.llm import get_chat_model
from app.models.memory import Kind
from app.services.memory.memory_store import MemoryStore

logger = logging.getLogger(__name__)

_SYSTEM = """\
你在为 MindOff 写一封"交接信"：用户换了桌宠，旧桌宠把用户的近况交接给新桌宠。
守则：
- 只概括计划和趋势（进行中的待办、最近状态走向），不复述情绪细节、私密内容或具体事件。
- 以旧桌宠的口吻写给新桌宠，温柔简短，2-3 句话，中文口语。
- 不要给建议、不要诊断，不要把推测当事实。
"""


def _recent_context(db: Session, user_id: int) -> tuple[list[str], list[str]]:
    """取交接素材：进行中的待办 + 最近小结（只取 surface 层文本）。"""
    store = MemoryStore(db)
    todos = [
        i.surface_text or i.content
        for i in store.list_by_kind(user_id, Kind.todo.value)
        if i.status in (None, "pending")
    ][:5]
    summaries = [
        i.surface_text or i.content
        for i in store.list_by_kind(user_id, Kind.summary.value)
    ][:2]
    return todos, summaries


def _template_letter(
    from_name: str | None, to_name: str, todos: list[str], summaries: list[str]
) -> str:
    """模板兜底：LLM 不可用时的固定句式。"""
    plans = f"Ta 手头还有 {len(todos)} 件待办在进行中" if todos else "Ta 最近没什么待办在身"
    trend = "，最近的小结看起来状态还算平稳" if summaries else ""
    head = f"我是{from_name}，" if from_name else ""
    return (
        f"{to_name}你好，{head}把 Ta 交给你啦。{plans}{trend}。"
        "细节就不多说了，往后的日子你慢慢陪 Ta 就好。"
    )


def compose_handoff_letter(
    db: Session,
    user_id: int,
    *,
    from_pet_name: str | None,
    to_pet_name: str,
) -> str:
    """生成交接信正文。LLM 失败自动退回模板，绝不抛错阻断切换。"""
    todos, summaries = _recent_context(db, user_id)

    context_lines = [f"进行中的待办：{'；'.join(todos)}"] if todos else ["近期没有进行中的待办"]
    if summaries:
        context_lines.append(f"最近的小结要点：{'；'.join(summaries)}")
    who = f"旧桌宠「{from_pet_name}」写给新桌宠「{to_pet_name}」" if from_pet_name \
        else f"写给新桌宠「{to_pet_name}」（用户的第一只桌宠，没有旧桌宠）"

    try:
        model = get_chat_model(temperature=0.7)
        resp = model.invoke([
            SystemMessage(content=_SYSTEM),
            HumanMessage(content=f"{who}。近况素材：\n" + "\n".join(context_lines)),
        ])
        text = (resp.content or "").strip()
        if text:
            return text
        logger.warning("Handoff letter empty, falling back to template")
    except Exception as e:  # noqa: BLE001
        logger.error("Handoff letter LLM failed, falling back to template: %s", e)

    return _template_letter(from_pet_name, to_pet_name, todos, summaries)
