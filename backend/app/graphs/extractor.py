"""双轴提取 LangGraph 图。

输入一次倾倒全文 → 输出结构化事实列表 [{layer, kind, depth, ...}]。
单次提取不产出 core 深度（Property 3）。
"""
from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from app.llm import get_chat_model
from app.models.memory import Depth, Kind, Layer

logger = logging.getLogger(__name__)

# ─── 合法枚举集 ────────────────────────────────────────────────────────────────

VALID_LAYERS = {e.value for e in Layer}
VALID_KINDS = {e.value for e in Kind}
VALID_DEPTHS_EXTRACT = {"surface", "personal", "vulnerable"}  # core 不由提取产出


# ─── 提示词 ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
你是 MindOff 的记忆整理助手。用户睡前一股脑倾诉，你要把它拆成一条条独立记忆并打三种标。
规则：
1) 先按语义分点，一件事/一种情绪/一个待办各成一条，不要合并。
2) 每条同时判 layer(episodic|state|profile)、kind(待办|小结|灵感|情绪|片段)、depth(surface|personal|vulnerable)。
3) depth 绝不输出 core——核心渴望/自我认同不在本步产生。
4) confidence 是"这条是否真实存在于原文"的把握(0-1)，不是重要性；推断成分越多越低。
5) surface_text 用第一人称、温和口吻改写，供日后向用户复述；content 保留原意事实。
6) 只输出 JSON 数组，无多余文字。字段: layer, kind, depth, content, surface_text, confidence, evidence(原文片段), entities(涉及的人/物/项目), emotion({label,intensity}|null)。
"""

FEW_SHOT = """\
示例输入: "明天下午三点要交季度报告，还没写完，好烦。其实我一直觉得自己不配现在这个职位。突然想到可以做个睡前语音日记的小功能。"
示例输出:
[
  {"layer":"episodic","kind":"待办","depth":"surface","content":"明天15:00前提交季度报告","surface_text":"你明天下午三点要交季度报告","confidence":0.98,"evidence":"明天下午三点要交季度报告","entities":["季度报告"],"emotion":{"label":"焦虑","intensity":0.6}},
  {"layer":"profile","kind":"情绪","depth":"vulnerable","content":"用户存在冒充者综合征式的自我怀疑","surface_text":"你有时会担心自己是不是不够格","confidence":0.85,"evidence":"觉得自己不配现在这个职位","entities":[],"emotion":{"label":"自我怀疑","intensity":0.8}},
  {"layer":"state","kind":"灵感","depth":"personal","content":"想法：睡前语音日记功能","surface_text":"你冒出一个点子——睡前语音日记","confidence":0.9,"evidence":"做个睡前语音日记的小功能","entities":["语音日记"],"emotion":null}
]
"""


# ─── State ─────────────────────────────────────────────────────────────────────

class ExtractorState(TypedDict):
    dump_text: str
    profile_context: str
    llm_output: str
    facts: list[dict[str, Any]]
    error: str


# ─── Nodes ─────────────────────────────────────────────────────────────────────

def call_llm(state: ExtractorState) -> dict:
    """调用 LLM 进行分类提取。"""
    model = get_chat_model(temperature=0.1)
    messages = [
        SystemMessage(content=SYSTEM_PROMPT + "\n" + FEW_SHOT),
        HumanMessage(content=(
            f"原始倾诉：\n{state['dump_text']}\n\n"
            "下面的既有理解只用于帮助消歧和沿用用户自己的称呼，不可覆盖原文、"
            "不可据此新增事实；冲突时以本次原文为准：\n"
            f"{state.get('profile_context') or '（无）'}"
        )),
    ]
    try:
        resp = model.invoke(messages)
        return {"llm_output": resp.content, "error": ""}
    except Exception as e:
        logger.error("Extractor LLM call failed: %s", e)
        return {"llm_output": "", "error": str(e)}


def parse_output(state: ExtractorState) -> dict:
    """解析 LLM 输出为结构化事实列表，丢弃越界条目。"""
    raw = state.get("llm_output", "")
    if not raw:
        return {"facts": [], "error": state.get("error", "empty LLM output")}

    # 提取 JSON 数组（兼容 markdown code fence）
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        items = json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning("Extractor JSON parse failed: %s | raw=%s", e, raw[:200])
        return {"facts": [], "error": f"JSON parse error: {e}"}

    if not isinstance(items, list):
        return {"facts": [], "error": "LLM output is not a JSON array"}

    # 校验每条，丢弃越界的
    valid: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        layer = item.get("layer", "")
        kind = item.get("kind", "")
        depth = item.get("depth", "")

        # 越界检查：core 不允许，枚举必须合法
        if depth not in VALID_DEPTHS_EXTRACT:
            logger.info("Dropping item with invalid depth=%r", depth)
            continue
        if layer not in VALID_LAYERS:
            logger.info("Dropping item with invalid layer=%r", layer)
            continue
        if kind not in VALID_KINDS:
            logger.info("Dropping item with invalid kind=%r", kind)
            continue

        # 规范化
        confidence = item.get("confidence", 0.8)
        if not isinstance(confidence, (int, float)):
            confidence = 0.8
        confidence = max(0.0, min(1.0, float(confidence)))

        valid.append({
            "layer": layer,
            "kind": kind,
            "depth": depth,
            "content": item.get("content", ""),
            "surface_text": item.get("surface_text", ""),
            "confidence": confidence,
            "evidence": item.get("evidence", ""),
            "entities": item.get("entities") or [],
            "emotion": item.get("emotion"),
        })

    return {"facts": valid, "error": ""}


# ─── Graph ─────────────────────────────────────────────────────────────────────

def _build_graph():
    graph = StateGraph(ExtractorState)
    graph.add_node("call_llm", call_llm)
    graph.add_node("parse_output", parse_output)
    graph.set_entry_point("call_llm")
    graph.add_edge("call_llm", "parse_output")
    graph.add_edge("parse_output", END)
    return graph.compile()


_extractor_graph = _build_graph()


# ─── Public API ────────────────────────────────────────────────────────────────

def run_extractor(dump_text: str, profile_context: str | None = None) -> list[dict[str, Any]]:
    """运行提取图，返回结构化事实列表。失败返回空列表。"""
    result = _extractor_graph.invoke({
        "dump_text": dump_text,
        "profile_context": profile_context or "",
        "llm_output": "",
        "facts": [],
        "error": "",
    })
    if result.get("error"):
        logger.warning("Extractor finished with error: %s", result["error"])
    return result.get("facts", [])
