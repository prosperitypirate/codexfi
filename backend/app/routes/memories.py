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
import uuid
from datetime import datetime, timezone
from functools import partial

from fastapi import APIRouter, HTTPException

from .. import db
from ..config import DEDUP_DISTANCE, STRUCTURAL_DEDUP_DISTANCE, STRUCTURAL_TYPES, validate_id
from ..embedder import embed
from ..extractor import extract_memories
from ..models import AddMemoryRequest, SearchMemoryRequest
from ..store import apply_aging_rules, find_duplicate

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
            fact_text = fact["memory"]
            fact_type = fact.get("type") or base_metadata.get("type") or ""

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
                }])
                results.append({"id": mem_id, "memory": fact_text, "event": "ADD"})
                logger.debug("Added new memory %s (type=%s)", mem_id, fact_type)

                if fact_type:
                    await _in_thread(apply_aging_rules, req.user_id, fact_type, mem_id)

        return {"results": results}

    except Exception as exc:
        logger.exception("add_memory failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── GET /memories ──────────────────────────────────────────────────────────────


@router.get("/memories")
async def list_memories(user_id: str, limit: int = 20):
    """List stored memories for *user_id*, ordered by most recently updated."""
    if db.table is None:
        raise HTTPException(status_code=503, detail="Memory server not initialised")

    try:
        validate_id(user_id, "user_id")
        if db.table.count_rows() == 0:
            return {"results": []}

        df      = db.table.to_pandas()
        user_df = df[df["user_id"] == user_id].copy()

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
            .where(f"user_id = '{req.user_id}'", prefilter=True)
            .limit(req.limit or 5)
            .to_list()
        )

        threshold = req.threshold if req.threshold is not None else 0.3
        results = [
            {
                "id":         r["id"],
                "memory":     r["memory"],
                "score":      round(max(0.0, 1.0 - r.get("_distance", 1.0)), 4),
                "metadata":   json.loads(r.get("metadata_json") or "{}"),
                "created_at": r.get("created_at"),
            }
            for r in rows
            if max(0.0, 1.0 - r.get("_distance", 1.0)) >= threshold
        ]
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
