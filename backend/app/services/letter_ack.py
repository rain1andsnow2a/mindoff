"""来信确认回应：用户点「收到啦」后生成一句温暖的短回复。

产品口径：这句话必须**出自当前激活桌宠的口吻**，而不是通用文案——
所以优先走 `run_companion`（BASE_PERSONA 红线 + 桌宠 `system_prompt` 人格层），
与聊天/睡前提醒同一套人格链路（对齐 bedtime_reminder.py）。

降级顺序：
1. 有激活桌宠 → run_companion（带人格）
2. 没有桌宠 → 通用 LLM 短回应（仍然温柔克制，只是没有人格层）
3. LLM 失败 → 预置池随机一句
"""
import logging
import random

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm import get_chat_model

logger = logging.getLogger(__name__)

# 回应上限（字符）。桌宠这句是"被回应到"的轻反馈，不是聊天，越短越好。
MAX_REPLY_CHARS = 50

_SYSTEM = (
    "你是用户的桌宠伙伴。用户刚读完你写给他的一封信并点了「收到啦」。"
    "请根据信件内容，用一句极短的话（≤30字）温暖地回应这个确认，"
    "语气轻松、温柔，像朋友间的默契回应。"
    "不要说教、不要重复信里的内容、不要用感叹号。"
    "只输出那一句话，不要引号、不要解释。"
)

# 喂给桌宠 agent 的触发语：让它以自己的人格应一句，而不是照抄模板
_PET_TRIGGER = (
    "（我刚读完你写给我的这封信，点了「收到啦」）\n"
    "信的内容是：{body}\n\n"
    "用你自己的方式轻轻应我一句就好，像被回应到了那样。"
    "30 字以内，不要重复信里的话，不要追问，不要给建议，不要用感叹号。"
)

_FALLBACKS = [
    "嗯，它知道你收到了",
    "好的，明天见",
    "收到就好，早点休息",
    "知道啦，陪你到这里",
    "嗯嗯，晚安",
    "它轻轻点了点头",
    "好，那就放心了",
]


def _clean(text: str | None) -> str:
    """去掉模型爱加的引号/空白；超长视为不合格。"""
    out = (text or "").strip().strip('"').strip("“”").strip("「」").strip()
    return out if out and len(out) <= MAX_REPLY_CHARS else ""


def generate_ack_response(letter_body: str, *, pet_prompt: str | None = None) -> str:
    """根据信件正文生成确认回应。

    pet_prompt 为当前激活桌宠的 system_prompt；传了就走带人格的 run_companion。
    任何失败都回落到预置池——这句话不重要到值得报错。
    """
    body = (letter_body or "").strip()
    if not body:
        return random.choice(_FALLBACKS)

    if pet_prompt:
        try:
            from app.graphs.companion import run_companion

            raw = run_companion(
                "free_chat",
                [{"role": "user", "content": _PET_TRIGGER.format(body=body[:300])}],
                pet_prompt=pet_prompt,
            )
            cleaned = _clean(raw)
            if cleaned:
                return cleaned
            logger.info("[letter_ack] 桌宠回应不合格（空或超长），退到通用回应")
        except Exception as e:  # noqa: BLE001
            logger.warning("[letter_ack] run_companion 失败，退到通用回应: %s", e)

    try:
        model = get_chat_model(temperature=0.8)
        resp = model.invoke([
            SystemMessage(content=_SYSTEM),
            HumanMessage(content=f"信件内容：{body[:200]}"),
        ])
        cleaned = _clean(resp.content)
        if cleaned:
            return cleaned
        return random.choice(_FALLBACKS)
    except Exception as e:  # noqa: BLE001
        logger.warning("[letter_ack] LLM fallback: %s", e)
        return random.choice(_FALLBACKS)
