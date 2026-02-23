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
GOOGLE_API_KEY: str = os.environ.get("GOOGLE_API_KEY", "")
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
VOYAGE_API_KEY: str = os.environ.get("VOYAGE_API_KEY", "")
DATA_DIR: str = os.environ.get("DATA_DIR", "/data/memory")

# ── Extraction provider ────────────────────────────────────────────────────────
# "xai"       (default) — Grok 4.1 Fast via api.x.ai
# "google"              — Gemini 3 Flash via native generateContent API
# "anthropic"           — Claude Haiku 4.5 via Anthropic Messages API
EXTRACTION_PROVIDER: str = os.environ.get("EXTRACTION_PROVIDER", "xai")

# ── Model identifiers ──────────────────────────────────────────────────────────

XAI_BASE_URL = "https://api.x.ai/v1"
XAI_EXTRACTION_MODEL = "grok-4-1-fast-non-reasoning"

GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
GOOGLE_EXTRACTION_MODEL = "gemini-3-flash-preview"

ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
ANTHROPIC_EXTRACTION_MODEL = "claude-haiku-4-5-20251001"

# Active model name — resolved from provider for telemetry/logging
_MODEL_MAP = {
    "google": GOOGLE_EXTRACTION_MODEL,
    "anthropic": ANTHROPIC_EXTRACTION_MODEL,
}
EXTRACTION_MODEL = _MODEL_MAP.get(EXTRACTION_PROVIDER, XAI_EXTRACTION_MODEL)

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
# Raised from 0.65 → 0.75: at 0.65, "uses Alembic" vs "switched to Aerich" (cosine dist
# ~0.67-0.70) was outside the candidate window and never sent to the LLM for comparison,
# causing stale Alembic memories to survive alongside the newer Aerich memory and bleed
# into knowledge-update and cross-synthesis answers. 0.75 casts a wider net; the LLM
# still makes the final call, so false-positive candidates are evaluated and discarded.
STRUCTURAL_CONTRADICTION_DISTANCE: float = 0.75

# Max candidate memories to send to the contradiction-detection LLM call per new memory.
# Raised from 15 → 25 to ensure more of the wider candidate window is actually evaluated.
CONTRADICTION_CANDIDATE_LIMIT: int = 25

# Memory types that skip contradiction detection (they have dedicated lifecycle rules).
VERSIONING_SKIP_TYPES: frozenset[str] = frozenset({"session-summary", "progress"})

# ── Memory aging ───────────────────────────────────────────────────────────────

# Max session-summary entries per project before the oldest is condensed → learned-pattern
MAX_SESSION_SUMMARIES = 3

# ── Pricing (USD per million tokens) ──────────────────────────────────────────

# xAI — grok-4-1-fast-non-reasoning
# Source: https://docs.x.ai/docs/models  (as of 2026-02)
XAI_PRICE_INPUT_PER_M  = 0.20
XAI_PRICE_CACHED_PER_M = 0.05
XAI_PRICE_OUTPUT_PER_M = 0.50

# Google — gemini-3-flash-preview
# Source: https://ai.google.dev/gemini-api/docs/models  (as of 2026-02)
GOOGLE_PRICE_INPUT_PER_M  = 0.50
GOOGLE_PRICE_OUTPUT_PER_M = 3.00

# Anthropic — claude-haiku-4-5
# Source: https://docs.anthropic.com/en/docs/about-claude/models  (as of 2026-02)
ANTHROPIC_PRICE_INPUT_PER_M  = 1.00
ANTHROPIC_PRICE_OUTPUT_PER_M = 5.00

# Voyage AI — voyage-code-3
# Source: https://docs.voyageai.com/docs/pricing  (as of 2026-02)
VOYAGE_PRICE_PER_M = 0.18
