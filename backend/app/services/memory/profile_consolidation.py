"""Hermes 风格画像写入门控：候选先暂存，证据充分后才进入版本化记忆。"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.content_signal import ContentSignal
from app.models.memory import MemoryHistory, MemoryItem
from app.models.profile_write_candidate import ProfileWriteCandidate
from app.services.memory.memory_store import MemoryStore

PROFILE_MARKER_PREFIX = "profile-key:"
MIN_EVIDENCE = 2
MIN_CONFIDENCE = 0.65
MAX_PROFILE_ITEMS = 20
MAX_PROFILE_CHARS = 4000
_UNSAFE_FRAGMENTS = ("忽略之前", "系统提示词", "system prompt", "ignore previous", "<system", "</system")


def _normalized(value: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", (value or "").lower())


def _bigrams(value: str) -> set[str]:
    text = _normalized(value)
    if len(text) < 2:
        return {text} if text else set()
    return {text[index:index + 2] for index in range(len(text) - 1)}


def _jaccard(left: set[str], right: set[str]) -> float:
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def _same_subject(left: ProfileWriteCandidate, right: ProfileWriteCandidate) -> bool:
    """只做候选定位/查重，不从词形推断用户语义。"""
    if _normalized(left.memory_key) == _normalized(right.memory_key):
        return True
    if left.category != right.category:
        return False
    if set(left.entities or []) & set(right.entities or []):
        return _jaccard(_bigrams(left.statement), _bigrams(right.statement)) >= 0.2
    return _jaccard(_bigrams(left.statement), _bigrams(right.statement)) >= 0.55


def _marker(key: str) -> str:
    return f"{PROFILE_MARKER_PREFIX}{_normalized(key)}"[:200]


class ProfileConsolidator:
    def __init__(self, db: Session):
        self.db = db

    def _profiles(self, user_id: int) -> list[MemoryItem]:
        return MemoryStore(self.db).list_by_layer(user_id, "profile")

    def _existing(self, user_id: int, candidate: ProfileWriteCandidate) -> MemoryItem | None:
        profiles = self._profiles(user_id)
        if candidate.target_memory_id is not None:
            target = next((item for item in profiles if item.id == candidate.target_memory_id), None)
            if target is not None:
                return target
        marker = _marker(candidate.memory_key)
        return next((item for item in profiles if marker in (item.entities or [])), None)

    def _was_user_corrected(self, item: MemoryItem) -> bool:
        root = item.root_id or item.id
        version_ids = list(self.db.scalars(select(MemoryItem.id).where(MemoryItem.root_id == root)).all()) or [item.id]
        return self.db.scalar(select(MemoryHistory.id).where(
            MemoryHistory.memory_id.in_(version_ids), MemoryHistory.actor == "user",
        ).limit(1)) is not None

    @staticmethod
    def _resolve(rows: list[ProfileWriteCandidate], status: str, reason: str, memory_id: int | None = None) -> None:
        now = datetime.now(timezone.utc)
        for row in rows:
            row.status = status
            row.gate_reason = reason
            row.applied_memory_id = memory_id
            row.resolved_at = now

    def _attach_signals(self, rows: list[ProfileWriteCandidate], memory_id: int) -> None:
        now = datetime.now(timezone.utc)
        signal_ids = list({row.signal_id for row in rows})
        signals = list(self.db.scalars(select(ContentSignal).where(ContentSignal.id.in_(signal_ids))).all())
        for signal in signals:
            signal.profile_memory_id = memory_id
            signal.profiled_at = now

    def consolidate(self, user_id: int) -> dict[str, int]:
        pending = list(self.db.scalars(select(ProfileWriteCandidate).where(
            ProfileWriteCandidate.user_id == user_id,
            ProfileWriteCandidate.status == "pending",
        ).order_by(ProfileWriteCandidate.created_at.asc(), ProfileWriteCandidate.id.asc())).all())
        result = {"created": 0, "updated": 0, "protected": 0, "rejected": 0, "noop": 0, "staged": 0}
        processed: set[int] = set()
        store = MemoryStore(self.db)

        for candidate in pending:
            if candidate.id in processed:
                continue
            group = [row for row in pending if row.id not in processed and _same_subject(candidate, row)]
            processed.update(row.id for row in group)
            existing = self._existing(user_id, candidate)

            if existing is not None and self._was_user_corrected(existing):
                self._resolve(group, "protected", "user_correction_wins", existing.id)
                result["protected"] += len(group)
                continue
            if any(row.action == "delete" for row in group):
                self._resolve(group, "rejected", "automatic_delete_disabled")
                result["rejected"] += len(group)
                continue
            actionable = [row for row in group if row.action != "noop" and row.durability != "transient"]
            if not actionable:
                self._resolve(group, "noop", "not_durable_or_model_noop")
                result["noop"] += len(group)
                continue
            if any(row.sensitivity in {"vulnerable", "core"} for row in actionable):
                self._resolve(group, "rejected", "sensitive_profile_write_disabled")
                result["rejected"] += len(group)
                continue
            if any(fragment in row.statement.lower() for row in actionable for fragment in _UNSAFE_FRAGMENTS):
                self._resolve(group, "rejected", "unsafe_memory_content")
                result["rejected"] += len(group)
                continue

            evidence_ids = list(dict.fromkeys(row.signal_id for row in actionable))
            confidence = sum(row.confidence for row in actionable) / len(actionable)
            if len(evidence_ids) < MIN_EVIDENCE or confidence < MIN_CONFIDENCE:
                result["staged"] += len(group)
                continue

            chosen = max(actionable, key=lambda row: (row.confidence, row.id))
            if existing is not None and _normalized(existing.content) == _normalized(chosen.statement):
                self._resolve(group, "noop", "exact_duplicate", existing.id)
                self._attach_signals(group, existing.id)
                result["noop"] += len(group)
                continue

            all_profiles = self._profiles(user_id)
            total_chars = sum(len(item.content) for item in all_profiles)
            if existing is None and (len(all_profiles) >= MAX_PROFILE_ITEMS or total_chars + len(chosen.statement) > MAX_PROFILE_CHARS):
                self._resolve(group, "rejected", "profile_budget_exceeded")
                result["rejected"] += len(group)
                continue

            marker = _marker(chosen.memory_key)
            entities = list(dict.fromkeys([marker, chosen.category, *[e for row in actionable for e in (row.entities or [])]]))[:12]
            depth = "personal"
            if existing is None:
                target = store.create(
                    user_id=user_id, layer="profile", kind="小结", depth=depth,
                    content=chosen.statement, surface_text=chosen.surface_text,
                    confidence=round(confidence, 3), entities=entities,
                    provenance=evidence_ids, actor="profile_write_gate",
                )
                result["created"] += 1
            else:
                provenance = list(dict.fromkeys([*(existing.provenance or []), *evidence_ids]))
                target = store.update(existing.id, {
                    "content": chosen.statement, "surface_text": chosen.surface_text,
                    "confidence": round(confidence, 3), "entities": entities,
                    "provenance": provenance, "depth": depth,
                }, actor="profile_write_gate")
                result["updated"] += 1
            self._resolve(group, "applied", "evidence_gate_passed", target.id)
            self._attach_signals(group, target.id)
            self.db.commit()

        self.db.commit()
        return result
