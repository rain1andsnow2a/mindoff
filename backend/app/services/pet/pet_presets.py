"""预设桌宠：性格 / 语气 / 动作组合 / 系统提示词，服务端内置（docs/api-design.md §2）。

预设只读；用户通过 PUT /pets/active 传预设 id 实例化为自己的桌宠（快照语义），
之后的定制只改自己的 Pet 行，不影响预设。
"""
from __future__ import annotations

from app.services.pet.pet_prompts import BOBI_SYSTEM_PROMPT, MIRO_SYSTEM_PROMPT

PET_PRESETS: list[dict] = [
    {
        "id": "miro",
        "name": "米露",
        "personality": "情绪碎片收藏家：安静、敏锐、擅长倾听和承接情绪",
        "tone": "轻、准，带一点非人类观察感，同时具有真实温度",
        "actions": ["歪头观察", "托住发光的碎片", "在附近安静地蜷成一团"],
        "system_prompt": MIRO_SYSTEM_PROMPT,
    },
    {
        "id": "bobi",
        "name": "波比",
        "personality": "晨光信使：温暖、热烈、有行动力，也尊重边界",
        "tone": "70% 清楚直接、30% 俏皮灵动",
        "actions": ["递来一杯水", "原地轻轻蹦一下", "准备两个小方案"],
        "system_prompt": BOBI_SYSTEM_PROMPT,
    },
]


def get_preset(preset_id: str) -> dict | None:
    """按 id 取预设，不存在返回 None。"""
    for p in PET_PRESETS:
        if p["id"] == preset_id:
            return p
    return None
