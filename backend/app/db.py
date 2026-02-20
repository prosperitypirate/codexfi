"""
LanceDB module-level state.

The table and voyage_client singletons are set during the FastAPI lifespan
startup and referenced by embedder, store, and route handlers via `from app import db`.
Using module attributes (not copies) ensures all consumers see the live reference.
"""

from typing import Any, Optional

# Set to the live LanceDB Table during lifespan startup; None until then.
table: Optional[Any] = None

# Set to the live voyageai.Client during lifespan startup; None until then.
voyage_client: Optional[Any] = None
