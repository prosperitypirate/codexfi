"""
NameRegistry — maps opaque hash IDs (sha256[:16]) to human-readable display names.

The plugin calls POST /names on startup so the dashboard can show project folder
names and git usernames instead of raw hashes.  Persists to DATA_DIR/names.json
so registrations survive container restarts.
"""

import json
import logging
import threading
from typing import Optional

logger = logging.getLogger("memory-server")


class NameRegistry:
    """Thread-safe hash-ID → display-name mapping with JSON persistence."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict[str, str] = {}
        self._path: str = ""

    def init(self, data_dir: str) -> None:
        self._path = f"{data_dir}/names.json"
        try:
            with open(self._path) as f:
                self._data = json.load(f)
            logger.info("Name registry loaded (%d entries)", len(self._data))
        except FileNotFoundError:
            self._data = {}
            logger.info("Name registry initialised (new)")
        except Exception as e:
            logger.warning("Name registry load error: %s — starting empty", e)
            self._data = {}

    def _save(self) -> None:
        """Write to disk. Must be called while holding _lock."""
        if not self._path:
            return
        try:
            with open(self._path, "w") as f:
                json.dump(self._data, f, indent=2)
        except Exception as e:
            logger.warning("Name registry save error: %s", e)

    def register(self, user_id: str, name: str) -> None:
        with self._lock:
            if self._data.get(user_id) != name:
                self._data[user_id] = name
                self._save()

    def get(self, user_id: str) -> Optional[str]:
        with self._lock:
            return self._data.get(user_id)

    def snapshot(self) -> dict[str, str]:
        with self._lock:
            return dict(self._data)


# Module-level singleton
name_registry = NameRegistry()
