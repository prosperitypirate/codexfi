"""
System / observability endpoints.

  GET  /health        — liveness + readiness probe
  GET  /costs         — accumulated API cost breakdown
  POST /costs/reset   — reset cost ledger to zero
  GET  /activity      — recent API calls (live activity feed)
"""

from fastapi import APIRouter

from .. import db
from ..telemetry import activity_log, ledger

router = APIRouter()


@router.get("/health")
async def health():
    """Liveness + readiness probe. Returns ready=false until LanceDB is initialised."""
    return {"status": "ok", "ready": db.table is not None}


@router.get("/costs")
async def get_costs():
    """Return accumulated xAI and Voyage AI token usage and USD cost."""
    return ledger.snapshot()


@router.post("/costs/reset")
async def reset_costs():
    """Reset the cost ledger to zero (useful for per-session or per-period tracking)."""
    ledger.reset()
    return {"success": True, "message": "Cost ledger reset"}


@router.get("/activity")
async def get_activity(limit: int = 50):
    """Return the most recent API calls in reverse-chronological order.

    In-memory only — resets on container restart.  Use it to confirm that
    extraction and embedding are actually happening in real time.
    """
    return {"entries": activity_log.recent(min(limit, 200))}
