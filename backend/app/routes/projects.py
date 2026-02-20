"""
Project, name, and stats endpoints.

  GET  /projects  — list all user_ids with memory counts and type breakdowns
  POST /names     — register a human-readable display name for a user_id
  GET  /names     — return all registered display names
  GET  /stats     — global statistics: totals by type and scope
"""

import json
import logging

from fastapi import APIRouter, HTTPException

from .. import db
from ..models import RegisterNameRequest
from ..registry import name_registry

logger = logging.getLogger("memory-server")
router = APIRouter()


# ── GET /projects ──────────────────────────────────────────────────────────────


@router.get("/projects")
async def list_projects():
    """List all unique user_ids with memory counts, type breakdowns, and display names."""
    if db.table is None:
        raise HTTPException(status_code=503, detail="Memory server not initialised")

    try:
        if db.table.count_rows() == 0:
            return {"projects": []}

        df       = db.table.to_pandas()
        projects = []

        for user_id, group in df.groupby("user_id"):
            type_counts: dict[str, int] = {}
            latest_updated = ""

            for _, row in group.iterrows():
                meta     = json.loads(row.get("metadata_json") or "{}")
                mem_type = meta.get("type", "unknown")
                type_counts[mem_type] = type_counts.get(mem_type, 0) + 1
                updated = str(row.get("updated_at") or "")
                if updated > latest_updated:
                    latest_updated = updated

            scope = "user" if "_user_" in str(user_id) else "project"
            projects.append({
                "user_id":      user_id,
                "name":         name_registry.get(str(user_id)),
                "scope":        scope,
                "count":        len(group),
                "type_counts":  type_counts,
                "last_updated": latest_updated,
            })

        projects.sort(key=lambda p: p["last_updated"], reverse=True)
        logger.info("list_projects returned=%d", len(projects))
        return {"projects": projects}

    except Exception as exc:
        logger.exception("list_projects failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── POST /names ────────────────────────────────────────────────────────────────


@router.post("/names")
async def register_name(req: RegisterNameRequest):
    """Register a human-readable display name for a user_id.

    Called by the plugin on startup so the UI can show folder names and
    git usernames instead of opaque hash IDs.
    """
    name_registry.register(req.user_id, req.name)
    logger.info("register_name user_id=%s name=%r", req.user_id, req.name)
    return {"success": True}


# ── GET /names ─────────────────────────────────────────────────────────────────


@router.get("/names")
async def get_names():
    """Return all registered display names."""
    return name_registry.snapshot()


# ── GET /stats ─────────────────────────────────────────────────────────────────


@router.get("/stats")
async def get_stats():
    """Global statistics: total memories and breakdown by type and scope."""
    if db.table is None:
        raise HTTPException(status_code=503, detail="Memory server not initialised")

    try:
        total = db.table.count_rows()
        if total == 0:
            return {
                "total":    0,
                "by_type":  {},
                "by_scope": {"project": 0, "user": 0},
                "projects": 0,
                "users":    0,
            }

        df      = db.table.to_pandas()
        by_type: dict[str, int] = {}
        by_scope: dict[str, int] = {"project": 0, "user": 0}

        for _, row in df.iterrows():
            meta     = json.loads(row.get("metadata_json") or "{}")
            mem_type = meta.get("type", "unknown")
            by_type[mem_type] = by_type.get(mem_type, 0) + 1
            user_id  = str(row.get("user_id", ""))
            scope    = "user" if "_user_" in user_id else "project"
            by_scope[scope] += 1

        unique_projects = int(df[~df["user_id"].str.contains("_user_", na=False)]["user_id"].nunique())
        unique_users    = int(df[ df["user_id"].str.contains("_user_", na=False)]["user_id"].nunique())

        logger.info("get_stats total=%d", total)
        return {
            "total":    total,
            "by_type":  by_type,
            "by_scope": by_scope,
            "projects": unique_projects,
            "users":    unique_users,
        }

    except Exception as exc:
        logger.exception("get_stats failed")
        raise HTTPException(status_code=500, detail=str(exc))
