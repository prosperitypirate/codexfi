"""
Multi-provider extraction layer — LLM calls, JSON parsing, and memory extraction logic.

Supports xAI (Grok), Google (Gemini), and Anthropic (Claude) as extraction providers,
configurable via EXTRACTION_PROVIDER env var. All callers use call_llm() which dispatches
to the active provider.

Responsibilities:
  call_llm()                  — dispatch to active provider (xAI, Google, or Anthropic)
  call_xai()                  — xAI chat completion, records telemetry
  call_google()               — Gemini generateContent via native REST API
  call_anthropic()            — Anthropic Messages API, records telemetry
  parse_json_array()          — robustly parse a JSON array from raw LLM output
  extract_memories()          — drive extraction using the right prompt mode
  condense_to_learned_pattern() — age an old session-summary into a learned-pattern
"""

import json
import logging
import time
from typing import Optional

import httpx

from .config import (
    EXTRACTION_PROVIDER,
    XAI_API_KEY,
    XAI_BASE_URL,
    XAI_EXTRACTION_MODEL,
    XAI_PRICE_INPUT_PER_M,
    XAI_PRICE_CACHED_PER_M,
    XAI_PRICE_OUTPUT_PER_M,
    GOOGLE_API_KEY,
    GOOGLE_BASE_URL,
    GOOGLE_EXTRACTION_MODEL,
    GOOGLE_PRICE_INPUT_PER_M,
    GOOGLE_PRICE_OUTPUT_PER_M,
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    ANTHROPIC_EXTRACTION_MODEL,
    ANTHROPIC_PRICE_INPUT_PER_M,
    ANTHROPIC_PRICE_OUTPUT_PER_M,
)
from .prompts import (
    CONDENSE_SYSTEM,
    CONDENSE_USER,
    CONTRADICTION_SYSTEM,
    CONTRADICTION_USER,
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
    t0 = time.monotonic()
    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{XAI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {XAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": XAI_EXTRACTION_MODEL,
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
    elapsed_ms = (time.monotonic() - t0) * 1000

    raw: str = data["choices"][0]["message"].get("content") or ""
    logger.info("xai call model=%s elapsed=%.0fms tokens=%d/%d",
                XAI_EXTRACTION_MODEL, elapsed_ms,
                data.get("usage", {}).get("prompt_tokens", 0),
                data.get("usage", {}).get("completion_tokens", 0))

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


def call_google(system: str, user: str) -> str:
    """Make a Gemini generateContent call via the native REST API.

    Uses the direct endpoint (no OpenAI compatibility layer) for maximum speed:
    - POST /v1beta/models/{model}:generateContent
    - Auth via x-goog-api-key header
    - system_instruction for system prompt
    - generationConfig.responseMimeType for native JSON mode

    Records token usage to the cost ledger and activity log.
    Raises httpx.HTTPStatusError on non-2xx responses.
    """
    if not GOOGLE_API_KEY:
        raise ValueError(
            "EXTRACTION_PROVIDER is 'google' but GOOGLE_API_KEY is not set. "
            "Add GOOGLE_API_KEY to your .env file."
        )

    t0 = time.monotonic()
    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{GOOGLE_BASE_URL}/models/{GOOGLE_EXTRACTION_MODEL}:generateContent",
            headers={
                "x-goog-api-key": GOOGLE_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "system_instruction": {
                    "parts": [{"text": system}],
                },
                "contents": [
                    {
                        "parts": [{"text": user}],
                    },
                ],
                "generationConfig": {
                    "temperature": 0,
                    "maxOutputTokens": 2000,
                    "responseMimeType": "application/json",
                },
            },
        )
        response.raise_for_status()
        data = response.json()
    elapsed_ms = (time.monotonic() - t0) * 1000

    # Native API response: candidates[0].content.parts[0].text
    raw: str = ""
    try:
        raw = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        logger.warning("google call: unexpected response structure: %r", str(data)[:300])

    # Token usage: usageMetadata.promptTokenCount / candidatesTokenCount
    usage = data.get("usageMetadata", {})
    prompt_tokens     = usage.get("promptTokenCount", 0)
    completion_tokens = usage.get("candidatesTokenCount", 0)

    logger.info("google call model=%s elapsed=%.0fms tokens=%d/%d",
                GOOGLE_EXTRACTION_MODEL, elapsed_ms, prompt_tokens, completion_tokens)

    try:
        cost = (
            prompt_tokens     * GOOGLE_PRICE_INPUT_PER_M  / 1_000_000
            + completion_tokens * GOOGLE_PRICE_OUTPUT_PER_M / 1_000_000
        )
        ledger.record_google(prompt_tokens, completion_tokens)
        activity_log.record_google(prompt_tokens, completion_tokens, cost)
    except Exception as e:
        logger.debug("Telemetry record error (google): %s", e)

    return raw.strip()


def call_anthropic(system: str, user: str) -> str:
    """Make a single Anthropic Messages API call and return the raw content string.

    Uses the Anthropic-native format (NOT OpenAI-compatible):
    - POST /v1/messages
    - Auth via x-api-key header + anthropic-version header
    - system prompt is a top-level field (not in messages array)
    - No native JSON mode — relies on system prompt instruction

    Records token usage to the cost ledger and activity log.
    Raises httpx.HTTPStatusError on non-2xx responses.
    """
    if not ANTHROPIC_API_KEY:
        raise ValueError(
            "EXTRACTION_PROVIDER is 'anthropic' but ANTHROPIC_API_KEY is not set. "
            "Add ANTHROPIC_API_KEY to your .env file."
        )

    t0 = time.monotonic()
    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{ANTHROPIC_BASE_URL}/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": ANTHROPIC_EXTRACTION_MODEL,
                "max_tokens": 2000,
                "temperature": 0,
                "system": system,
                "messages": [
                    {"role": "user", "content": user},
                ],
            },
        )
        response.raise_for_status()
        data = response.json()
    elapsed_ms = (time.monotonic() - t0) * 1000

    # Response format: content[0].text
    raw: str = ""
    try:
        raw = data["content"][0]["text"]
    except (KeyError, IndexError):
        logger.warning("anthropic call: unexpected response structure: %r", str(data)[:300])

    usage = data.get("usage", {})
    prompt_tokens     = usage.get("input_tokens", 0)
    completion_tokens = usage.get("output_tokens", 0)

    logger.info("anthropic call model=%s elapsed=%.0fms tokens=%d/%d",
                ANTHROPIC_EXTRACTION_MODEL, elapsed_ms, prompt_tokens, completion_tokens)

    try:
        cost = (
            prompt_tokens     * ANTHROPIC_PRICE_INPUT_PER_M  / 1_000_000
            + completion_tokens * ANTHROPIC_PRICE_OUTPUT_PER_M / 1_000_000
        )
        ledger.record_anthropic(prompt_tokens, completion_tokens)
        activity_log.record_anthropic(prompt_tokens, completion_tokens, cost)
    except Exception as e:
        logger.debug("Telemetry record error (anthropic): %s", e)

    return raw.strip()


def call_llm(system: str, user: str) -> str:
    """Route to the configured extraction provider.

    Dispatches to the appropriate provider function based on EXTRACTION_PROVIDER.
    All extraction callers should use this instead of provider-specific functions.
    """
    if EXTRACTION_PROVIDER == "google":
        return call_google(system, user)
    if EXTRACTION_PROVIDER == "anthropic":
        return call_anthropic(system, user)
    return call_xai(system, user)


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
    """Call the configured LLM provider to extract typed memory facts from *messages*.

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
        raw = call_llm(INIT_EXTRACTION_SYSTEM, INIT_EXTRACTION_USER.format(content=truncated))
    elif summary_mode:
        raw = call_llm(SUMMARY_SYSTEM, SUMMARY_USER.format(conversation=truncated))
    else:
        raw = call_llm(EXTRACTION_SYSTEM, EXTRACTION_USER.format(conversation=truncated))

    facts = parse_json_array(raw)
    # Attach the raw source text to every fact so the route can store it alongside
    # the extracted memory.  This enables hybrid search: the memory is used for
    # high-precision vector retrieval; the chunk is injected into the answer context
    # so the LLM can read exact values (config numbers, error strings, etc.).
    for fact in facts:
        fact["chunk"] = truncated
    return facts


def detect_contradictions(new_memory: str, candidates: list[dict]) -> list[str]:
    """Ask the LLM which candidate IDs are superseded by *new_memory*.

    Returns a (possibly empty) list of memory IDs to mark as superseded.
    Each candidate dict must have at least ``id`` and ``memory`` keys.
    """
    if not candidates:
        return []
    try:
        candidates_text = "\n".join(
            f"- ID: {c['id']} | {c['memory']}"
            for c in candidates
        )
        raw = call_llm(
            CONTRADICTION_SYSTEM,
            CONTRADICTION_USER.format(
                new_memory=new_memory,
                candidates=candidates_text,
            ),
        )
        if not raw:
            return []
        # Strip markdown fences if present
        stripped = raw.strip()
        if stripped.startswith("```"):
            parts = stripped.split("```")
            stripped = parts[1] if len(parts) > 1 else stripped
            if stripped.startswith("json"):
                stripped = stripped[4:]
            stripped = stripped.strip()
        parsed = json.loads(stripped)
        if isinstance(parsed, list):
            return [str(item) for item in parsed if isinstance(item, str) and item]
        return []
    except Exception as e:
        logger.warning("detect_contradictions failed: %s", e)
        return []


def condense_to_learned_pattern(summary_text: str) -> Optional[dict]:
    """Condense an old session-summary string into a compact learned-pattern memory."""
    try:
        raw   = call_llm(CONDENSE_SYSTEM, CONDENSE_USER.format(summary=summary_text[:_MAX_SUMMARY_CHARS]))
        items = parse_json_array(raw)
        if items:
            return items[0]
    except Exception as e:
        logger.warning("condense_to_learned_pattern failed: %s", e)
    return None
