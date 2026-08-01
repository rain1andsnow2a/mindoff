"""片场剧本生成（LLM）。把"牵动用户的经历"改写成视觉小说式场景，供体验另一种表达。

产品红线（§4.4）：只提供重新体验的空间，**不改写真实事实、不做心理诊断/治疗**。
均 best-effort：LLM 失败退模板兜底（对齐 companion/dump）。直连阶跃走 app/llm.py。
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.llm import get_chat_model

logger = logging.getLogger(__name__)

# 用户可以自由继续场景；仅限制每次发给模型的最近上下文，数据库仍保留完整历史。
CONTEXT_WINDOW = 12

# 所有要 JSON 的 prompt 都追加这段：模型在中文正文里吐英文双引号是 JSON 解析失败的头号原因
_JSON_RULE = (
    "\n严格要求：只输出一个 JSON 对象，前后不要有任何解释或 markdown 代码块。"
    "字符串内部禁止出现英文双引号 \"，需要引号时用中文「」。禁止尾随逗号。"
)

_OPEN_SYSTEM = """你是 MindOff「片场」的编剧。把用户一段牵动他的经历，改写成一个温柔的
视觉小说式场景，让用户可以在其中尝试"另一种表达/回应"。规则：
- 不改写真实事实、不做心理诊断或治疗，只提供一个可以重新体验的空间。
- 氛围温柔、克制、不煽情；用第二人称"你"让用户代入。
- 只输出 JSON，无多余文字，结构：
  {"title": 短标题, "setting": 一句场景/氛围描述,
   "beats": [{"speaker": 说话人或"旁白", "text": 一句对白/旁白}]  (2-4 条),
   "choices": [{"id": "1", "label": 一种回应，简短}]  (2-3 个"另一种回应")}""" + _JSON_RULE

_CONT_SYSTEM = """继续这个视觉小说场景。用户刚选了一种回应，请顺着自然写下去。
规则同前：不改事实、不治疗、温柔克制。只输出 JSON：
{"beats": [{"speaker","text"}] (1-3 条),
 "choices": [{"id","label"}] (始终给 2-3 个可继续的回应，即使语义已接近收束)}""" + _JSON_RULE


# ─── 解析/规范化 ────────────────────────────────────────────────────────────

def _strip_fence(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    return text


def _repair(text: str) -> str:
    """修常见的模型 JSON 毛病：尾随逗号、中文标点当分隔符、正文里的裸英文双引号。

    最后一招针对实测最常见的失败（"她说"我没事""）：把「键值对之外」的英文双引号
    换成中文引号。做法是重新扫一遍，只保留结构性引号（紧跟 { , : [ 或紧接 , : } ] 的那些）。
    """
    text = re.sub(r",\s*([}\]])", r"\1", text)          # 尾随逗号
    text = text.replace("，\n", ",\n").replace("：\"", ":\"")  # 偶发全角分隔符

    out: list[str] = []
    in_str = False
    stray_open = True   # 串内裸引号成对出现，交替换成「」
    for i, ch in enumerate(text):
        if ch != '"':
            out.append(ch)
            continue
        if text[i - 1: i] == "\\":                      # 已转义，原样
            out.append(ch)
            continue
        if not in_str:
            in_str = True
            stray_open = True
            out.append(ch)
            continue
        # 串内遇到引号：只有后面紧跟结构符时才认为是收尾引号
        rest = text[i + 1:].lstrip()
        if rest[:1] in (",", ":", "}", "]", ""):
            in_str = False
            out.append(ch)
        else:
            out.append("「" if stray_open else "」")     # 正文里的裸引号 → 中文引号
            stray_open = not stray_open
    return "".join(out)


def _first_object(text: str) -> str:
    """扫出第一个「括号配对完整」的 JSON 对象。

    应对模型在 JSON 后面又追加一段（实测 image prompts 报的 "Extra data"）：
    此时首尾花括号切片会横跨两个对象，反而更糟。跳过字符串内的括号。
    """
    depth = 0
    start = -1
    in_str = False
    escaped = False
    for i, ch in enumerate(text):
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                return text[start: i + 1]
    return ""


def _parse_json(raw: str) -> dict:
    """从模型输出里抠出 JSON 对象。

    依次尝试：原样 → 第一个配对完整的对象 → 首尾花括号切片 → 修复裸引号/尾随逗号。
    """
    text = _strip_fence(raw)
    candidates = [text]

    first = _first_object(text)
    if first:
        candidates.append(first)

    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start: end + 1])

    # 修复只对「最像 JSON」的那个候选做，避免在原始噪声上瞎改
    candidates.append(_repair(first or (candidates[-1] if candidates else text)))

    last_err: Exception | None = None
    for cand in candidates:
        if not cand:
            continue
        try:
            data = json.loads(cand)
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, ValueError) as e:
            last_err = e
    raise ValueError(f"无法解析为 JSON 对象: {last_err}")


def _invoke_json(messages: list, *, temperature: float = 0.8) -> dict:
    """调模型并解析 JSON；首次解析失败时带着原文回炉重试一次再放弃。"""
    model = get_chat_model(temperature=temperature)
    resp = model.invoke(messages)
    try:
        return _parse_json(resp.content)
    except ValueError as e:
        logger.info("[theater] JSON 首解析失败，重试一次: %s", e)
        retry = messages + [
            AIMessage(content=resp.content or ""),
            HumanMessage(
                content="上面的输出不是合法 JSON。请只重新输出那个 JSON 对象，"
                        "字符串内不要用英文双引号（改用「」），不要 markdown 代码块。"
            ),
        ]
        resp2 = model.invoke(retry)
        return _parse_json(resp2.content)



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


def _fallback_continue_choices() -> list[dict]:
    return [
        {"id": "1", "label": "再说一句心里真正想说的"},
        {"id": "2", "label": "先静静感受这一刻"},
    ]


def _generate(desc: str) -> dict:
    try:
        data = _invoke_json(
            [SystemMessage(content=_OPEN_SYSTEM), HumanMessage(content=desc)], temperature=0.8
        )
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


# ─── 场景整理（把自由描述抽成结构化字段）─────────────────────────────────────

_PARSE_SYSTEM = """你是 MindOff「片场」的场记。用户用大白话讲了一段他想重新经历的场景，
你要把它整理成结构化字段，回读给用户确认。

硬规则（违反即错误输出）：
- 只能用用户话里已有的信息。**没提到的字段留空字符串**，绝不编造地点、人物或情节。
- 「对方性格」只写用户描述过的具体行为倾向（例如"生气后会假装不在意"），
  绝不贴人格标签、不做心理诊断、不用医疗化表达。
- 每个字段都短，像便签而不是段落：地点/人物 ≤ 10 字，其余 ≤ 24 字。
- 人物用用户的称呼（"朋友""妈妈""她"），不要替用户起名字。

只输出 JSON：
{"title": "≤10字的场景标题",
 "place": "地点",
 "people": "人物称呼",
 "relation": "关系，如 朋友/父母/恋人/同事，判断不出就留空",
 "counterpart_action": "对方当前在做什么",
 "counterpart_traits": ["对方的行为倾向", "最多3条"],
 "intent": "用户想尝试的表达或行动",
 "missing": ["缺失字段的英文名，如 place"]}""" + _JSON_RULE

# 「场景整理」卡片的字段顺序与中文标签，前端直接按 items 渲染
PARSE_FIELD_LABELS: list[tuple[str, str]] = [
    ("place", "地点"),
    ("people", "人物"),
    ("counterpart_action", "对方当前行动"),
    ("counterpart_traits_text", "对方性格"),
    ("intent", "你想尝试"),
]


def _clean(value: Any, limit: int) -> str:
    return str(value or "").strip().strip("。，,.")[:limit]


def parse_narration(text: str) -> dict:
    """把用户的自由描述整理成「场景整理」页所需的结构化字段。

    返回 {title, place, people, relation, counterpart_action, counterpart_traits,
          intent, missing, items:[{label,value}], parsed:bool}
    parsed=False 表示 LLM 不可用、字段是从原文里退化截取的——前端据此提示用户手填。
    """
    narration = (text or "").strip()
    if not narration:
        return _fallback_parse("")

    try:
        data = _invoke_json(
            [SystemMessage(content=_PARSE_SYSTEM), HumanMessage(content=narration)],
            temperature=0.3,  # 抽取任务要稳，不要发散
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] parse_narration fallback: %s", e)
        return _fallback_parse(narration)

    traits = [
        _clean(t, 24) for t in (data.get("counterpart_traits") or [])
        if isinstance(t, (str, int, float)) and _clean(t, 24)
    ][:3]
    result = {
        "title": _clean(data.get("title"), 20) or "那一刻",
        "place": _clean(data.get("place"), 20),
        "people": _clean(data.get("people"), 20),
        "relation": _clean(data.get("relation"), 12),
        "counterpart_action": _clean(data.get("counterpart_action"), 40),
        "counterpart_traits": traits,
        "intent": _clean(data.get("intent"), 40),
        "parsed": True,
    }
    result["counterpart_traits_text"] = "、".join(traits)
    # missing 由服务端按实际内容重算，不信任模型自报
    result["missing"] = [
        key for key in ("place", "people", "counterpart_action", "intent")
        if not result.get(key)
    ]
    if not traits:
        result["missing"].append("counterpart_traits")
    result["items"] = [
        {"key": key, "label": label, "value": result.get(key) or ""}
        for key, label in PARSE_FIELD_LABELS
    ]
    return result


def _fallback_parse(narration: str) -> dict:
    """LLM 不可用时的退化：不编造内容，把原文放进「你想尝试」让用户自己改。"""
    result = {
        "title": "那一刻",
        "place": "",
        "people": "",
        "relation": "",
        "counterpart_action": "",
        "counterpart_traits": [],
        "counterpart_traits_text": "",
        "intent": narration[:40],
        "parsed": False,
        "missing": ["place", "people", "counterpart_action", "counterpart_traits"],
    }
    result["items"] = [
        {"key": key, "label": label, "value": result.get(key) or ""}
        for key, label in PARSE_FIELD_LABELS
    ]
    return result


# ─── 角色整理（把"介绍一下 TA"抽成行为倾向）───────────────────────────────────

_ROLE_SYSTEM = """你是 MindOff「片场」的场记。用户刚用大白话介绍了场景里的另一个人，
你要整理成「在这场对话中，TA 会怎么表现」的几条行为倾向，回读给用户确认。

硬规则（违反即错误输出）：
- 只能改写用户说过的内容，**不许补充用户没提的性格**。
- 只写可观察的行为倾向（"生气后会假装不在意""很少先开口道歉"），
  **绝不贴人格标签**（不许出现"回避型""讨好型""自恋"等）、不做心理诊断、不用医疗化表达。
- 每条 ≤ 20 字，用第三人称，共 2-5 条。用户说得少就少给几条，不要凑数。

只输出 JSON：{"traits": ["行为倾向", "..."]}""" + _JSON_RULE


def parse_role(
    *, name: str | None = None, relation: str | None = None,
    desc: str | None = None, extra_traits: list[str] | None = None,
) -> dict:
    """把用户对角色的口述整理成行为倾向列表。

    返回 {"traits": [...], "parsed": bool}。desc 为空时直接回落到 extra_traits
    （通常是场景整理阶段已抽到的对方行为倾向），不调用 LLM。
    """
    base = [str(t).strip()[:24] for t in (extra_traits or []) if str(t).strip()]
    text = (desc or "").strip()
    if not text:
        return {"traits": base[:5], "parsed": False}

    payload = {
        "称呼": (name or "TA").strip(),
        "关系": (relation or "").strip(),
        "用户的介绍": text,
        "此前已整理到的行为倾向": base,
    }
    try:
        data = _invoke_json(
            [SystemMessage(content=_ROLE_SYSTEM),
             HumanMessage(content=json.dumps(payload, ensure_ascii=False))],
            temperature=0.3,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] parse_role fallback: %s", e)
        return {"traits": (base or [text[:24]])[:5], "parsed": False}

    traits: list[str] = []
    for t in (data.get("traits") or []):
        cleaned = _clean(t, 24)
        if cleaned and cleaned not in traits:
            traits.append(cleaned)
    if not traits:
        return {"traits": (base or [text[:24]])[:5], "parsed": False}
    return {"traits": traits[:5], "parsed": True}


_IMG_PROMPT_SYSTEM = """你是 galgame 美术指导。根据一段场景种子，输出两段中文文生图 prompt。规则：
- 背景（bg）：描述场景/环境/氛围/时间/光线，galgame 视觉小说风格插画，柔和唯美，无人物、无文字水印。
- 立绘（sprite）：单个主要人物半身立绘，背景必须是均匀纯绿色幕布（solid #00FF00 green screen），
  人物发色、服装与配饰必须避开绿色，动漫赛璐璐风格，表情柔和，无文字。
- 每段 prompt 不超过 200 字；只输出 JSON：
  {"bg": "背景 prompt", "character_name": "人物名", "sprite": "立绘 prompt"}"""


def generate_image_prompts(
    *, title: str | None = None, people: str | None = None,
    place: str | None = None, plot: str | None = None, intent: str | None = None,
    setting: str | None = None,
) -> dict:
    """从场景种子生成 galgame 背景 + 立绘的文生图 prompt。

    返回 {"bg": str, "character_name": str, "sprite": str}；LLM 失败退模板兜底。
    """
    desc = manual_desc(title=title, people=people, place=place, plot=plot, intent=intent)
    if setting:
        desc = f"{desc}\n开场氛围：{setting}"
    first_person = (people.split("、")[0] if people else "").strip() or "角色"
    try:
        data = _invoke_json(
            [SystemMessage(content=_IMG_PROMPT_SYSTEM), HumanMessage(content=desc)], temperature=0.7
        )
        bg = str(data.get("bg") or "").strip()
        sprite = str(data.get("sprite") or "").strip()
        name = str(data.get("character_name") or "").strip() or first_person
        if bg and sprite:
            return {"bg": bg[:480], "character_name": name[:20], "sprite": sprite[:480]}
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] image prompts fallback: %s", e)
    place_txt = place or setting or "一个安静的地方"
    return {
        "bg": f"galgame 视觉小说风格插画，{place_txt}，柔和唯美的光线与氛围，无人物、无文字",
        "character_name": first_person[:20],
        "sprite": f"动漫赛璐璐风格，{first_person}的半身立绘，表情柔和，均匀纯绿色幕布背景（solid #00FF00 green screen），服装与发色避免绿色，无文字水印",
    }


def advance(scene: dict, chosen_label: str) -> dict:
    """按所选回应推进剧情。scene = {setting, beats, history, turn}。返回 {beats, choices, ended}。"""
    turn = int(scene.get("turn") or 0) + 1
    try:
        ctx = {
            "setting": scene.get("setting"),
            "history": (scene.get("history") or [])[-CONTEXT_WINDOW:],
            "last_beats": (scene.get("beats") or [])[-CONTEXT_WINDOW:],
            "chosen": chosen_label,
            "turn": turn,
        }
        data = _invoke_json(
            [
                SystemMessage(content=_CONT_SYSTEM),
                HumanMessage(content=json.dumps(ctx, ensure_ascii=False)),
            ],
            temperature=0.8,
        )
        return {
            "beats": _norm_beats(data.get("beats")),
            "choices": _norm_choices(data.get("choices")) or _fallback_continue_choices(),
            # 结束权归用户；保留字段仅兼容既有调用方，不再由模型或轮数自动置 True。
            "ended": False,
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] advance fallback: %s", e)
        return {
            "beats": [{"speaker": "旁白", "text": "你们之间安静了一会儿，好像有什么被轻轻放下了。"}],
            "choices": _fallback_continue_choices(),
            "ended": False,
        }


# ─── 流式（SSE，按行浮现）────────────────────────────────────────────────────

_MARKER = "###CHOICES###"
_CLOSURE_MARKER = "###CLOSURE###"
_FALLBACK_CHOICES = _fallback_continue_choices()

_OPEN_TOKEN_SYSTEM = f"""你是 MindOff「片场」的编剧。把用户一段牵动他的经历，改写成温柔的
视觉小说式场景，让用户尝试"另一种表达/回应"。不改真实事实、不做心理诊断/治疗，
氛围温柔克制、用第二人称"你"。先自然地写这一幕的场景与对白（成段，2-4 句，可用「说话人：」标注），
写完后另起一行输出恰好一行标记 {_MARKER}，其后写 2-3 个"另一种回应"的简短选项，用全角竖线｜分隔。"""

_CONT_TOKEN_SYSTEM = """继续这个视觉小说场景，用户刚选了一种回应，顺着自然写下去。
不改事实、不治疗、温柔克制。先写 1-3 句场景/对白。{tail}"""
_CONT_TOKEN_CHOICES = f"""写完后另起一行输出标记 {_MARKER}，其后写 2-3 个简短回应选项，用｜分隔。
再另起一行输出标记 {_CLOSURE_MARKER}，其后只能写 ready 或 continue：
- 只有当用户的核心意思已经表达清楚、当前对话形成自然闭环时写 ready；
- 仍有明显未回应内容或只是普通停顿时写 continue；
- 不得因为轮数多而写 ready。即使写 ready，也必须照常提供回应选项，结束由用户决定。"""


def _parse_choices_text(text: str) -> list[dict]:
    """把 marker 之后的文本解析成选项（按 ｜/换行 切分）。"""
    raw = (text or "").strip().replace("|", "｜").replace("\n", "｜")
    labels = [x.strip(" -　*") for x in raw.split("｜") if x.strip(" -　*")]
    return [{"id": str(i + 1), "label": l[:60]} for i, l in enumerate(labels[:3])]


def _stream_tokens(messages, *, want_choices: bool, want_closure: bool = False):
    """逐 token 直传叙事文本：yield ('token', piece)（打字机效果）。

    遇到 ###CHOICES### 标记后转为收集选项文本，结束时 yield ('choices', [...])（want_choices 时）；
    want_closure 时再解析 ###CLOSURE###，仅返回是否建议收束，不改变场景状态。
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
            choices_text = choices_buf
            closure_ready = False
            if want_closure and _CLOSURE_MARKER in choices_buf:
                choices_text, closure_text = choices_buf.split(_CLOSURE_MARKER, 1)
                closure_ready = closure_text.strip().lower().startswith("ready")
            yield ("choices", _parse_choices_text(choices_text) or _FALLBACK_CHOICES)
            if want_closure:
                yield ("closure", closure_ready)
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] stream tokens fallback: %s", e)
        yield ("token", "（场景在这里轻轻顿了一下。）")
        if want_choices:
            yield ("choices", _FALLBACK_CHOICES)
        if want_closure:
            yield ("closure", False)


def stream_opening_tokens(desc: str):
    """开场：逐 token yield 叙事，末尾 yield 选项。"""
    return _stream_tokens(
        [SystemMessage(content=_OPEN_TOKEN_SYSTEM), HumanMessage(content=desc)], want_choices=True
    )


def stream_advance_tokens(scene: dict, chosen_label: str):
    """推进并持续提供选项；closure 仅供前端建议收束，不会自动结束。"""
    sys = _CONT_TOKEN_SYSTEM.format(tail=_CONT_TOKEN_CHOICES)
    ctx = {
        "setting": scene.get("setting"),
        "history": (scene.get("history") or [])[-CONTEXT_WINDOW:],
        "last": (scene.get("beats") or [])[-CONTEXT_WINDOW:],
        "chosen": chosen_label,
    }
    return _stream_tokens(
        [SystemMessage(content=sys), HumanMessage(content=json.dumps(ctx, ensure_ascii=False))],
        want_choices=True,
        want_closure=True,
    )


# ─── 结算摘要（LLM 生成结算卡内容）─────────────────────────────────────────────

_SUMMARY_SYSTEM = """你是 MindOff「片场」的回看引导者。场景刚结束，请帮助用户从剧情中退到观众席，
但不要替用户宣布这段经历的唯一意义。
规则：
- 温柔、克制、不说教、不治疗，绝不贴标签或做诊断。
- key_quote：从用户在对话中说过的原话里，摘出最有力量/最有表达意义的一句（≤30 字）。如果用户的表达都很短，直接用最有触动的那句。
- reflection_options：给 3 个第一人称视角候选（每条≤32字），回答「坐在观众席看，当时的我最想让别人知道什么」。
  候选只能基于用户明确说过的内容，允许用户否定；不能写「你真正害怕/其实你是」等断言，也不能猜对方内心。
- companion_comment：以陪伴角色身份写一句话（≤40 字），陪用户把这一幕暂时放下，不评价对错或声称已经疗愈。
- action_hint：一个可选的、可撤回的小动作（≤20 字），使用「下次可以先……」这类非命令语气。
只输出 JSON：{"key_quote": "...", "reflection_options": ["...", "...", "..."],
"companion_comment": "...", "action_hint": "..."}""" + _JSON_RULE

_SUMMARY_FALLBACK = {
    "key_quote": "……",
    "reflection_options": [
        "我不是不在乎，只是当时不知道怎么表达",
        "那时的我，也在尽力面对这一刻",
        "我希望自己的感受能被认真听见",
    ],
    "companion_comment": "这一幕不需要马上得出答案，我们可以先把它放在这里。",
    "action_hint": "下次可以先说清自己的感受",
}


def _norm_reflection_options(value: Any) -> list[str]:
    """视角候选只做可否定的第一人称提示；去空、去重并固定为三条。"""
    out: list[str] = []
    for item in value if isinstance(value, list) else []:
        text = str(item or "").strip().strip("。")[:32]
        if text and text not in out:
            out.append(text)
    for fallback in _SUMMARY_FALLBACK["reflection_options"]:
        if len(out) >= 3:
            break
        if fallback not in out:
            out.append(fallback)
    return out[:3]


def summarize(scene: dict) -> dict:
    """生成回看引导：原话、可否定的视角候选、陪伴落款与可选小动作。"""
    beats = (scene.get("beats") or [])[-CONTEXT_WINDOW:]
    history = (scene.get("history") or [])[-CONTEXT_WINDOW:]
    setting = scene.get("setting") or ""

    # 拼装对话记录给 LLM
    dialogue_lines = []
    for b in beats:
        speaker = b.get("speaker", "旁白")
        text = b.get("text", "")
        if text:
            dialogue_lines.append(f"{speaker}：{text}")
    for h in history:
        choice = h.get("choice", "")
        if choice:
            dialogue_lines.append(f"用户选择了：{choice}")

    if not dialogue_lines:
        return dict(_SUMMARY_FALLBACK)

    ctx = f"场景设定：{setting}\n\n对话记录：\n" + "\n".join(dialogue_lines)

    try:
        data = _invoke_json(
            [SystemMessage(content=_SUMMARY_SYSTEM), HumanMessage(content=ctx)],
            temperature=0.7,
        )
        return {
            "key_quote": str(data.get("key_quote") or _SUMMARY_FALLBACK["key_quote"]),
            "reflection_options": _norm_reflection_options(data.get("reflection_options")),
            "companion_comment": str(data.get("companion_comment") or _SUMMARY_FALLBACK["companion_comment"]),
            "action_hint": str(data.get("action_hint") or _SUMMARY_FALLBACK["action_hint"]),
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("[theater] summarize fallback: %s", e)
        return dict(_SUMMARY_FALLBACK)
