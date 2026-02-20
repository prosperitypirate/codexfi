"""
API usage telemetry — two complementary classes:

  CostLedger   — persistent, thread-safe cumulative cost tracker (survives restarts)
  ActivityLog  — ephemeral in-memory ring buffer for the live UI activity feed
"""

import json
import logging
import threading
from datetime import datetime, timezone

from .config import (
    EXTRACTION_MODEL,
    EMBEDDING_MODEL,
    XAI_PRICE_INPUT_PER_M,
    XAI_PRICE_CACHED_PER_M,
    XAI_PRICE_OUTPUT_PER_M,
    VOYAGE_PRICE_PER_M,
)

logger = logging.getLogger("memory-server")


# ── CostLedger ─────────────────────────────────────────────────────────────────


class CostLedger:
    """Thread-safe accumulator for API token usage and USD cost.

    Persists to DATA_DIR/costs.json so totals survive container restarts.
    """

    _TEMPLATE = {
        "xai": {
            "calls": 0,
            "prompt_tokens": 0,
            "cached_tokens": 0,
            "completion_tokens": 0,
            "cost_usd": 0.0,
        },
        "voyage": {
            "calls": 0,
            "tokens": 0,
            "cost_usd": 0.0,
        },
        "total_cost_usd": 0.0,
        "last_updated": "",
    }

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict = {}
        self._path: str = ""

    def init(self, data_dir: str) -> None:
        self._path = f"{data_dir}/costs.json"
        try:
            with open(self._path) as f:
                self._data = json.load(f)
            logger.info("Cost ledger loaded from %s", self._path)
        except FileNotFoundError:
            self._data = json.loads(json.dumps(self._TEMPLATE))
            logger.info("Cost ledger initialised (new)")
        except Exception as e:
            logger.warning("Cost ledger load error: %s — starting fresh", e)
            self._data = json.loads(json.dumps(self._TEMPLATE))

    def _save(self) -> None:
        """Write to disk. Must be called while holding _lock."""
        if not self._path:
            return
        try:
            with open(self._path, "w") as f:
                json.dump(self._data, f, indent=2)
        except Exception as e:
            logger.warning("Cost ledger save error: %s", e)

    def record_xai(self, prompt_tokens: int, cached_tokens: int, completion_tokens: int) -> None:
        cost = (
            (prompt_tokens - cached_tokens) * XAI_PRICE_INPUT_PER_M / 1_000_000
            + cached_tokens * XAI_PRICE_CACHED_PER_M / 1_000_000
            + completion_tokens * XAI_PRICE_OUTPUT_PER_M / 1_000_000
        )
        with self._lock:
            x = self._data["xai"]
            x["calls"] += 1
            x["prompt_tokens"] += prompt_tokens
            x["cached_tokens"] += cached_tokens
            x["completion_tokens"] += completion_tokens
            x["cost_usd"] = round(x["cost_usd"] + cost, 8)
            self._data["total_cost_usd"] = round(
                self._data["xai"]["cost_usd"] + self._data["voyage"]["cost_usd"], 8
            )
            self._data["last_updated"] = datetime.now(timezone.utc).isoformat()
            self._save()

    def record_voyage(self, tokens: int) -> None:
        cost = tokens * VOYAGE_PRICE_PER_M / 1_000_000
        with self._lock:
            v = self._data["voyage"]
            v["calls"] += 1
            v["tokens"] += tokens
            v["cost_usd"] = round(v["cost_usd"] + cost, 8)
            self._data["total_cost_usd"] = round(
                self._data["xai"]["cost_usd"] + self._data["voyage"]["cost_usd"], 8
            )
            self._data["last_updated"] = datetime.now(timezone.utc).isoformat()
            self._save()

    def snapshot(self) -> dict:
        with self._lock:
            return json.loads(json.dumps(self._data))

    def reset(self) -> None:
        with self._lock:
            self._data = json.loads(json.dumps(self._TEMPLATE))
            self._data["last_updated"] = datetime.now(timezone.utc).isoformat()
            self._save()


# ── ActivityLog ────────────────────────────────────────────────────────────────


class ActivityLog:
    """In-memory ring buffer of the last N API calls (xAI + Voyage).

    Not persisted — resets on container restart. Intended for the live
    activity feed in the web UI so you can confirm extractions are happening.
    """

    MAX_ENTRIES = 200

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: list[dict] = []

    def _append(self, entry: dict) -> None:
        with self._lock:
            self._entries.append(entry)
            if len(self._entries) > self.MAX_ENTRIES:
                self._entries = self._entries[-self.MAX_ENTRIES:]

    def record_xai(
        self,
        prompt_tokens: int,
        cached_tokens: int,
        completion_tokens: int,
        cost_usd: float,
        operation: str = "extraction",
    ) -> None:
        self._append({
            "ts": datetime.now(timezone.utc).isoformat(),
            "api": "xai",
            "model": EXTRACTION_MODEL,
            "operation": operation,
            "prompt_tokens": prompt_tokens,
            "cached_tokens": cached_tokens,
            "completion_tokens": completion_tokens,
            "tokens": None,
            "cost_usd": round(cost_usd, 8),
        })

    def record_voyage(self, tokens: int, cost_usd: float) -> None:
        self._append({
            "ts": datetime.now(timezone.utc).isoformat(),
            "api": "voyage",
            "model": EMBEDDING_MODEL,
            "operation": "embed",
            "prompt_tokens": None,
            "cached_tokens": None,
            "completion_tokens": None,
            "tokens": tokens,
            "cost_usd": round(cost_usd, 8),
        })

    def recent(self, limit: int = 50) -> list[dict]:
        with self._lock:
            return list(reversed(self._entries[-limit:]))


# ── Module-level singletons ────────────────────────────────────────────────────

ledger = CostLedger()
activity_log = ActivityLog()
