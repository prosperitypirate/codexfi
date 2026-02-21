"""
Central configuration — environment variables, model identifiers, pricing, and thresholds.
All other modules import constants from here; nothing is defined twice.
"""

import os
import re

# ── Input validation ───────────────────────────────────────────────────────────

# Allowed characters for identifiers used in LanceDB where-clause interpolation.
# Prevents query injection via user_id or memory_id parameters.
_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_.\-]+$")


def validate_id(value: str, field_name: str = "id") -> str:
    """Validate that *value* is a safe identifier for use in LanceDB queries.

    Raises ValueError if the value contains characters that could break or
    inject into a where-clause expression.
    """
    if not value or not _SAFE_ID_RE.match(value):
        raise ValueError(
            f"Invalid {field_name}: must be non-empty and contain only "
            f"alphanumeric characters, hyphens, underscores, or dots"
        )
    return value

# ── API credentials ────────────────────────────────────────────────────────────

XAI_API_KEY: str = os.environ.get("XAI_API_KEY", "")
VOYAGE_API_KEY: str = os.environ.get("VOYAGE_API_KEY", "")
DATA_DIR: str = os.environ.get("DATA_DIR", "/data/memory")

# ── Model identifiers ──────────────────────────────────────────────────────────

XAI_BASE_URL = "https://api.x.ai/v1"
EXTRACTION_MODEL = "grok-4-1-fast-non-reasoning"
EMBEDDING_MODEL = "voyage-code-3"
EMBEDDING_DIMS = 1024

# ── Deduplication thresholds ───────────────────────────────────────────────────

# Cosine distance below which two memories are considered duplicates (~88% similarity)
DEDUP_DISTANCE = 0.12

# Wider threshold for structural memories — captures evolved understanding (~75% similarity)
STRUCTURAL_DEDUP_DISTANCE = 0.25

# Memory types that use the wider dedup threshold and never accumulate copies
STRUCTURAL_TYPES: frozenset[str] = frozenset({
    "project-brief", "architecture", "tech-context", "product-context", "project-config",
})

# ── Relational versioning ──────────────────────────────────────────────────────

# Cosine distance below which a memory is a candidate for contradiction detection.
# Broader than dedup (0.12) to catch topic-related contradictions like ORM migrations.
CONTRADICTION_CANDIDATE_DISTANCE: float = 0.5

# Wider distance for structural types (tech-context, architecture, project-brief, etc.)
# These types evolve across sessions (e.g. ORM migration, new infra component) and need
# a wider net to catch supersession relationships even when wording differs significantly.
STRUCTURAL_CONTRADICTION_DISTANCE: float = 0.65

# Max candidate memories to send to the contradiction-detection LLM call per new memory.
CONTRADICTION_CANDIDATE_LIMIT: int = 15

# Memory types that skip contradiction detection (they have dedicated lifecycle rules).
VERSIONING_SKIP_TYPES: frozenset[str] = frozenset({"session-summary", "progress"})

# ── Memory aging ───────────────────────────────────────────────────────────────

# Max session-summary entries per project before the oldest is condensed → learned-pattern
MAX_SESSION_SUMMARIES = 3

# ── Pricing (USD per million tokens) ──────────────────────────────────────────
# Source: https://docs.x.ai/docs/models  (as of 2026-02)
XAI_PRICE_INPUT_PER_M  = 0.20   # grok-4-1-fast-non-reasoning input
XAI_PRICE_CACHED_PER_M = 0.05   # grok-4-1-fast-non-reasoning cached input
XAI_PRICE_OUTPUT_PER_M = 0.50   # grok-4-1-fast-non-reasoning output

# Source: https://docs.voyageai.com/docs/pricing  (as of 2026-02)
VOYAGE_PRICE_PER_M = 0.18       # voyage-code-3
