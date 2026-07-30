"""生成式 3D 场景规格（方案 A 后端）：LLM 依据场景 seed 产出 SceneSpec(JSON)。

前端 theater/generated/assemble.ts 据此拼装低多边形 3D 场景。为保证「离线可跑、
稳定兜底、只用零件目录内的件」，本模块对 LLM 输出做严格校验与清洗：
- 零件 type 必须在白名单内（与前端 props.ts 目录同步），未知件丢弃；
- 位置/朝向/缩放/数量做范围钳制与上限，避免畸形场景；
- 任何异常都返回 None，调用方降级到 dynamic_image / 预置 3D。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.llm import get_chat_model

logger = logging.getLogger(__name__)

# 与前端 src/theater/generated/props.ts 的 PROP_TYPES 保持一致（改动需两端同步）。
ALLOWED_PROPS = {
    # 基础件
    "pineTree", "rock", "bush", "chair", "table", "bench", "crate", "rug",
    "wall", "window", "lamp", "streetlight", "tent", "campfire", "luggage",
    # 抽自现有场景的大件（背景/地标）
    "water", "bed", "cityscape", "platform", "train", "airportSeats", "departureBoard",
    # 氛围动画
    "rain", "stringLights", "fireflies",
    # 情感锚点小物
    "emptyChair", "photoFrame", "teacup",
}
ALLOWED_TIME = {"day", "dusk", "night"}
ALLOWED_MODE = {"indoor", "outdoor"}
ALLOWED_POSE = {"standing", "sitting", "phone"}

MAX_PROPS = 16
MAX_CHARACTERS = 3
COORD_LIMIT = 12.0  # 位置坐标绝对值上限（米）

SPEC_SYSTEM_PROMPT = """\
你是 MindOff 的「场景搭建师」。用户想在一个安全的低多边形 3D 小场景里，把没说完的话重演一遍。
根据给定的场景信息，输出一份**只用给定零件**拼装的场景规格 JSON。

只能用这些零件 type（其余一律不要用）：
{props}

严格输出如下结构的 JSON，不要额外解释、不要 markdown 代码块：
{{
  "env": {{
    "mode": "indoor" | "outdoor",
    "time": "day" | "dusk" | "night",
    "ground": {{ "color": "#RRGGBB" }},          // 可省
    "stars": true,                                  // 户外夜晚可开；可省
    "moon": true,                                   // 户外夜晚可开；可省
    "mountains": true                               // 户外可开；可省
  }},
  "props": [
    {{ "type": "零件type", "pos": [x, 0, z], "rotY": 0.0, "scale": 1.0, "params": {{ "color": "#RRGGBB" }} }}
  ],
  "characters": [
    {{ "pos": [x, 0, z], "rotY": 0.0, "pose": "standing|sitting|phone", "bodyColor": "#RRGGBB" }}
  ]
}}

约束：
- 坐标以场景中心 (0,0,0) 为原点，人物一般在原点附近；x/z 在 -8~8 之间，y 一般为 0。
- 零件数量 3~10 个；人物 1~2 个，正好对应用户描述里的人。
- 颜色用低饱和、柔和的色，贴合治愈氛围；夜晚偏冷、白天偏暖。
- 只摆放能体现「地点 + 氛围」的关键件，不要堆砌。宁少勿多、宁简勿写实。
- 若信息不足以判断室内外/时段，就选最贴合情绪的合理默认。
"""


def _clamp(v: Any, lo: float, hi: float, fallback: float) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return fallback


def _vec3(v: Any) -> list[float] | None:
    """把任意输入规整成 [x,y,z]（坐标钳制到 ±COORD_LIMIT）；非法返回 None。"""
    if not isinstance(v, (list, tuple)) or len(v) != 3:
        return None
    return [_clamp(v[0], -COORD_LIMIT, COORD_LIMIT, 0.0),
            _clamp(v[1], -COORD_LIMIT, COORD_LIMIT, 0.0),
            _clamp(v[2], -COORD_LIMIT, COORD_LIMIT, 0.0)]


def _sanitize(parsed: Any) -> dict[str, Any] | None:
    """校验并清洗 LLM 输出为安全的 SceneSpec dict；结构非法返回 None。"""
    if not isinstance(parsed, dict):
        return None
    env_in = parsed.get("env")
    if not isinstance(env_in, dict):
        return None
    mode = env_in.get("mode") if env_in.get("mode") in ALLOWED_MODE else "outdoor"
    time = env_in.get("time") if env_in.get("time") in ALLOWED_TIME else "night"
    env: dict[str, Any] = {"mode": mode, "time": time}
    for key in ("stars", "moon", "mountains"):
        if isinstance(env_in.get(key), bool):
            env[key] = env_in[key]
    if isinstance(env_in.get("ground"), dict) and isinstance(env_in["ground"].get("color"), str):
        env["ground"] = {"color": env_in["ground"]["color"][:9]}

    props_out: list[dict[str, Any]] = []
    for inst in (parsed.get("props") or [])[:MAX_PROPS]:
        if not isinstance(inst, dict) or inst.get("type") not in ALLOWED_PROPS:
            continue
        p: dict[str, Any] = {"type": inst["type"]}
        pos = _vec3(inst.get("pos"))
        if pos:
            p["pos"] = pos
        if isinstance(inst.get("rotY"), (int, float)):
            p["rotY"] = float(inst["rotY"])
        if isinstance(inst.get("scale"), (int, float)):
            p["scale"] = _clamp(inst["scale"], 0.2, 4.0, 1.0)
        if isinstance(inst.get("params"), dict):
            # 只透传原始值（颜色/尺寸等），前端 props 再各自兜底
            p["params"] = {k: v for k, v in inst["params"].items()
                           if isinstance(v, (str, int, float, bool))}
        props_out.append(p)

    chars_out: list[dict[str, Any]] = []
    for c in (parsed.get("characters") or [])[:MAX_CHARACTERS]:
        if not isinstance(c, dict):
            continue
        cc: dict[str, Any] = {}
        pos = _vec3(c.get("pos"))
        if pos:
            cc["pos"] = pos
        if isinstance(c.get("rotY"), (int, float)):
            cc["rotY"] = float(c["rotY"])
        if c.get("pose") in ALLOWED_POSE:
            cc["pose"] = c["pose"]
        for key in ("bodyColor", "skinColor", "hairColor"):
            if isinstance(c.get(key), str):
                cc[key] = c[key][:9]
        chars_out.append(cc)

    return {"env": env, "props": props_out, "characters": chars_out}


def _parse(raw: str) -> dict[str, Any] | None:
    """解析 LLM 文本为 SceneSpec dict（剥离 ```fence、json.loads、清洗）。"""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        logger.warning("[scene-spec] LLM output not JSON: %.200s", text)
        return None
    return _sanitize(parsed)


def generate_scene_spec(seed: dict[str, Any]) -> dict[str, Any] | None:
    """由场景 seed（title/people/place/plot/intent）生成校验后的 SceneSpec；失败返回 None。

    调用方在 render_kind=generated_3d 时用它，产物存进 scenes.scene_spec 供前端拼装。
    """
    place = str(seed.get("place") or "").strip()
    plot = str(seed.get("plot") or "").strip()
    people = seed.get("people") or []
    if not (place or plot):
        return None

    desc = "\n".join(filter(None, [
        f"标题：{seed.get('title')}" if seed.get("title") else "",
        f"地点：{place}" if place else "",
        f"在场的人：{'、'.join(str(p) for p in people)}" if people else "",
        f"经过：{plot}" if plot else "",
        f"想达成：{seed.get('intent')}" if seed.get("intent") else "",
    ]))

    try:
        llm = get_chat_model()
        resp = llm.invoke([
            {"role": "system", "content": SPEC_SYSTEM_PROMPT.format(props="、".join(sorted(ALLOWED_PROPS)))},
            {"role": "user", "content": f"场景信息：\n{desc}"},
        ])
    except Exception as e:  # noqa: BLE001
        logger.warning("[scene-spec] LLM call failed: %s", e)
        return None

    spec = _parse(resp.content)
    if spec is None or not spec.get("props"):
        return None
    return spec
