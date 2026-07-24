"""动态 galgame 场景配图生成（背景图 + 角色立绘）。

从 seed / 开场设定并发生成两张图并转存本地，供：
- letters.py accept_scene（接受夜间推荐的 scene_invite 来信）
- scenes.py create_scene（手动「描述你的场景」路径，render_kind=dynamic_image）

生图失败（风控/网络/密钥缺失）不阻断建场景流程：整体降级为无图
（返回 (None, None) 或立绘缺失时只留背景），前端用兜底渐变背景。
"""
import asyncio
import logging

log = logging.getLogger(__name__)


def gen_scene_images(
    *, title=None, people=None, place=None, plot=None, intent=None, setting=None,
) -> tuple[str | None, list | None]:
    """并发生成背景图 + 角色立绘并转存本地，返回 (bg_image, characters)。

    失败降级为 (None, None)，或仅背景可用时立绘缺省，绝不抛出。
    """
    from app.graphs import theater
    from app.stepfun.image import generate_and_store

    prompts = theater.generate_image_prompts(
        title=title, people=people, place=place, plot=plot, intent=intent, setting=setting,
    )

    async def _both():
        return await asyncio.gather(
            generate_and_store(prompts["bg"], kind="bg"),
            generate_and_store(prompts["sprite"], kind="sprite"),
            return_exceptions=True,
        )

    try:
        bg_res, sprite_res = asyncio.run(_both())
    except Exception as e:  # noqa: BLE001
        log.warning("[scene_images] scene image gen failed wholesale: %s", e)
        return None, None

    bg_image = bg_res if isinstance(bg_res, str) else None
    if not isinstance(bg_res, str):
        log.warning("[scene_images] bg image gen failed: %s", bg_res)

    characters: list | None = None
    if isinstance(sprite_res, str):
        characters = [{"name": prompts["character_name"], "sprite_url": sprite_res}]
    else:
        log.warning("[scene_images] sprite image gen failed: %s", sprite_res)

    return bg_image, characters
