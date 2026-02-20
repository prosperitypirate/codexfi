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
from .config import DEDUP_DISTANCE, MAX_SESSION_SUMMARIES, validate_id
from .embedder import embed
from .extractor import condense_to_learned_pattern

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


# ── Type queries ───────────────────────────────────────────────────────────────


def get_memories_by_type(user_id: str, memory_type: str) -> list[dict]:
    """Return all memories of *memory_type* for *user_id*, sorted by created_at asc."""
    try:
        if db.table.count_rows() == 0:
            return []
        import pandas as pd  # noqa: F401 — imported for type coercion
        df   = db.table.to_pandas()
        rows = df[df["user_id"] == user_id].to_dict(orient="records")
        typed = [
            r for r in rows
            if json.loads(r.get("metadata_json") or "{}").get("type") == memory_type
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
                "chunk":      "",  # condensed learned-patterns have no single source chunk
            }])

        db.table.delete(f"id = '{oldest['id']}'")
        logger.info(
            "Aging: deleted oldest session-summary, condensed=%s", condensed is not None
        )
    except Exception as e:
        logger.warning("Aging session-summary error: %s", e)
