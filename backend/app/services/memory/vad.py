"""基于外部中文词典的本地 VAD（效价/唤醒度/控制感）提取。"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import jieba

from app.services.memory.lexicon import load_lexicon

logger = logging.getLogger(__name__)
jieba.setLogLevel(logging.WARNING)


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@lru_cache(maxsize=1)
def _resources() -> tuple[dict[str, tuple[float, float, float]], frozenset[str], dict[str, float], str]:
    raw = load_lexicon("vad_zh_core.json")
    entries: dict[str, tuple[float, float, float]] = {}
    for word, item in (raw.get("entries") or {}).items():
        if not isinstance(item, dict):
            continue
        try:
            entries[str(word)] = (
                _clip(float(item["valence"]), -1.0, 1.0),
                _clip(float(item["arousal"]), 0.0, 1.0),
                _clip(float(item["dominance"]), 0.0, 1.0),
            )
        except (KeyError, TypeError, ValueError):
            continue
    modifiers = load_lexicon("modifiers_zh.json")
    negations = frozenset(str(x) for x in modifiers.get("negations", []) if str(x))
    degree: dict[str, float] = {}
    for word, value in (modifiers.get("degree_words") or {}).items():
        try:
            degree[str(word)] = float(value)
        except (TypeError, ValueError):
            continue
    return entries, negations, degree, str(raw.get("version") or "unknown")


def _resolve_token(
    token: str,
    entries: dict[str, tuple[float, float, float]],
    negations: frozenset[str],
    degree: dict[str, float],
) -> tuple[str, tuple[float, float, float], bool, float] | None:
    if token in entries:
        return token, entries[token], False, 1.0
    prefixes = sorted(set(negations) | set(degree), key=len, reverse=True)
    for prefix in prefixes:
        if token.startswith(prefix) and token[len(prefix):] in entries:
            base = token[len(prefix):]
            return base, entries[base], prefix in negations, degree.get(prefix, 1.0)
    return None


def extract_vad(text: str) -> dict[str, Any]:
    """返回可审计的 VAD 结果；没有命中时返回中性基线而非语义猜测。"""
    entries, negations, degree, version = _resources()
    tokens = [token.strip() for token in jieba.cut(text or "") if token.strip()]
    scores: list[tuple[float, float, float, str, str]] = []
    for index, token in enumerate(tokens):
        resolved = _resolve_token(token, entries, negations, degree)
        if resolved is None:
            continue
        word, (valence, arousal, dominance), token_negated, token_degree = resolved
        negated = token_negated
        modifier = token_degree
        for prior in tokens[max(0, index - 3):index]:
            if prior in negations:
                negated = not negated
            if prior in degree:
                modifier = degree[prior]
        if negated:
            valence = -valence * 0.8
            dominance *= 0.5
        scores.append((
            _clip(valence * modifier, -1.0, 1.0),
            _clip(arousal * modifier, 0.0, 1.0),
            _clip(dominance * modifier, 0.0, 1.0),
            word,
            token,
        ))
    if not scores:
        return {
            "valence": 0.0, "arousal": 0.3, "dominance": 0.5,
            "matched": [], "method": "vad_lexicon", "version": version,
        }
    weights = [abs(v) + a + 0.1 for v, a, _, _, _ in scores]
    total = sum(weights)
    return {
        "valence": round(sum(w * row[0] for w, row in zip(weights, scores)) / total, 3),
        "arousal": round(sum(w * row[1] for w, row in zip(weights, scores)) / total, 3),
        "dominance": round(sum(w * row[2] for w, row in zip(weights, scores)) / total, 3),
        "matched": [{"word": row[3], "token": row[4]} for row in scores[:10]],
        "method": "vad_lexicon", "version": version,
    }
