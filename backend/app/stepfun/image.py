"""阶跃文生图（POST /v1/images/generations，默认 step-image-edit-2）。

文档：https://platform.stepfun.com/docs/zh/api-reference/images/image
- step-image-edit-2 的 size 格式为「height x width」（如 1360x768 = 竖屏背景）；
- response_format 用 b64_json（阶跃返回的临时 URL 30 天失效，必须转存本地）；
- finish_reason == "content_filtered" 表示风控拦截，视为失败抛异常，上层可降级。

尺寸约定：
- 场景背景（竖屏）：1360x768
- 角色立绘：1184x896
"""
import base64
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


class ImageGenError(RuntimeError):
    """文生图失败（网络/风控/响应异常），上层捕获后走降级。"""


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

    SCENE_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.png"
    path = SCENE_IMAGE_DIR / name
    path.write_bytes(img)
    logger.info("scene image stored: %s (%d bytes, kind=%s)", path, len(img), kind)
    return f"/static/scene_images/{name}"
