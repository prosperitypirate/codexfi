"""
Memory store operations — deduplication, type queries, and aging rules.

All functions operate on the module-level `db.table` LanceDB table and are
designed to be called from a thread pool (they are blocking / synchronous).
"""

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from . import db
from .config import (
    CONTRADICTION_CANDIDATE_DISTANCE,
    CONTRADICTION_CANDIDATE_LIMIT,
    DEDUP_DISTANCE,
    MAX_SESSION_SUMMARIES,
    STRUCTURAL_CONTRADICTION_DISTANCE,
    STRUCTURAL_TYPES,
    VERSIONING_SKIP_TYPES,
    validate_id,
)
from .embedder import embed
from .extractor import condense_to_learned_pattern, detect_contradictions

logger = logging.getLogger("memory-server")


# ── Deduplication ──────────────────────────────────────────────────────────────


def find_duplicate(
    user_id: str,
    vector: list[float],
    distance_threshold: float = DEDUP_DISTANCE,
) -> Optional[dict]:
    """Return the closest existing memory if it is within *distance_threshold*.

    Returns None when the table is empty, the search fails, or no match is
    close enough.
    """
    try:
        validate_id(user_id, "user_id")
        if db.table.count_rows() == 0:
            return None
        results = (
            db.table.search(vector, vector_column_name="vector")
            .metric("cosine")
            .where(f"user_id = '{user_id}'", prefilter=True)
            .limit(1)
            .to_list()
        )
        if results and results[0].get("_distance", 1.0) <= distance_threshold:
            return results[0]
    except Exception as e:
        logger.debug("Dedup search error: %s", e)
    return None


# ── Relational versioning ──────────────────────────────────────────────────────


def find_contradiction_candidates(
    user_id: str,
    vector: list[float],
    new_id: str,
    memory_type: str = "",
    limit: int = CONTRADICTION_CANDIDATE_LIMIT,
) -> list[dict]:
    """Return non-superseded memories within the distance threshold that may contradict *new_id*.

    Structural types (tech-context, architecture, etc.) use a wider distance threshold
    because they evolve across sessions (ORM migrations, infra changes) and phrasing can
    differ significantly between the original and updated memory.

    Excludes the new memory itself and any already-superseded entries.
    Returns an empty list when the table is empty or the search fails.
    """
    max_distance = (
        STRUCTURAL_CONTRADICTION_DISTANCE
        if memory_type in STRUCTURAL_TYPES
        else CONTRADICTION_CANDIDATE_DISTANCE
    )
    try:
        validate_id(user_id, "user_id")
        validate_id(new_id, "new_id")
        if db.table.count_rows() == 0:
            return []
        results = (
            db.table.search(vector, vector_column_name="vector")
            .metric("cosine")
            .where(
                f"user_id = '{user_id}' AND id != '{new_id}' AND superseded_by = ''",
                prefilter=True,
            )
            .limit(limit)
            .to_list()
        )
        return [r for r in results if r.get("_distance", 1.0) <= max_distance]
    except Exception as e:
        logger.debug("find_contradiction_candidates error: %s", e)
        return []


def mark_superseded(old_id: str, new_id: str) -> None:
    """Set *old_id*.superseded_by = *new_id* to retire a stale memory."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        db.table.update(
            where=f"id = '{old_id}'",
            values={"superseded_by": new_id, "updated_at": now},
        )
        logger.info("Versioning: memory %s superseded by %s", old_id, new_id)
    except Exception as e:
        logger.warning("mark_superseded error for %s → %s: %s", old_id, new_id, e)


def check_and_supersede(
    user_id: str,
    new_memory: str,
    vector: list[float],
    new_id: str,
    memory_type: str,
) -> list[str]:
    """Full versioning pass for a newly inserted memory.

    1. Skip types that have their own lifecycle rules (progress, session-summary).
    2. Find candidate memories within contradiction distance.
    3. Ask the LLM which candidates are superseded by the new memory.
    4. Mark each confirmed superseded memory.

    Returns the list of IDs that were marked superseded (empty if none).
    """
    if memory_type in VERSIONING_SKIP_TYPES:
        return []

    candidates = find_contradiction_candidates(user_id, vector, new_id, memory_type)
    if not candidates:
        return []

    superseded_ids = detect_contradictions(new_memory, candidates)

    for sid in superseded_ids:
        mark_superseded(sid, new_id)

    return superseded_ids


# ── Type queries ───────────────────────────────────────────────────────────────


def get_memories_by_type(user_id: str, memory_type: str) -> list[dict]:
    """Return all non-superseded memories of *memory_type* for *user_id*, sorted by created_at asc."""
    try:
        if db.table.count_rows() == 0:
            return []
        import pandas as pd  # noqa: F401 — imported for type coercion
        df   = db.table.to_pandas()
        rows = df[df["user_id"] == user_id].to_dict(orient="records")
        typed = [
            r for r in rows
            if json.loads(r.get("metadata_json") or "{}").get("type") == memory_type
            and not r.get("superseded_by")  # exclude superseded memories
        ]
        typed.sort(key=lambda r: r.get("created_at") or "")
        return typed
    except Exception as e:
        logger.debug("get_memories_by_type error: %s", e)
        return []


# ── Aging rules ────────────────────────────────────────────────────────────────


def apply_aging_rules(user_id: str, memory_type: str, new_id: str) -> None:
    """Enforce rolling-window aging rules after inserting a new memory.

    progress:
        Only the latest entry survives — all older ones are deleted.

    session-summary:
        Capped at MAX_SESSION_SUMMARIES.  When the cap is exceeded, the oldest
        entry is condensed into a learned-pattern memory then deleted.
    """
    if not memory_type:
        return

    if memory_type == "progress":
        _age_progress(user_id, new_id)
    elif memory_type == "session-summary":
        _age_session_summaries(user_id)


def _age_progress(user_id: str, new_id: str) -> None:
    try:
        for row in get_memories_by_type(user_id, "progress"):
            if row["id"] != new_id:
                db.table.delete(f"id = '{row['id']}'")
                logger.debug("Aging: deleted old progress memory %s", row["id"])
    except Exception as e:
        logger.warning("Aging progress error: %s", e)


def _age_session_summaries(user_id: str) -> None:
    try:
        existing = get_memories_by_type(user_id, "session-summary")
        # existing is sorted asc; includes the entry just inserted
        if len(existing) <= MAX_SESSION_SUMMARIES:
            return

        oldest = existing[0]
        logger.info(
            "Aging: condensing oldest session-summary %s → learned-pattern", oldest["id"]
        )

        condensed = condense_to_learned_pattern(oldest["memory"])
        if condensed:
            now    = datetime.now(timezone.utc).isoformat()
            vector = embed(condensed["memory"], "document")
            db.table.add([{
                "id":            str(uuid.uuid4()),
                "memory":        condensed["memory"],
                "user_id":       user_id,
                "vector":        vector,
                "metadata_json": json.dumps({
                    "type":           "learned-pattern",
                    "condensed_from": oldest["id"],
                }),
                "created_at": now,
                "updated_at": now,
                "hash":       hashlib.md5(condensed["memory"].encode()).hexdigest(),
                "chunk":         "",  # condensed learned-patterns have no single source chunk
                "superseded_by": "",
            }])

        db.table.delete(f"id = '{oldest['id']}'")
        logger.info(
            "Aging: deleted oldest session-summary, condensed=%s", condensed is not None
        )
    except Exception as e:
        logger.warning("Aging session-summary error: %s", e)
