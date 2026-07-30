"""静态文件清理：防止 /static 目录无限增长。

- tts_audio/：每条语音回复都会落一个 mp3，URL 即取即用，超过 TTL 的直接删。
- scene_images/ 的回合背景旧图在 scene_turn_images.regenerate_turn_bg 替换时即时清理。
"""
import logging
import time

from app.stepfun.tts import TTS_AUDIO_DIR

log = logging.getLogger(__name__)

# TTS 音频保留时长（秒）。前端合成后立即播放，24h 足够覆盖重播场景。
TTS_TTL_SECONDS = 24 * 3600


def cleanup_tts_audio(ttl_seconds: int = TTS_TTL_SECONDS) -> int:
    """删除 tts_audio/ 下修改时间早于 ttl 的文件，返回删除数量。目录不存在视为 0。"""
    if not TTS_AUDIO_DIR.is_dir():
        return 0
    cutoff = time.time() - ttl_seconds
    deleted = 0
    for f in TTS_AUDIO_DIR.iterdir():
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink()
                deleted += 1
        except OSError as e:  # 单个文件失败不影响其余
            log.warning("[static_cleanup] remove %s failed: %s", f, e)
    return deleted
