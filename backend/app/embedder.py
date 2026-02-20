"""
Voyage AI embedding wrapper.

Wraps the voyageai.Client (stored in db.voyage_client) and records token usage
to both the persistent CostLedger and the ephemeral ActivityLog.
"""

import logging

from . import db
from .config import EMBEDDING_MODEL, VOYAGE_PRICE_PER_M
from .telemetry import activity_log, ledger

logger = logging.getLogger("memory-server")


def embed(text: str, input_type: str = "document") -> list[float]:
    """Embed *text* and return a float32 vector.

    Args:
        text:       The string to embed.
        input_type: "document" for storage, "query" for search.
    """
    result = db.voyage_client.embed([text], model=EMBEDDING_MODEL, input_type=input_type)
    try:
        tokens = result.total_tokens
        cost = tokens * VOYAGE_PRICE_PER_M / 1_000_000
        ledger.record_voyage(tokens)
        activity_log.record_voyage(tokens, cost)
    except Exception as e:
        logger.debug("Telemetry record error (voyage): %s", e)
    return result.embeddings[0]
