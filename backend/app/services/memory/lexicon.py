"""记忆观察层使用的本地词典加载器。"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

LEXICON_DIR = Path(__file__).resolve().parents[2] / "data" / "lexicons"


@lru_cache(maxsize=16)
def load_lexicon(filename: str) -> dict[str, Any]:
    path = LEXICON_DIR / filename
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - 词典缺失时观察层应安全降级
        logger.warning("failed to load memory lexicon path=%s err=%s", path, exc)
        return {}
    if not isinstance(value, dict):
        logger.warning("invalid memory lexicon root path=%s", path)
        return {}
    return value
