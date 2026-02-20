"""
Pydantic request/response models and the LanceDB PyArrow schema.
"""

from typing import Any, Optional

import pyarrow as pa
from pydantic import BaseModel

from .config import EMBEDDING_DIMS

# ── LanceDB table schema ───────────────────────────────────────────────────────

SCHEMA = pa.schema([
    pa.field("id",            pa.string()),
    pa.field("memory",        pa.string()),
    pa.field("user_id",       pa.string()),
    pa.field("vector",        pa.list_(pa.float32(), EMBEDDING_DIMS)),
    pa.field("metadata_json", pa.string()),
    pa.field("created_at",    pa.string()),
    pa.field("updated_at",    pa.string()),
    pa.field("hash",          pa.string()),
])

# ── API request models ─────────────────────────────────────────────────────────


class AddMemoryRequest(BaseModel):
    messages: list[dict[str, Any]]
    user_id: str
    metadata: Optional[dict[str, Any]] = None
    summary_mode: Optional[bool] = False
    init_mode: Optional[bool] = False   # project-file extraction (silent auto-init)


class SearchMemoryRequest(BaseModel):
    query: str
    user_id: str
    limit: Optional[int] = 5
    threshold: Optional[float] = 0.3


class RegisterNameRequest(BaseModel):
    user_id: str
    name: str
