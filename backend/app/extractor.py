"""
xAI extraction layer — LLM calls, JSON parsing, and memory extraction logic.

Responsibilities:
  call_xai()                  — single xAI chat completion, records telemetry
  parse_json_array()          — robustly parse a JSON array from raw LLM output
  extract_memories()          — drive extraction using the right prompt mode
  condense_to_learned_pattern() — age an old session-summary into a learned-pattern
"""

import json
import logging
from typing import Optional

import httpx

from .config import (
    XAI_API_KEY,
    XAI_BASE_URL,
    EXTRACTION_MODEL,
    XAI_PRICE_INPUT_PER_M,
    XAI_PRICE_CACHED_PER_M,
    XAI_PRICE_OUTPUT_PER_M,
)
from .prompts import (
    CONDENSE_SYSTEM,
    CONDENSE_USER,
    EXTRACTION_SYSTEM,
    EXTRACTION_USER,
    INIT_EXTRACTION_SYSTEM,
    INIT_EXTRACTION_USER,
    SUMMARY_SYSTEM,
    SUMMARY_USER,
)
from .telemetry import activity_log, ledger

logger = logging.getLogger("memory-server")

# Max characters of conversation/content passed to the LLM
_MAX_CONTENT_CHARS = 8_000
_MAX_SUMMARY_CHARS = 4_000


# ── xAI client ─────────────────────────────────────────────────────────────────


def call_xai(system: str, user: str) -> str:
    """Make a single xAI chat completion and return the raw content string.

    Records token usage to the cost ledger and activity log.
    Raises httpx.HTTPStatusError on non-2xx responses.
    """
    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{XAI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {XAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": EXTRACTION_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                "max_tokens": 2000,
                "temperature": 0,
            },
        )
        response.raise_for_status()
        data = response.json()

    raw: str = data["choices"][0]["message"].get("content") or ""
    logger.debug("xai call model=%s raw=%r", EXTRACTION_MODEL, raw[:300])

    try:
        usage = data.get("usage", {})
        prompt_tokens     = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        cached_tokens     = usage.get("prompt_tokens_details", {}).get("cached_tokens", 0)
        cost = (
            (prompt_tokens - cached_tokens) * XAI_PRICE_INPUT_PER_M  / 1_000_000
            + cached_tokens                 * XAI_PRICE_CACHED_PER_M / 1_000_000
            + completion_tokens             * XAI_PRICE_OUTPUT_PER_M / 1_000_000
        )
        ledger.record_xai(prompt_tokens, cached_tokens, completion_tokens)
        activity_log.record_xai(prompt_tokens, cached_tokens, completion_tokens, cost)
    except Exception as e:
        logger.debug("Telemetry record error (xai): %s", e)

    return raw.strip()


# ── JSON parsing ───────────────────────────────────────────────────────────────


def parse_json_array(raw: str) -> list[dict]:
    """Parse a JSON array from a raw LLM response, stripping markdown fences."""
    if not raw:
        return []

    # Strip ```json ... ``` fences
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        extracted = json.loads(raw)

        if isinstance(extracted, list):
            result = []
            for item in extracted:
                if isinstance(item, str):
                    # Legacy plain-string format
                    result.append({"memory": item.strip(), "type": "learned-pattern"})
                elif isinstance(item, dict) and item.get("memory"):
                    result.append({
                        "memory": str(item["memory"]).strip(),
                        "type":   str(item.get("type", "learned-pattern")),
                    })
            return [r for r in result if r["memory"]]

        # Model returned {"memories": [...]} — unwrap
        if isinstance(extracted, dict):
            for v in extracted.values():
                if isinstance(v, list):
                    return parse_json_array(json.dumps(v))

        return []

    except Exception:
        logger.warning("Failed to parse JSON array: %r", raw[:200])
        return []


# ── Memory extraction ──────────────────────────────────────────────────────────


def extract_memories(
    messages: list[dict],
    summary_mode: bool = False,
    init_mode: bool = False,
) -> list[dict]:
    """Call xAI to extract typed memory facts from *messages*.

    Returns a list of ``{"memory": str, "type": str}`` dicts.

    Modes:
      summary_mode=True  → session-summary prompt (one structured summary object)
      init_mode=True     → project-file prompt (extracts from raw file content)
      default            → conversation extraction (atomic typed facts)
    """
    lines: list[str] = []
    for m in messages:
        role    = m.get("role", "user")
        content = m.get("content", "")
        if isinstance(content, str):
            lines.append(f"[{role}] {content}")
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    lines.append(f"[{role}] {part.get('text', '')}")

    conversation = "\n".join(lines)
    if not conversation.strip():
        return []

    truncated = conversation[:_MAX_CONTENT_CHARS]

    if init_mode:
        raw = call_xai(INIT_EXTRACTION_SYSTEM, INIT_EXTRACTION_USER.format(content=truncated))
    elif summary_mode:
        raw = call_xai(SUMMARY_SYSTEM, SUMMARY_USER.format(conversation=truncated))
    else:
        raw = call_xai(EXTRACTION_SYSTEM, EXTRACTION_USER.format(conversation=truncated))

    facts = parse_json_array(raw)
    # Attach the raw source text to every fact so the route can store it alongside
    # the extracted memory.  This enables hybrid search: the memory is used for
    # high-precision vector retrieval; the chunk is injected into the answer context
    # so the LLM can read exact values (config numbers, error strings, etc.).
    for fact in facts:
        fact["chunk"] = truncated
    return facts


def condense_to_learned_pattern(summary_text: str) -> Optional[dict]:
    """Condense an old session-summary string into a compact learned-pattern memory."""
    try:
        raw   = call_xai(CONDENSE_SYSTEM, CONDENSE_USER.format(summary=summary_text[:_MAX_SUMMARY_CHARS]))
        items = parse_json_array(raw)
        if items:
            return items[0]
    except Exception as e:
        logger.warning("condense_to_learned_pattern failed: %s", e)
    return None
