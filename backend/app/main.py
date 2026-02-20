"""
opencode-memory API server — application entry point.

This module is intentionally thin: it wires together the FastAPI app,
registers middleware and routers, and owns the startup/shutdown lifespan.
All business logic lives in the domain modules under app/.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import DATA_DIR, EMBEDDING_MODEL, EXTRACTION_MODEL, VOYAGE_API_KEY, XAI_API_KEY
from .models import SCHEMA
from .registry import name_registry
from .routes import memories, projects, system
from .telemetry import ledger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("memory-server")


# ── Lifespan ───────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Build the list from string literals so that actual key values never flow
    # into the log call (avoids CodeQL py/clear-text-logging-sensitive-data).
    missing: list[str] = []
    if not XAI_API_KEY:
        missing.append("XAI_API_KEY")
    if not VOYAGE_API_KEY:
        missing.append("VOYAGE_API_KEY")
    if missing:
        logger.error(
            "Required environment variables not set: %s — memory server will not function correctly",
            ", ".join(missing),
        )
    else:
        import lancedb
        import voyageai

        logger.info("Initialising memory server — LanceDB at %s", DATA_DIR)
        os.makedirs(DATA_DIR, exist_ok=True)

        ldb = lancedb.connect(DATA_DIR)
        if "memories" not in ldb.table_names():
            db.table = ldb.create_table("memories", schema=SCHEMA)
            logger.info("Created new memories table")
        else:
            db.table = ldb.open_table("memories")
            logger.info("Opened existing memories table (%d rows)", db.table.count_rows())

        db.voyage_client = voyageai.Client(api_key=VOYAGE_API_KEY)
        ledger.init(DATA_DIR)
        name_registry.init(DATA_DIR)

        logger.info(
            "Memory server ready (embedder: %s, extractor: %s)",
            EMBEDDING_MODEL,
            EXTRACTION_MODEL,
        )

    yield


# ── App ────────────────────────────────────────────────────────────────────────


app = FastAPI(title="opencode-memory server", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(memories.router)
app.include_router(projects.router)
app.include_router(system.router)
