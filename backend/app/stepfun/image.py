"""阶跃文生图（POST /v1/images/generations，默认 step-image-edit-2）。

文档：https://platform.stepfun.com/docs/zh/api-reference/images/image
- step-image-edit-2 的 size 格式为「height x width」（如 1360x768 = 竖屏背景）；
- response_format 用 b64_json（阶跃返回的临时 URL 30 天失效，必须转存本地）；
- finish_reason == "content_filtered" 表示风控拦截，视为失败抛异常，上层可降级。

尺寸约定：
- 场景背景（竖屏）：1360x768
- 角色立绘：1184x896（绿幕出图，落盘前抠成透明 PNG，见 remove_green_screen）
"""
import base64
import io
import logging
import uuid
from pathlib import Path

import httpx

from app.config import get_settings
from app.stepfun.constants import IMAGE_GENERATIONS

logger = logging.getLogger(__name__)

# prompt 上限（文档：最长 512 字符），超长截断而非报错
MAX_PROMPT_CHARS = 512

# 生图默认参数（黑客松取低步数快出图）
DEFAULT_SIZE_BG = "1360x768"      # 竖屏背景（height x width）
DEFAULT_SIZE_SPRITE = "1184x896"  # 角色立绘
DEFAULT_STEPS = 8
DEFAULT_CFG_SCALE = 1.0

# 转存目录：backend/static/scene_images/
STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"
SCENE_IMAGE_DIR = STATIC_DIR / "scene_images"

# --- 立绘绿幕抠图（DAY-230：立绘带 alpha 通道，真 galgame 效果）---
# 容差：与幕布色的最大通道差 ≤ TOL_IN 判为背景（透明），≥ TOL_OUT 判为前景
# （不透明），中间线性过渡保留边缘抗锯齿。
KEY_TOL_IN = 48
KEY_TOL_OUT = 140
KEY_SAMPLE = 12          # 四角采样色块边长（px）
KEY_MIN_REMOVE = 0.05    # 抠除面积占比低于此值视为失败（模型没给纯色幕布）
KEY_MAX_REMOVE = 0.95    # 高于此值视为失败（整图几乎同色，抠了会没人物）


class ImageGenError(RuntimeError):
    """文生图失败（网络/风控/响应异常），上层捕获后走降级。"""


def remove_green_screen(img_bytes: bytes) -> bytes:
    """把绿幕立绘抠成带 alpha 的 PNG bytes；抠图失败时原样返回输入 bytes。

    算法：四角采样得幕布色 → 各通道差取最大值作色度距离 → 按容差线性出
    alpha → 前景去绿边（g 钳制到 max(r, b)）→ 面积 sanity check，异常回退。
    任何一步异常都返回原图，绝不让场景没立绘。
    """
    try:
        from PIL import Image, ImageChops

        im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        w, h = im.size
        s = max(2, min(KEY_SAMPLE, w // 4, h // 4))
        # 四角平均色 → 幕布色（抗模型输出的轻微色差/噪点）
        corners = [
            im.crop(box).resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
            for box in [(0, 0, s, s), (w - s, 0, w, s), (0, h - s, s, h), (w - s, h - s, w, h)]
        ]
        key = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

        # 色度距离 = 各通道与幕布色差的最大值（全 C 实现，无需逐像素循环）
        diff = ImageChops.difference(im, Image.new("RGB", im.size, key))
        r, g, b = diff.split()
        dist = ImageChops.lighter(ImageChops.lighter(r, g), b)
        # alpha：≤TOL_IN → 0，≥TOL_OUT → 255，中间线性（保留发丝/边缘过渡）
        lut = [
            min(255, max(0, round((v - KEY_TOL_IN) * 255 / (KEY_TOL_OUT - KEY_TOL_IN))))
            for v in range(256)
        ]
        alpha = dist.point(lut)

        # sanity check：抠除面积占比异常说明幕布假设不成立，回退原图
        transparent = sum(alpha.histogram()[:128]) / (w * h)
        if not (KEY_MIN_REMOVE <= transparent <= KEY_MAX_REMOVE):
            logger.warning(
                "[chroma_key] 抠除面积占比 %.2f 异常（key=%s），保留原图", transparent, key
            )
            return img_bytes

        # 去绿边 spill：前景像素 g 超过 max(r, b) 的部分削掉
        r0, g0, b0 = im.split()
        spill = ImageChops.subtract(g0, ImageChops.lighter(r0, b0))
        g_fixed = ImageChops.subtract(g0, spill)
        out = Image.merge("RGB", (r0, g_fixed, b0))
        out.putalpha(alpha)

        buf = io.BytesIO()
        out.save(buf, format="PNG")
        logger.info(
            "[chroma_key] 立绘抠图完成：key=%s 透明占比 %.2f", key, transparent
        )
        return buf.getvalue()
    except Exception as e:  # noqa: BLE001
        logger.warning("[chroma_key] 抠图失败，保留原图: %s", e)
        return img_bytes


def _url() -> str:
    return get_settings().stepfun_base_url.rstrip("/") + IMAGE_GENERATIONS


def _headers() -> dict[str, str]:
    s = get_settings()
    return {**s.auth_header, "Content-Type": "application/json"}


async def generate_image(
    prompt: str,
    *,
    size: str = DEFAULT_SIZE_BG,
    model: str | None = None,
    steps: int = DEFAULT_STEPS,
    cfg_scale: float = DEFAULT_CFG_SCALE,
) -> bytes:
    """调阶跃文生图，返回解码后的图片 bytes（PNG）。

    失败（HTTP 错误 / 风控 content_filtered / 响应缺 b64_json）统一抛 ImageGenError。
    """
    prompt = (prompt or "").strip()[:MAX_PROMPT_CHARS]
    if not prompt:
        raise ImageGenError("prompt 为空")

    body = {
        "model": model or get_settings().step_image_model,
        "prompt": prompt,
        "size": size,
        "steps": steps,
        "cfg_scale": cfg_scale,
        "response_format": "b64_json",
    }
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.post(_url(), headers=_headers(), json=body)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as e:
        raise ImageGenError(f"文生图请求失败: {e}") from e

    items = data.get("data") or []
    if not items:
        raise ImageGenError(f"文生图响应无 data: {data}")
    item = items[0]
    if item.get("finish_reason") == "content_filtered":
        raise ImageGenError("文生图被风控拦截（content_filtered）")
    b64 = item.get("b64_json")
    if not b64:
        raise ImageGenError("文生图响应缺 b64_json")
    try:
        return base64.b64decode(b64)
    except Exception as e:  # noqa: BLE001
        raise ImageGenError(f"b64_json 解码失败: {e}") from e


async def generate_and_store(
    prompt: str,
    *,
    kind: str = "bg",
    size: str | None = None,
) -> str:
    """生成图片并转存到 backend/static/scene_images/，返回相对 URL。

    kind: "bg"（场景背景，1360x768）| "sprite"（角色立绘，1184x896）。
    返回形如 /static/scene_images/{uuid}.png，前端拼 API_BASE 即可访问。
    """
    if size is None:
        size = DEFAULT_SIZE_SPRITE if kind == "sprite" else DEFAULT_SIZE_BG
    img = await generate_image(prompt, size=size)
    if kind == "sprite":
        img = remove_green_screen(img)  # 失败内部已回退原图

    SCENE_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.png"
    path = SCENE_IMAGE_DIR / name
    path.write_bytes(img)
    logger.info("scene image stored: %s (%d bytes, kind=%s)", path, len(img), kind)
    return f"/static/scene_images/{name}"
