"""片场剧本生成（LLM）。把"牵动用户的经历"改写成视觉小说式场景，供体验另一种表达。

产品红线（§4.4）：只提供重新体验的空间，**不改写真实事实、不做心理诊断/治疗**。
均 best-effort：LLM 失败退模板兜底（对齐 companion/dump）。直连阶跃走 app/llm.py。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm import get_chat_model

logger = logging.getLogger(__name__)

MAX_TURNS = 3  # 约 3 轮选择后进入可结算态

_OPEN_SYSTEM = """你是 MindOff「片场」的编剧。把用户一段牵动他的经历，改写成一个温柔的
视觉小说式场景，让用户可以在其中尝试"另一种表达/回应"。规则：
- 不改写真实事实、不做心理诊断或治疗，只提供一个可以重新体验的空间。
- 氛围温柔、克制、不煽情；用第二人称"你"让用户代入。
- 只输出 JSON，无多余文字，结构：
  {"title": 短标题, "setting": 一句场景/氛围描述,
   "beats": [{"speaker": 说话人或"旁白", "text": 一句对白/旁白}]  (2-4 条),
   "choices": [{"id": "1", "label": 一种回应，简短}]  (2-3 个"另一种回应")}"""

_CONT_SYSTEM = """继续这个视觉小说场景。用户刚选了一种回应，请顺着自然写下去。
规则同前：不改事实、不治疗、温柔克制。只输出 JSON：
{"beats": [{"speaker","text"}] (1-3 条),
 "choices": [{"id","label"}] (剧情自然收束则给空数组 []),
 "ended": true/false}"""


# ─── 解析/规范化 ────────────────────────────────────────────────────────────

def _parse_json(raw: str) -> dict:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(raw)


def _norm_beats(beats: Any) -> list[dict]:
    out = []
    for b in (beats or []):
        if isinstance(b, dict) and b.get("text"):
            out.append({"speaker": str(b.get("speaker") or "旁白")[:20], "text": str(b["text"])[:400]})
    return out or [{"speaker": "旁白", "text": "场景缓缓展开……"}]


def _norm_choices(choices: Any) -> list[dict]:
    out = []
    for i, ch in enumerate((choices or [])[:3]):
        if isinstance(ch, dict) and ch.get("label"):
            out.append({"id": str(ch.get("id") or i + 1), "label": str(ch["label"])[:60]})
        elif isinstance(ch, str) and ch.strip():
            out.append({"id": str(i + 1), "label": ch.strip()[:60]})
    return out


def _fallback_opening(desc: str) -> dict:
    return {
        "title": "那一刻",
        "setting": "回到那个让你在意的场景，这一次，你可以慢慢来。",
        "beats": [{"speaker": "旁白", "text": (desc or "那件事又浮现在眼前。")[:200]}],
        "choices": [
            {"id": "1", "label": "说出当时没说出口的话"},
            {"id": "2", "label": "先什么都不说，待一会儿"},
        ],
    }


def _generate(desc: str) -> dict:
    try:
        model = get_chat_model(temperature=0.8)
        resp = model.invoke([SystemMessage(content=_OPEN_SYSTEM), HumanMessage(content=desc)])
        data = _parse_json(resp.content)
        return {
            "title": (data.get("title") or "那一刻")[:200],
            "setting": (data.get("setting") or "")[:1000],
            "beats": _norm_beats(data.get("beats")),
            "choices": _norm_choices(data.get("choices")) or _fallback_opening(desc)["choices"],
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] generate fallback: %s", e)
        return _fallback_opening(desc)


# ─── 对外 API（非流式）─────────────────────────────────────────────────────

def pkg_desc(pkg: dict) -> str:
    """把 stage.supply 的供给包转成生成用的描述文本。"""
    frag = pkg.get("fragment")
    lines = [f"经历：{getattr(frag, 'content', '') or getattr(frag, 'surface_text', '')}"]
    roles = [r.name for r in (pkg.get("roles") or []) if getattr(r, "name", None)]
    if roles:
        lines.append("涉及的人：" + "、".join(roles))
    deep = pkg.get("deep_memories") or []
    if deep:
        lines.append("相关的深层感受（仅供把握基调，勿直接复述）：")
        lines += [f"- {m.surface_text or m.content}" for m in deep[:3]]
    return "\n".join(lines)


def manual_desc(
    *, title: str | None = None, people: str | None = None,
    place: str | None = None, plot: str | None = None, intent: str | None = None,
) -> str:
    parts = []
    if title:
        parts.append(f"标题：{title}")
    if people:
        parts.append(f"人物：{people}")
    if place:
        parts.append(f"地点：{place}")
    if plot:
        parts.append(f"经过：{plot}")
    if intent:
        parts.append(f"想尝试的表达：{intent}")
    return "\n".join(parts) or "一段想重新体验的经历。"


def generate_opening(pkg: dict) -> dict:
    """从 stage.supply 的供给包生成开场。pkg = {fragment, roles, deep_memories}。"""
    return _generate(pkg_desc(pkg))


def generate_manual(
    *, title: str | None = None, people: str | None = None,
    place: str | None = None, plot: str | None = None, intent: str | None = None,
) -> dict:
    """从用户手动创建的字段生成开场。"""
    return _generate(manual_desc(title=title, people=people, place=place, plot=plot, intent=intent))


def advance(scene: dict, chosen_label: str) -> dict:
    """按所选回应推进剧情。scene = {setting, beats, history, turn}。返回 {beats, choices, ended}。"""
    turn = int(scene.get("turn") or 0) + 1
    try:
        model = get_chat_model(temperature=0.8)
        ctx = {
            "setting": scene.get("setting"),
            "history": scene.get("history"),
            "last_beats": scene.get("beats"),
            "chosen": chosen_label,
            "turn": turn,
        }
        resp = model.invoke([
            SystemMessage(content=_CONT_SYSTEM),
            HumanMessage(content=json.dumps(ctx, ensure_ascii=False)),
        ])
        data = _parse_json(resp.content)
        ended = bool(data.get("ended")) or turn >= MAX_TURNS
        return {
            "beats": _norm_beats(data.get("beats")),
            "choices": [] if ended else _norm_choices(data.get("choices")),
            "ended": ended,
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] advance fallback: %s", e)
        return {
            "beats": [{"speaker": "旁白", "text": "你们之间安静了一会儿，好像有什么被轻轻放下了。"}],
            "choices": [],
            "ended": True,
        }


# ─── 流式（SSE，按行浮现）────────────────────────────────────────────────────

_MARKER = "###CHOICES###"
_FALLBACK_CHOICES = [
    {"id": "1", "label": "说出没说出口的话"},
    {"id": "2", "label": "先静静待一会儿"},
]

_OPEN_TOKEN_SYSTEM = f"""你是 MindOff「片场」的编剧。把用户一段牵动他的经历，改写成温柔的
视觉小说式场景，让用户尝试"另一种表达/回应"。不改真实事实、不做心理诊断/治疗，
氛围温柔克制、用第二人称"你"。先自然地写这一幕的场景与对白（成段，2-4 句，可用「说话人：」标注），
写完后另起一行输出恰好一行标记 {_MARKER}，其后写 2-3 个"另一种回应"的简短选项，用全角竖线｜分隔。"""

_CONT_TOKEN_SYSTEM = """继续这个视觉小说场景，用户刚选了一种回应，顺着自然写下去。
不改事实、不治疗、温柔克制。先写 1-3 句场景/对白。{tail}"""
_CONT_TOKEN_CHOICES = f"写完后另起一行输出标记 {_MARKER}，其后写 2-3 个简短回应选项，用｜分隔。"
_CONT_TOKEN_FINAL = "这是最后一幕，请自然收束，不要输出任何标记或选项。"


def _parse_choices_text(text: str) -> list[dict]:
    """把 marker 之后的文本解析成选项（按 ｜/换行 切分）。"""
    raw = (text or "").strip().replace("|", "｜").replace("\n", "｜")
    labels = [x.strip(" -　*") for x in raw.split("｜") if x.strip(" -　*")]
    return [{"id": str(i + 1), "label": l[:60]} for i, l in enumerate(labels[:3])]


def _stream_tokens(messages, *, want_choices: bool):
    """逐 token 直传叙事文本：yield ('token', piece)（打字机效果）。

    遇到 ###CHOICES### 标记后转为收集选项文本，结束时 yield ('choices', [...])（want_choices 时）。
    全程只在 marker 处切一刀、不做逐行/JSON 解析——叙事就是模型 token 原样透传。
    只保留末尾 len(marker)-1 个字符待定，防止把跨 chunk 的半个 marker 当正文吐出去。
    """
    model = get_chat_model(temperature=0.8)
    hold = ""
    choices_mode = False
    choices_buf = ""
    keep = len(_MARKER) - 1
    try:
        for chunk in model.stream(messages):
            piece = chunk.content or ""
            if not piece:
                continue
            if choices_mode:
                choices_buf += piece
                continue
            hold += piece
            i = hold.find(_MARKER)
            if i != -1:
                if hold[:i]:
                    yield ("token", hold[:i])
                choices_mode = True
                choices_buf = hold[i + len(_MARKER):]
                hold = ""
            elif len(hold) > keep:
                yield ("token", hold[:-keep])
                hold = hold[-keep:]
        if not choices_mode and hold:
            yield ("token", hold)
        if want_choices:
            yield ("choices", _parse_choices_text(choices_buf) or _FALLBACK_CHOICES)
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] stream tokens fallback: %s", e)
        yield ("token", "（场景在这里轻轻顿了一下。）")
        if want_choices:
            yield ("choices", _FALLBACK_CHOICES)


def stream_opening_tokens(desc: str):
    """开场：逐 token yield 叙事，末尾 yield 选项。"""
    return _stream_tokens(
        [SystemMessage(content=_OPEN_TOKEN_SYSTEM), HumanMessage(content=desc)], want_choices=True
    )


def stream_advance_tokens(scene: dict, chosen_label: str, *, final: bool):
    """推进：逐 token yield 叙事；final=True 时不产选项（收束）。"""
    sys = _CONT_TOKEN_SYSTEM.format(tail=_CONT_TOKEN_FINAL if final else _CONT_TOKEN_CHOICES)
    ctx = {"setting": scene.get("setting"), "history": scene.get("history"),
           "last": scene.get("beats"), "chosen": chosen_label}
    return _stream_tokens(
        [SystemMessage(content=sys), HumanMessage(content=json.dumps(ctx, ensure_ascii=False))],
        want_choices=not final,
    )
