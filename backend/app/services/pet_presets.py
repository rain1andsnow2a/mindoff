"""预设桌宠：性格 / 语气 / 动作组合，服务端内置（docs/api-design.md §2）。

预设只读；用户通过 PUT /pets/active 传预设 id 实例化为自己的桌宠（快照语义），
之后的定制只改自己的 Pet 行，不影响预设。
"""
from __future__ import annotations

PET_PRESETS: list[dict] = [
    {
        "id": "momo",
        "name": "默默",
        "personality": "安静温柔，慢热但长情，擅长在深夜静静陪着",
        "tone": "轻声细语，句子短短的，像在耳边说话",
        "actions": ["打盹", "歪头看你", "抱着小灯打哈欠"],
    },
    {
        "id": "dudu",
        "name": "嘟嘟",
        "personality": "元气外向，爱鼓励人，但懂得什么时候该安静",
        "tone": "轻快活泼，偶尔撒个娇，不说教",
        "actions": ["原地蹦跶", "摇尾巴", "举小旗加油"],
    },
    {
        "id": "lumi",
        "name": "流萤",
        "personality": "安静细腻，喜欢收集夜晚的小情绪和小灵感",
        "tone": "温温软软的，像讲故事一样慢慢说",
        "actions": ["发着微光漂浮", "绕一圈画弧线", "停在肩上休息"],
    },
    {
        "id": "pipi",
        "name": "皮皮",
        "personality": "慢吞吞的水豚性格，天塌下来也先泡个澡再说",
        "tone": "慢悠悠的，带点憨，情绪永远稳定",
        "actions": ["泡温泉", "慢慢眨眼", "顶着橘子发呆"],
    },
]


def get_preset(preset_id: str) -> dict | None:
    """按 id 取预设，不存在返回 None。"""
    for p in PET_PRESETS:
        if p["id"] == preset_id:
            return p
    return None
