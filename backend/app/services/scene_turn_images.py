"""回合级背景图重生成（DAY-229）。

choices 推进完成后异步刷新 dynamic_image 场景的背景图，让画面随剧情变化。
与 scene_images.py（建场景时一次性生成首图）不同：这里只按最新一幕重生成背景、
不动立绘；失败时保留旧图，绝不抛出，也不阻塞 SSE 响应（后台线程 + 独立 DB session）。
"""
import asyncio
import logging
import threading

from app.db import SessionLocal
from app.models.scene import Scene

log = logging.getLogger(__name__)


def build_turn_bg_prompt(scene: Scene) -> str:
    """场景设定 + 最新一条 beat → 背景文生图 prompt（纯模板，不额外调 LLM）。"""
    latest = ""
    for b in reversed(scene.beats or []):
        if isinstance(b, dict) and (b.get("text") or "").strip():
            latest = str(b["text"]).strip()
            break
    parts = ["galgame 视觉小说风格插画"]
    setting = (scene.setting or "").strip()
    if setting:
        parts.append(setting)
    if latest:
        parts.append(f"当前一幕：{latest}")
    parts.append("柔和唯美的光线与氛围，无人物、无文字水印")
    return "，".join(parts)[:480]


def regenerate_turn_bg(scene_id: int) -> None:
    """重生成背景并写回 bg_image。失败保留旧图，绝不抛出。"""
    from app.stepfun.image import generate_and_store

    db = SessionLocal()
    try:
        sc = db.get(Scene, scene_id)
        if sc is None or sc.render_kind != "dynamic_image" or sc.status == "settled":
            return
        prompt = build_turn_bg_prompt(sc)
        url = asyncio.run(generate_and_store(prompt, kind="bg"))
        # 生图耗时 60–90s：重新取出并复查状态，避免写回已结算/已删除的场景
        db.expire(sc)
        sc = db.get(Scene, scene_id)
        if sc is None or sc.status == "settled":
            _remove_static_file(url)
            return
        old = sc.bg_image
        sc.bg_image = url
        db.commit()
        # 旧背景文件已无引用，顺手清掉，避免 static 目录无限增长
        if old and old != url:
            _remove_static_file(old)
        log.info("[scene_turn_images] scene %s bg updated: %s", scene_id, url)
    except Exception as e:  # noqa: BLE001
        log.warning("[scene_turn_images] scene %s bg regen failed: %s", scene_id, e)
    finally:
        db.close()


def _remove_static_file(url: str | None) -> None:
    """把 /static 相对 URL 对应的本地文件删掉；路径不在 static 目录内或不存在则忽略。"""
    from app.stepfun.image import STATIC_DIR

    if not url or not url.startswith("/static/"):
        return
    try:
        path = (STATIC_DIR / url[len("/static/"):]).resolve()
        if path.is_relative_to(STATIC_DIR.resolve()) and path.is_file():
            path.unlink()
    except OSError as e:
        log.warning("[scene_turn_images] remove %s failed: %s", url, e)


def schedule_bg_regen(scene_id: int) -> None:
    """后台线程触发重生成，不阻塞当前请求 / SSE 流。"""
    threading.Thread(target=regenerate_turn_bg, args=(scene_id,), daemon=True).start()
