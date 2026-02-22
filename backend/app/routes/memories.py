"""
Memory CRUD + semantic search endpoints.

  POST   /memories              — extract + store memories from messages
  GET    /memories              — list memories for a user_id
  POST   /memories/search       — semantic search
  DELETE /memories/{memory_id}  — delete a single memory
"""

import asyncio
import hashlib
import json
import logging
import math
import uuid
from datetime import date, datetime, timezone
from functools import partial

from fastapi import APIRouter, HTTPException

from .. import db
from ..config import DEDUP_DISTANCE, STRUCTURAL_DEDUP_DISTANCE, STRUCTURAL_TYPES, validate_id
from ..embedder import embed
from ..extractor import extract_memories
from ..models import AddMemoryRequest, SearchMemoryRequest
from ..store import apply_aging_rules, check_and_supersede, find_duplicate, get_memories_by_type

logger = logging.getLogger("memory-server")
router = APIRouter()


async def _in_thread(fn, *args, **kwargs):
    """Run a blocking call in the default thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(fn, *args, **kwargs))


# ── POST /memories ─────────────────────────────────────────────────────────────


@router.post("/memories")
async def add_memory(req: AddMemoryRequest):
    """Extract typed memories from messages and store them, deduplicating against existing ones."""
    if db.table is None:
        raise HTTPException(status_code=503, detail="Memory server not initialised (missing API keys?)")

    try:
        validate_id(req.user_id, "user_id")
        facts = await _in_thread(
            extract_memories,
            req.messages,
            req.summary_mode or False,
            req.init_mode or False,
        )
        logger.info(
            "add_memory user_id=%s extracted=%d facts summary_mode=%s init_mode=%s",
            req.user_id, len(facts), req.summary_mode, req.init_mode,
        )

        results      = []
        base_metadata = req.metadata or {}
        now          = datetime.now(timezone.utc).isoformat()

        for fact in facts:
            fact_text  = fact["memory"]
            fact_type  = fact.get("type") or base_metadata.get("type") or ""
            fact_chunk = fact.get("chunk") or ""

            metadata     = {**base_metadata, **({"type": fact_type} if fact_type else {})}
            metadata_str = json.dumps(metadata)
            fact_hash    = hashlib.md5(fact_text.encode()).hexdigest()
            vector       = await _in_thread(embed, fact_text, "document")

            threshold = STRUCTURAL_DEDUP_DISTANCE if fact_type in STRUCTURAL_TYPES else DEDUP_DISTANCE
            dup       = await _in_thread(find_duplicate, req.user_id, vector, threshold)

            if dup:
                db.table.update(
                    where=f"id = '{dup['id']}'",
                    values={
                        "memory":        fact_text,
                        "updated_at":    now,
                        "hash":          fact_hash,
                        "metadata_json": metadata_str,
                        "chunk":         fact_chunk,
                    },
                )
                results.append({"id": dup["id"], "memory": fact_text, "event": "UPDATE"})
                logger.debug("Updated duplicate memory %s (type=%s)", dup["id"], fact_type)
            else:
                mem_id = str(uuid.uuid4())
                db.table.add([{
                    "id":            mem_id,
                    "memory":        fact_text,
                    "user_id":       req.user_id,
                    "vector":        vector,
                    "metadata_json": metadata_str,
                    "created_at":    now,
                    "updated_at":    now,
                    "hash":          fact_hash,
                    "chunk":         fact_chunk,
                    "superseded_by": "",
                }])
                results.append({"id": mem_id, "memory": fact_text, "event": "ADD"})
                logger.debug("Added new memory %s (type=%s)", mem_id, fact_type)

                if fact_type:
                    await _in_thread(apply_aging_rules, req.user_id, fact_type, mem_id)

                # Relational versioning: mark any contradicted existing memories as stale.
                superseded = await _in_thread(
                    check_and_supersede, req.user_id, fact_text, vector, mem_id, fact_type
                )
                if superseded:
                    logger.info(
                        "Versioning: new memory %s superseded %d existing: %s",
                        mem_id, len(superseded), superseded,
                    )

        return {"results": results}

    except Exception as exc:
        logger.exception("add_memory failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── GET /memories ──────────────────────────────────────────────────────────────


@router.get("/memories")
async def list_memories(user_id: str, limit: int = 20, include_superseded: bool = False):
    """List stored memories for *user_id*, ordered by most recently updated.

    By default superseded memories (retired by relational versioning) are excluded.
    Pass ``include_superseded=true`` to include them — needed for full cleanup passes.
    """
    if db.table is None:
        raise HTTPException(status_code=503, detail="Memory server not initialised")

    try:
        validate_id(user_id, "user_id")
        if db.table.count_rows() == 0:
            return {"results": []}

        df      = db.table.to_pandas()
        user_df = df[df["user_id"] == user_id].copy()

        # Exclude superseded memories unless the caller explicitly requests them.
        if "superseded_by" in user_df.columns and not include_superseded:
            user_df = user_df[user_df["superseded_by"] == ""]

        if "updated_at" in user_df.columns:
            user_df = user_df.sort_values("updated_at", ascending=False)

        results = [
            {
                "id":         r["id"],
                "memory":     r["memory"],
                "user_id":    r["user_id"],
                "metadata":   json.loads(r.get("metadata_json") or "{}"),
                "created_at": r.get("created_at"),
                "updated_at": r.get("updated_at"),
            }
            for r in user_df.head(limit).to_dict(orient="records")
        ]
        logger.info("list_memories user_id=%s returned=%d", user_id, len(results))
        return {"results": results}

    except Exception as exc:
        logger.exception("list_memories failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── Recency helpers ────────────────────────────────────────────────────────────

_RECENCY_DECAY = 0.1  # exponential decay constant (per day)


def _extract_date(row: dict) -> date | None:
    """Parse the session date from metadata_json['date'], falling back to created_at[:10]."""
    meta = json.loads(row.get("metadata_json") or "{}")
    raw = meta.get("date") or (row.get("created_at") or "")[:10]
    if raw:
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            pass
    return None


def _recency_score(d: date | None, max_date: date) -> float:
    """Exponential decay: 1.0 for max_date, lower for older dates."""
    if d is None:
        return 0.0
    days_diff = max(0, (max_date - d).days)
    return math.exp(-_RECENCY_DECAY * days_diff)


# ── POST /memories/search ──────────────────────────────────────────────────────


@router.post("/memories/search")
async def search_memories(req: SearchMemoryRequest):
    """Semantic search over memories using cosine vector similarity."""
    if db.table is None:
        raise HTTPException(status_code=503, detail="Memory server not initialised")

    try:
        validate_id(req.user_id, "user_id")
        if db.table.count_rows() == 0:
            return {"results": []}

        query_vector = await _in_thread(embed, req.query, "query")
        rows = (
            db.table.search(query_vector, vector_column_name="vector")
            .metric("cosine")
            .where(
                f"user_id = '{req.user_id}' AND superseded_by = ''",
                prefilter=True,
            )
            .limit(req.limit or 5)
            .to_list()
        )

        threshold = req.threshold if req.threshold is not None else 0.3
        w = (req.recency_weight or 0.0)

        # Build intermediate list with semantic scores + parsed dates.
        candidates = []
        for r in rows:
            semantic = max(0.0, 1.0 - r.get("_distance", 1.0))
            meta     = json.loads(r.get("metadata_json") or "{}")
            d        = _extract_date(r)
            candidates.append({
                "id":         r["id"],
                "memory":     r["memory"],
                "chunk":      r.get("chunk") or "",
                "semantic":   semantic,
                "metadata":   meta,
                "created_at": r.get("created_at"),
                "date":       d.isoformat() if d else None,
                "_date_obj":  d,
            })

        # Optional recency blending — uses session date from metadata, not ingestion time.
        if w > 0.0:
            dates    = [c["_date_obj"] for c in candidates if c["_date_obj"] is not None]
            max_date = max(dates) if dates else None
            for c in candidates:
                if max_date is not None:
                    rec   = _recency_score(c["_date_obj"], max_date)
                    score = (1.0 - w) * c["semantic"] + w * rec
                else:
                    score = c["semantic"]
                c["score"] = round(score, 4)
        else:
            for c in candidates:
                c["score"] = round(c["semantic"], 4)

        results = sorted(
            [
                {
                    "id":         c["id"],
                    "memory":     c["memory"],
                    "chunk":      c["chunk"],
                    "score":      c["score"],
                    "metadata":   c["metadata"],
                    "created_at": c["created_at"],
                    "date":       c["date"],
                }
                for c in candidates
                if c["score"] >= threshold
            ],
            key=lambda r: r["score"],
            reverse=True,
        )

        # ── Hybrid enumeration retrieval ─────────────────────────────────────
        # When the caller specifies `types`, fetch all non-superseded memories of
        # those types and append any that are not already in the semantic results.
        # This lets enumeration queries ("list all env vars", "every preference")
        # retrieve facts from every session regardless of semantic rank, while
        # normal queries are unaffected.
        if req.types:
            seen_ids = {r["id"] for r in results}
            extra_limit = req.limit or 20  # cap type-filtered extras at same as semantic limit
            type_extras: list[dict] = []

            for mem_type in req.types:
                type_rows = await _in_thread(get_memories_by_type, req.user_id, mem_type)
                for tr in type_rows:
                    # Skip: already in semantic results, superseded, or extra cap reached
                    if tr["id"] in seen_ids:
                        continue
                    if tr.get("superseded_by"):
                        continue
                    meta = json.loads(tr.get("metadata_json") or "{}")
                    d = _extract_date(tr)
                    type_extras.append({
                        "id":         tr["id"],
                        "memory":     tr["memory"],
                        "chunk":      tr.get("chunk") or "",
                        "score":      0.25,  # base score — below any semantic hit
                        "metadata":   meta,
                        "created_at": tr.get("created_at"),
                        "date":       d.isoformat() if d else None,
                    })
                    seen_ids.add(tr["id"])

            # Sort extras by recency (most recent first) and cap before appending
            type_extras.sort(key=lambda r: r.get("created_at") or "", reverse=True)
            results = results + type_extras[:extra_limit]
            # Final sort: semantic hits (score > 0.25) still precede type-filtered extras
            results = sorted(results, key=lambda r: r["score"], reverse=True)

        logger.info(
            "search_memories user_id=%s query=%r found=%d",
            req.user_id, req.query[:60], len(results),
        )
        return {"results": results}

    except Exception as exc:
        logger.exception("search_memories failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── DELETE /memories/{memory_id} ───────────────────────────────────────────────


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str):
    """Delete a single memory by ID."""
    if db.table is None:
        raise HTTPException(status_code=503, detail="Memory server not initialised")

    try:
        validate_id(memory_id, "memory_id")
        db.table.delete(f"id = '{memory_id}'")
        logger.info("delete_memory id=%s", memory_id)
        return {"success": True, "message": "Memory deleted"}
    except Exception as exc:
        logger.exception("delete_memory failed")
        raise HTTPException(status_code=500, detail=str(exc))
