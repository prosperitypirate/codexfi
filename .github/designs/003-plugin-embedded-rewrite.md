# Plugin Embedded Rewrite — Design Document

**Feature**: Eliminate Docker/Python/Next.js stack; embed LanceDB + extraction + embeddings directly into the plugin as a single Bun package  
**Issue**: #50 (plugin-v2: embedded LanceDB rewrite — eliminate Docker, Python backend, and Next.js frontend)  
**Branch**: `design/003-plugin-embedded-rewrite`  
**Status**: DESIGN PHASE  
**Created**: February 24, 2026  
**Estimated Duration**: ~2 weeks across 6 phases  

---

## EXECUTIVE SUMMARY

### The Problem

The current architecture requires **three separate services** to run a memory system for a single-user coding agent:

1. **Python backend** (FastAPI + LanceDB + Uvicorn) — 1,590 lines across 11 files in `backend/app/`
2. **Next.js frontend** (dashboard) — separate Node.js process on port 3030
3. **Docker Compose** orchestration — two containers, platform-specific images, volume mounts

This creates real friction:
- **Setup overhead**: `docker compose up -d` + wait for health checks + verify both services
- **Debugging complexity**: Logs split across containers; rebuild cycle is `docker compose build && docker compose up -d`
- **Portability**: Docker Desktop required on macOS; Linux users need Docker or Podman; Windows is fragile
- **Resource waste**: Two containers consuming memory/CPU for a system that serves exactly one user
- **Deployment coupling**: Backend changes require Docker rebuild even for one-line fixes

All of this for a system where the **only consumer** is a single OpenCode plugin making HTTP calls to localhost.

### The Solution

Replace the entire Docker stack with a **single Bun package** that embeds everything:

```
plugin-v2/src/
	db.ts           ~50 lines   LanceDB connect, schema, table management
	store.ts        ~250 lines  CRUD, dedup, aging, contradiction detection
	embedder.ts     ~30 lines   fetch() → Voyage AI API
	extractor.ts    ~200 lines  fetch() → Haiku/Grok/Gemini + JSON parsing
	prompts.ts      ~200 lines  Template literals (copy from backend prompts.py)
	config.ts       ~130 lines  Env vars, thresholds, pricing (port from backend)
	index.ts        ~900 lines  OpenCode hooks (swap client.* for store.*)
	services/       ~1100 lines auto-save, compaction, context, tags, etc. (mostly unchanged)
	cli/index.ts    ~100 lines  Terminal inspection commands
	dashboard/      ~200 lines  Optional Hono + static SPA
```

**Zero Docker. Zero Python. Zero separate processes.** The plugin opens a local LanceDB database at `~/.opencode-memory/`, makes `fetch()` calls to Voyage AI and extraction providers, and runs everything in the same Bun process that OpenCode already uses for plugins.

### Why This Works

| Property | Before (Docker) | After (Embedded) |
|----------|-----------------|-------------------|
| Setup | `docker compose up -d` + health checks | `bunx opencode-memory install` (copies plugin config) |
| Dependencies | Docker Desktop + Python 3.13 + Node 24 | Bun (already required for OpenCode) |
| Processes | 3 (Docker daemon, backend, frontend) | 0 additional (runs inside OpenCode's plugin runtime) |
| Lines of code | 1,590 Python + 462 TS client + Docker configs | ~900 TS (replaces both backend + client) |
| Rebuild cycle | `docker compose build && up -d` (~30s) | Edit → auto-reload (instant) |
| Latency | HTTP round-trip to localhost (~5-15ms per call) | Direct function call (~0.1ms) |
| Data location | Docker volume (`/data/memory/`) | `~/.opencode-memory/lancedb/` |
| Portability | Docker Desktop required | Runs anywhere Bun runs |
| Resource usage | ~200MB (two containers) | ~20MB (NAPI binary + LanceDB files) |

### Migration Strategy: Strangler Fig

Build `plugin-v2/` alongside existing `plugin/` without touching the current stack:

```
Phase 1-3: Build plugin-v2/ — current plugin/ + Docker still work
Phase 4-5: Validate plugin-v2/ via E2E tests + benchmark
Phase 6:   Cutover — delete backend/, frontend/, docker-compose.yml; rename plugin-v2/ → plugin/
```

**Fresh database** — no migration from existing Docker LanceDB data. Users start clean; memories rebuild naturally within 2-3 sessions.

---

## CURRENT STATE — CODE REFERENCES

### Plugin (TypeScript) — What Stays

**`plugin/src/index.ts` (892 lines) — Hook orchestration**

The main plugin file registers 4 hooks and a memory tool. All backend interaction goes through `memoryClient.*` calls:

```typescript
// line 227 — chat.message hook (turn 1: 4 parallel API calls, turns 2+: semantic refresh)
"chat.message": async (input, output) => { ... }

// line ~400 — system.transform hook (inject [MEMORY] from cache)
"experimental.chat.system.transform": async (input, output) => { ... }

// line ~460 — messages.transform hook (privacy stripping)
"messages.transform": async (input, output) => { ... }

// line ~500 — event hook (auto-save on message.updated, session cleanup)
"event": async (event) => { ... }

// line ~570 — memory tool (search, add, list, forget, profile)
tools: [{ name: "memory", ... }]
```

**Key pattern**: Every `memoryClient.addMemories()`, `memoryClient.searchMemories()`, `memoryClient.listMemories()`, `memoryClient.deleteMemory()`, `memoryClient.registerName()` call becomes a direct function call to the embedded store.

**`plugin/src/services/context.ts` (139 lines) — Pure formatting, copies unchanged**

Formats the `[MEMORY]` block text from structured sections + semantic results. Zero network calls, zero side effects.

**`plugin/src/services/auto-save.ts` (284 lines) — Message buffering**

Buffers conversation messages and triggers extraction. Only `memoryClient.addMemories()` changes to `store.ingest()`.

**`plugin/src/services/compaction.ts` (561 lines) — Context management**

Monitors token usage, triggers compaction context injection. Only `memoryClient.*` calls change.

**`plugin/src/services/tags.ts` (63 lines), `jsonc.ts` (85 lines), `privacy.ts` (12 lines), `logger.ts` (15 lines) — Utilities**

All copy unchanged.

### Plugin (TypeScript) — What Gets Replaced

**`plugin/src/services/client.ts` (462 lines) — HTTP client to backend**

This is the **only file that gets fully replaced**. It wraps 9 methods hitting 5 backend endpoints:

```typescript
// line 56  — addMemories()       → POST /memories (conversation ingest)
// line 170 — searchMemories()    → POST /memories/search
// line 244 — listMemories()      → GET  /memories?user_id=...
// line 286 — listByType()        → GET  /memories?user_id=...&types=...
// line 314 — deleteMemory()      → DELETE /memories/{id}
// line 340 — registerName()      → POST /names
// line 368 — getProfile()        → GET  /memories?user_id=...&limit=...
```

All 9 methods become direct calls to embedded store functions. The HTTP layer disappears entirely.

### Backend (Python) — What Gets Ported

**`backend/app/store.py` (266 lines) — Core memory operations**

```python
# line 35  — find_duplicate()     Dedup via vector similarity (threshold 0.12 / 0.25)
# line 73  — add_memory()         Insert with dedup + contradiction detection
# line 130 — search_memories()    Vector search + recency blending + hybrid enum
# line 170 — enforce_aging()      progress → latest-only; session-summary → cap at 3
```

**`backend/app/extractor.py` (443 lines) — LLM extraction**

```python
# line 49  — call_xai()             POST api.x.ai/v1/chat/completions
# line 95  — call_google()          POST generativelanguage.googleapis.com
# line 140 — call_anthropic()       POST api.anthropic.com/v1/messages
# line 185 — call_llm()             Provider dispatcher
# line 220 — extract_memories()     Conversation → typed memory facts
# line 290 — detect_contradictions() Find + supersede stale memories
# line 360 — condense_to_learned_pattern() Aging summaries
```

**`backend/app/embedder.py` (32 lines) — Voyage AI wrapper**

```python
# line 17 — embed()  Uses voyageai SDK → replaced by fetch() to Voyage API
```

**`backend/app/prompts.py` (202 lines) — Extraction prompts**

```python
# EXTRACTION_PROMPT         — conversation → JSON array of typed facts
# INIT_EXTRACTION_PROMPT    — project file → JSON array of typed facts
# SUMMARY_EXTRACTION_PROMPT — compaction summary → JSON array
# CONTRADICTION_PROMPT      — detect superseded memories
# CONDENSE_PROMPT           — session-summaries → learned-pattern
```

All copy as TypeScript template literals with zero logic changes.

**`backend/app/config.py` (125 lines) — Configuration**

Environment variables, thresholds, pricing constants. Direct port to TypeScript with `process.env` reads.

**`backend/app/models.py` (60 lines) — Schema**

PyArrow schema (10 string fields + 1 vector field of 1024-dim float32). Translates directly to LanceDB Node SDK schema.

---

## ARCHITECTURE

### New Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenCode Runtime                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │  plugin-v2/                                              │       │
│  │                                                          │       │
│  │  index.ts (hooks)                                        │       │
│  │    ├─ chat.message   → store.ingest() / store.search()   │       │
│  │    ├─ system.transform → context.format() (from cache)   │       │
│  │    ├─ event          → store.ingest() (auto-save)        │       │
│  │    └─ memory tool    → store.search/add/list/delete()    │       │
│  │                                                          │       │
│  │  store.ts (CRUD + dedup + aging)                         │       │
│  │    ├─ ingest()     → embedder.embed() → LanceDB write    │       │
│  │    ├─ search()     → embedder.embed() → LanceDB search   │       │
│  │    ├─ list()       → LanceDB query                       │       │
│  │    ├─ delete()     → LanceDB delete                      │       │
│  │    └─ aging()      → LanceDB query + delete              │       │
│  │                                                          │       │
│  │  extractor.ts                                            │       │
│  │    └─ fetch() ──────────────────────────────────┐        │       │
│  │                                                 │        │       │
│  │  embedder.ts                                    │        │       │
│  │    └─ fetch() ──────────┐                       │        │       │
│  │                         │                       │        │       │
│  │  db.ts                  │                       │        │       │
│  │    └─ @lancedb/lancedb ─┼── ~/.opencode-memory/ │        │       │
│  │       (NAPI / Rust)     │   └─ lancedb/         │        │       │
│  │                         │      └─ memories.lance │        │       │
│  └─────────────────────────┼───────────────────────┼────────┘       │
│                            │                       │                │
└────────────────────────────┼───────────────────────┼────────────────┘
                             │                       │
                             ▼                       ▼
                    ┌─────────────┐         ┌─────────────────┐
                    │  Voyage AI  │         │  Extraction LLM │
                    │  API        │         │  (Haiku / Grok  │
                    │  (embed)    │         │   / Gemini)     │
                    └─────────────┘         └─────────────────┘
```

### LanceDB Embedded Schema

The LanceDB Node SDK (`@lancedb/lancedb`) uses napi-rs (Rust via NAPI) for native bindings. Schema is defined via data inference or explicit Arrow schema.

```typescript
// db.ts — ~50 lines
import * as lancedb from "@lancedb/lancedb";

const DB_PATH = `${process.env.HOME}/.opencode-memory/lancedb`;
const TABLE_NAME = "memories";

let db: lancedb.Connection;
let table: lancedb.Table;

export async function init(): Promise<void> {
	db = await lancedb.connect(DB_PATH);
	try {
		table = await db.openTable(TABLE_NAME);
	} catch {
		// First run — create table with seed row, then delete it
		table = await db.createTable(TABLE_NAME, [{
			id: "__seed__",
			memory: "",
			user_id: "",
			vector: new Array(1024).fill(0),
			metadata_json: "{}",
			created_at: "",
			updated_at: "",
			hash: "",
			chunk: "",
			superseded_by: "",
		}]);
		await table.delete('id = "__seed__"');
	}
}

export function getTable(): lancedb.Table {
	if (!table) throw new Error("LanceDB not initialized — call init() first");
	return table;
}
```

**Search API** (from Context7 docs):

```typescript
// Vector search with filter
const results = await table
	.search(queryVector)              // cosine distance by default
	.where("user_id = 'project::myproject' AND superseded_by = ''")
	.limit(20)
	.toArray();

// Results include _distance field (lower = more similar)
// results[0]._distance → 0.0834 (cosine distance)
```

### Embedder (fetch-based)

```typescript
// embedder.ts — ~30 lines
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

export async function embed(
	text: string,
	inputType: "document" | "query" = "document"
): Promise<number[]> {
	const response = await fetch(VOYAGE_API_URL, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${config.VOYAGE_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "voyage-code-3",
			input: [text],
			input_type: inputType,
		}),
	});

	const data = await response.json();
	return data.data[0].embedding;  // float[] — 1024 dimensions
}
```

### Extractor (multi-provider fetch)

```typescript
// extractor.ts — ~200 lines
// Provider dispatcher — same pattern as backend/app/extractor.py

async function callAnthropic(system: string, user: string): Promise<string> {
	const response = await fetch(`${config.ANTHROPIC_BASE_URL}/messages`, {
		method: "POST",
		headers: {
			"x-api-key": config.ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model: config.ANTHROPIC_EXTRACTION_MODEL,
			max_tokens: 2000,
			system,
			messages: [{ role: "user", content: user }],
		}),
	});
	const data = await response.json();
	return data.content[0].text;
}

async function callXai(system: string, user: string): Promise<string> { ... }
async function callGoogle(system: string, user: string): Promise<string> { ... }

export async function callLlm(system: string, user: string): Promise<string> {
	switch (config.EXTRACTION_PROVIDER) {
		case "anthropic": return callAnthropic(system, user);
		case "google":    return callGoogle(system, user);
		case "xai":       return callXai(system, user);
		default:          return callAnthropic(system, user);
	}
}
```

### Dashboard (Optional — Hono + Static SPA)

```typescript
// dashboard/server.ts — ~100 lines
import { Hono } from "hono";
import { serveStatic } from "hono/bun";

const app = new Hono();

// API routes reading from same LanceDB
app.get("/api/memories", async (c) => { ... });
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Static SPA assets
app.use("/*", serveStatic({ root: "./dashboard/public" }));

export function startDashboard(port: number = 3030): void {
	Bun.serve({ fetch: app.fetch, port });
}
```

---

## IMPLEMENTATION PHASES

### PHASE 1: LanceDB Spike — Critical Gate

**Goal**: Validate that `@lancedb/lancedb` works correctly inside OpenCode's plugin runtime (Bun + NAPI)  
**Duration**: 1 day  
**Dependencies**: None  
**Status**: PENDING

This is the **hard gate**. If LanceDB's napi-rs bindings don't work in OpenCode's plugin Bun runtime, the entire plan changes. Everything else is straightforward porting.

**Deliverables:**
- [ ] `plugin-v2/package.json` — minimal package with `@lancedb/lancedb` dependency
- [ ] `plugin-v2/src/db.ts` — connect, create table, insert, search, delete
- [ ] `plugin-v2/src/spike.ts` — standalone test script exercising all operations
- [ ] `plugin-v2/tsconfig.json` — Bun-compatible TypeScript config

**Spike Test Script:**
```typescript
// spike.ts — run with: bun run spike.ts
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("/tmp/opencode-memory-spike");
const table = await db.createTable("test", [{
	id: "test-1",
	memory: "Test memory",
	vector: new Array(1024).fill(0.1),
	user_id: "test",
}]);

// Insert
await table.add([{
	id: "test-2",
	memory: "Second memory",
	vector: new Array(1024).fill(0.2),
	user_id: "test",
}]);

// Search
const results = await table.search(new Array(1024).fill(0.15)).limit(5).toArray();
console.log("Search results:", results.length, results[0]?.id);

// Filter
const filtered = await table
	.search(new Array(1024).fill(0.15))
	.where("user_id = 'test'")
	.limit(5)
	.toArray();
console.log("Filtered results:", filtered.length);

// Delete
await table.delete('id = "test-1"');
const afterDelete = await table.search(new Array(1024).fill(0.15)).limit(5).toArray();
console.log("After delete:", afterDelete.length);

// Update
await table.update({ where: 'id = "test-2"', values: { memory: "Updated memory" } });

// Cleanup
await db.dropTable("test");
console.log("✓ All LanceDB operations work in Bun");
```

**Success Criteria:**
- `bun run spike.ts` passes all operations without errors
- Search returns `_distance` field
- Filters with `where()` work correctly
- No NAPI binding crashes or segfaults
- Works on macOS ARM (dev machine)

**If Spike Fails:**
- Try `vectordb` (older LanceDB package) as fallback
- If both fail, evaluate SQLite + `sqlite-vss` extension as alternative
- Document findings and reassess architecture

---

### PHASE 2: Core Modules — db, embedder, extractor, config, prompts

**Goal**: Port all backend logic to TypeScript modules that can run standalone  
**Duration**: 2-3 days  
**Dependencies**: Phase 1 (LanceDB spike passes)  
**Status**: PENDING

**Deliverables:**
- [ ] `plugin-v2/src/config.ts` — env vars, thresholds, pricing (port from `backend/app/config.py`)
- [ ] `plugin-v2/src/db.ts` — LanceDB init, schema, table management (refined from spike)
- [ ] `plugin-v2/src/embedder.ts` — Voyage AI fetch wrapper
- [ ] `plugin-v2/src/extractor.ts` — multi-provider LLM calls (Haiku, Grok, Gemini)
- [ ] `plugin-v2/src/prompts.ts` — extraction prompt templates (copy from `backend/app/prompts.py`)
- [ ] `plugin-v2/src/store.ts` — CRUD, dedup, aging, contradiction detection
- [ ] `plugin-v2/src/types.ts` — Zod schemas for memory records and API responses

**Port mapping:**

| Python Source | TypeScript Target | Lines | Notes |
|---------------|-------------------|-------|-------|
| `backend/app/config.py` (125 lines) | `config.ts` (~130 lines) | 1:1 | `os.environ.get()` → `process.env` |
| `backend/app/db.py` (15 lines) | `db.ts` (~50 lines) | 3x | Add connect + schema + table management |
| `backend/app/embedder.py` (32 lines) | `embedder.ts` (~30 lines) | 1:1 | `voyageai.Client` → `fetch()` |
| `backend/app/extractor.py` (443 lines) | `extractor.ts` (~200 lines) | 0.45x | `httpx` → `fetch()`, remove telemetry |
| `backend/app/prompts.py` (202 lines) | `prompts.ts` (~200 lines) | 1:1 | Template literals, zero logic |
| `backend/app/store.py` (266 lines) | `store.ts` (~250 lines) | 0.95x | Sync Python → async TypeScript |
| `backend/app/models.py` (60 lines) | `types.ts` (~80 lines) | 1.3x | PyArrow schema → Zod + TS types |

**Validation approach:**
```bash
# Each module should have a standalone test
bun test plugin-v2/src/db.test.ts
bun test plugin-v2/src/embedder.test.ts
bun test plugin-v2/src/store.test.ts
```

**Key design decisions for this phase:**

1. **Zod for runtime validation** — all memory records validated at store boundary
2. **Parameterized queries** — LanceDB `where()` uses string filters; validate all user inputs with `validateId()` before interpolation (same pattern as `backend/app/config.py:16-27`)
3. **Explicit async return types** — every async function annotated per coding standards
4. **No telemetry initially** — strip CostLedger and ActivityLog from port; add back in Phase 5 if needed

**Success Criteria:**
- All modules compile (`bun build`)
- Unit tests pass for db, embedder (mocked), store (integration with real LanceDB)
- Extraction works against at least one provider (Haiku)
- Memory round-trip: embed → store → search → retrieve works end-to-end

---

### PHASE 3: Plugin Integration — Swap Client for Store

**Goal**: Wire embedded store into plugin hooks, replacing all `memoryClient.*` HTTP calls  
**Duration**: 2-3 days  
**Dependencies**: Phase 2  
**Status**: PENDING

**Deliverables:**
- [ ] `plugin-v2/src/index.ts` — Copy from `plugin/src/index.ts`, swap all `memoryClient.*` calls
- [ ] `plugin-v2/src/services/auto-save.ts` — Copy, swap `memoryClient.addMemories()` → `store.ingest()`
- [ ] `plugin-v2/src/services/compaction.ts` — Copy, swap client calls
- [ ] `plugin-v2/src/services/context.ts` — Copy unchanged
- [ ] `plugin-v2/src/services/tags.ts` — Copy unchanged
- [ ] `plugin-v2/src/services/jsonc.ts` — Copy unchanged
- [ ] `plugin-v2/src/services/privacy.ts` — Copy unchanged
- [ ] `plugin-v2/src/services/logger.ts` — Copy unchanged
- [ ] `plugin-v2/src/types/index.ts` — Copy, merge with new types

**Call replacement map:**

| Current (client.ts HTTP) | New (store.ts direct) |
|--------------------------|----------------------|
| `memoryClient.addMemories(messages, userId, metadata)` | `store.ingest(messages, userId, metadata)` |
| `memoryClient.searchMemories(query, userId, recencyWeight)` | `store.search(query, userId, { recencyWeight })` |
| `memoryClient.listMemories(userId, limit)` | `store.list(userId, { limit })` |
| `memoryClient.listByType(userId, types, limit)` | `store.listByType(userId, types, { limit })` |
| `memoryClient.deleteMemory(id, userId)` | `store.delete(id, userId)` |
| `memoryClient.registerName(userId, name)` | `store.registerName(userId, name)` |
| `memoryClient.getProfile(userId)` | `store.getProfile(userId)` |

**Initialization change:**

```typescript
// Before (plugin/src/index.ts)
// memoryClient is always ready — just makes HTTP calls

// After (plugin-v2/src/index.ts)
// Must initialize LanceDB before first use
let initialized = false;

async function ensureInitialized(): Promise<void> {
	if (initialized) return;
	await db.init();
	initialized = true;
}

// In each hook, at the top:
"chat.message": async (input, output) => {
	await ensureInitialized();
	// ... rest of hook
}
```

**Success Criteria:**
- Plugin builds: `bun build plugin-v2/src/index.ts --outdir dist`
- Plugin loads in OpenCode without errors
- Turn 1 injects [MEMORY] block (same format as current)
- Per-turn refresh works (semantic search on turns 2+)
- Auto-save triggers and stores memories
- Memory tool (search, add, list, forget, profile) all work
- Compaction survival works

---

### PHASE 4: CLI Interface

**Goal**: Add terminal commands for memory inspection without requiring a web dashboard  
**Duration**: 1 day  
**Dependencies**: Phase 2  
**Status**: PENDING

**Deliverables:**
- [ ] `plugin-v2/src/cli/index.ts` — CLI entry point with subcommands

**Commands:**

```bash
bunx opencode-memory list                    # List recent memories
bunx opencode-memory search "auth jwt"       # Semantic search
bunx opencode-memory stats                   # Memory count, types, storage size
bunx opencode-memory install                 # Copy plugin config to ~/.config/opencode/
bunx opencode-memory reset                   # Delete all memories (fresh start)
bunx opencode-memory export > memories.json  # Export for backup
```

**Implementation:**
```typescript
// cli/index.ts — ~100 lines
import { parseArgs } from "util";
import { init } from "../db.js";
import * as store from "../store.js";

const { positionals } = parseArgs({
	allowPositionals: true,
});

const [command, ...args] = positionals;

await init();

switch (command) {
	case "list":
		const memories = await store.list(args[0] || "default", { limit: 20 });
		for (const m of memories) {
			console.log(`[${m.type}] ${m.memory}`);
		}
		break;
	case "search":
		const results = await store.search(args.join(" "), args[0] || "default");
		// ...
		break;
	// ...
}
```

**Success Criteria:**
- `bunx opencode-memory list` shows memories from local LanceDB
- `bunx opencode-memory search "query"` returns relevant results
- `bunx opencode-memory install` copies plugin config correctly
- Works without Docker running

---

### PHASE 5: E2E Validation & Benchmark

**Goal**: Validate embedded plugin matches or exceeds current Docker-based system  
**Duration**: 2-3 days  
**Dependencies**: Phase 3  
**Status**: PENDING

**Deliverables:**
- [ ] E2E scenarios 1-11 pass with plugin-v2
- [ ] DevMemBench run with plugin-v2 (target: ≥90% overall score)
- [ ] Latency comparison: embedded vs Docker HTTP

**Validation steps:**

```bash
# 1. Point OpenCode to plugin-v2
# Update ~/.config/opencode/config.json to load plugin-v2/ instead of plugin/

# 2. Run E2E test suite
cd testing && bun run test

# 3. Run benchmark
cd benchmark
nohup bun run src/index.ts run -r embedded-v1 > /tmp/bench-embedded-v1.log 2>&1 &
```

**Regression thresholds:**
- E2E: All 11 scenarios pass (zero regressions)
- Benchmark: ≥90% overall, no category drops >2% vs latest Docker run
- Latency: Embedded should be faster (no HTTP round-trip)

**Success Criteria:**
- All E2E scenarios pass
- Benchmark score ≥90%
- No category regression >2%
- Manual dogfooding for 2-3 real sessions confirms quality

---

### PHASE 6: Cutover — Delete Docker Stack

**Goal**: Remove all Docker infrastructure and promote plugin-v2 to primary  
**Duration**: 1 day  
**Dependencies**: Phase 5 (all validation passes)  
**Status**: PENDING

**Deliverables:**
- [ ] Delete `backend/` directory (1,590 lines Python)
- [ ] Delete `frontend/` directory (Next.js dashboard)
- [ ] Delete `docker-compose.yml`
- [ ] Delete `Dockerfile` files
- [ ] Rename `plugin-v2/` → `plugin/`
- [ ] Update `README.md` — new setup instructions (no Docker)
- [ ] Update `.github/workflows/` — remove Docker build/push jobs
- [ ] Update `testing/` — point to new plugin path
- [ ] Update `benchmark/` — point to new plugin path

**README changes:**

Before:
```bash
# Setup
docker compose up -d
# Wait for health checks...
# Configure plugin to point to localhost:8020...
```

After:
```bash
# Setup
bunx opencode-memory install
# Done. Memory works automatically.
```

**Success Criteria:**
- Repository has no Docker files
- `backend/` and `frontend/` directories deleted
- `plugin/` is the embedded version
- README reflects new setup
- CI/CD updated
- All E2E tests pass from clean state

---

## EDGE CASES & DECISIONS

### High Priority — Must Resolve Before Implementation

| Edge Case | Decision | Implementation |
|-----------|----------|----------------|
| LanceDB NAPI doesn't work in OpenCode runtime | Phase 1 spike is the gate; if it fails, evaluate alternatives (sqlite-vss, chromadb) | Run spike before any other work |
| Concurrent writes from multiple OpenCode sessions | LanceDB supports concurrent readers + single writer via WAL; OpenCode typically runs one session at a time | Acceptable — add retry with backoff if write conflicts occur |
| Database corruption on crash | LanceDB uses Lance format with ACID transactions; data directory backed by append-only columnar files | No special handling needed; Lance format is crash-safe |
| API key configuration | Currently in Docker env vars; must work via OpenCode plugin config or env vars | Support both: `process.env.VOYAGE_API_KEY` and plugin config file |

### Medium Priority — Should Resolve, Can Defer

| Edge Case | Proposed Approach | Deferral Risk |
|-----------|-------------------|---------------|
| Large memory databases (>10K memories) | LanceDB handles millions of rows; no index needed below 100K | Low — single-user system unlikely to exceed 10K |
| Voyage AI rate limits (2000 RPM) | Current usage is ~5-10 RPM; no rate limiting needed | Low — would need 200x current usage to hit limits |
| LanceDB disk usage growth | Lance format compacts automatically; monitor `~/.opencode-memory/` size | Low — text + 1024-dim vectors are small per record |
| Platform-specific NAPI binaries | `@lancedb/lancedb` publishes binaries for macOS ARM/Intel, Linux x64/ARM, Windows x64 | Medium — untested platforms may need build from source |

### Low Priority — Acceptable to Leave Unresolved

| Edge Case | Why It's Acceptable |
|-----------|---------------------|
| No web dashboard initially | CLI provides inspection; dashboard is Phase 4 stretch goal |
| No telemetry/cost tracking | Can add later; extraction cost is ~$0.03/session regardless |
| No migration from Docker data | Fresh start is simpler; memories rebuild in 2-3 sessions |

---

## DECISION LOG

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database engine | LanceDB (embedded, NAPI) | Only viable embedded vector DB with Bun compatibility; no server process needed |
| Embedding API | Direct `fetch()` to Voyage AI | Eliminates `voyageai` Python SDK dependency; identical results |
| Extraction API | Direct `fetch()` to provider endpoints | Eliminates `httpx` Python dependency; same OpenAI-compatible format |
| Migration strategy | Strangler fig (build alongside, then cutover) | Zero risk to current system during development |
| Data migration | Fresh database, no migration | Simpler than schema migration; memories rebuild naturally |
| Schema validation | Zod at store boundary | Catches malformed data before LanceDB write; aligns with project preference |
| Query safety | `validateId()` before `where()` interpolation | LanceDB doesn't support parameterized where clauses; input validation is the mitigation |
| Dashboard framework | Hono (if built) | Lightweight, Bun-native, serves static files; no React SSR needed |
| Package manager | pnpm for plugin-v2 | User preference; consistent with project standards |
| Indentation | Tabs | User preference; enforced across all new files |
| DB location | `~/.opencode-memory/lancedb/` | Follows XDG-like convention; outside project directory; shared across projects |
| Plugin folder name | `plugin-v2/` during development, rename to `plugin/` at cutover | Allows parallel development without breaking current system |

---

## CONFIDENCE CHECK

| Area | Score | Notes |
|------|-------|-------|
| LanceDB Node SDK API | 7/10 | Context7 docs confirm API shape; spike needed to validate Bun runtime compat |
| Voyage AI fetch replacement | 10/10 | Trivial HTTP POST; well-documented endpoint; already tested conceptually |
| Extraction provider fetch | 9/10 | All three providers use OpenAI-compat or simple REST; backend code is the reference |
| Store logic port (dedup/aging) | 9/10 | Direct port from Python; logic is well-understood from analysis session |
| Plugin hook integration | 9/10 | Current hooks are well-documented in design doc 001; swap is mechanical |
| Compaction survival | 10/10 | Already implemented in current plugin via system.transform (design doc 001) |
| CLI tooling | 9/10 | Simple `parseArgs` + store calls; no complex UI |
| E2E/Benchmark validation | 9/10 | Existing test infrastructure; just point to new plugin |

**Overall: 9/10** — Only area below 8 is LanceDB Bun compatibility, which Phase 1 spike resolves before any other work begins.

---

## METRICS & MEASUREMENT

| Metric | How Measured | Baseline (Docker) | Target (Embedded) |
|--------|-------------|-------------------|-------------------|
| Setup time | Manual timing | ~2-5 min (Docker pull + compose up) | <10 seconds (`bunx opencode-memory install`) |
| Memory operation latency | Logging timestamps | ~5-15ms (HTTP round-trip) | <1ms (direct function call) |
| E2E scenario pass rate | `bun run test` | 11/11 | 11/11 |
| Benchmark score | `bun run bench run` | ~93.5% (latest) | ≥90% (no regression) |
| Lines of code (total) | `wc -l` | 2,920 (plugin) + 1,590 (backend) = 4,510 | ~2,200 (plugin-v2 only) |
| Dependencies | Package count | Python + Node + Docker | Bun + @lancedb/lancedb only |
| Disk footprint | `du -sh` | ~200MB (Docker images) | ~20MB (NAPI binary + DB files) |
| Resource usage | Activity Monitor | ~200MB RAM (two containers) | ~20MB RAM (in-process) |
| Processes required | `ps aux | grep` | 3 (Docker, backend, frontend) | 0 additional |

---

## ROLLBACK PLAN

### Detection — What Signals a Problem

- Phase 1 spike fails (LanceDB NAPI doesn't work in Bun)
- E2E scenario regressions after plugin swap
- Benchmark score drops >2% in any category
- Memory corruption or data loss during testing
- Unacceptable latency spikes

### Immediate Rollback

The strangler fig pattern means rollback is trivial at any point:

```bash
# Before cutover (Phases 1-5): Simply stop working on plugin-v2/
# Current plugin/ + Docker stack are completely untouched

# After cutover (Phase 6): Git revert
git revert <cutover-commit>
docker compose up -d  # Restore Docker stack
```

### Graceful Degradation

During Phases 1-5, both systems coexist:
- `plugin/` → current production (Docker-backed)
- `plugin-v2/` → development (embedded)

Switch between them by changing the plugin path in `~/.config/opencode/config.json`.

### Recovery Steps

1. Revert to `plugin/` (current) in OpenCode config
2. `docker compose up -d` (restart Docker stack)
3. Investigate root cause in `plugin-v2/`
4. Fix in new branch
5. Re-validate (E2E + benchmark)
6. Re-attempt cutover

---

## DIAGRAMS

### Migration Timeline

```
Week 1                                    Week 2
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ Day 1    │ Day 2-3  │ Day 4-5   │     │ Day 6-7   │ Day 8    │ Day 9-10 │
│          │          │           │     │           │          │          │
│ Phase 1  │ Phase 2  │ Phase 3   │     │ Phase 5   │ Phase 6  │ Buffer   │
│ LanceDB  │ Core     │ Plugin    │     │ E2E +     │ Cutover  │ Fixes +  │
│ Spike    │ Modules  │ Integrate │     │ Benchmark │ Delete   │ Polish   │
│ (gate)   │ Port     │ Swap      │     │ Validate  │ Docker   │          │
│          │ Backend  │ Client    │     │           │          │          │
├──────────┴──────────┴───────────┤     ├───────────┴──────────┴──────────┤
│ Phase 4: CLI (parallel w/ Ph 3) │     │                                 │
└──────────────────────────────────┘     └─────────────────────────────────┘

Legend: ■ Critical path  □ Parallel work  ░ Buffer
```

### Before/After Architecture

```
BEFORE (current):
┌─────────────┐    HTTP     ┌─────────────────┐    Disk     ┌──────────┐
│   OpenCode  │────────────▶│  Python Backend  │───────────▶│ LanceDB  │
│   Plugin    │  port 8020  │  (Docker)        │            │ (Docker  │
│  (462 lines │◀────────────│  1,590 lines     │◀───────────│  volume) │
│   client)   │             └─────────────────┘            └──────────┘
└─────────────┘                     │
                                    │ fetch()
                              ┌─────┴─────┐
                              │ Voyage AI │
                              │ + LLMs    │
                              └───────────┘

AFTER (embedded):
┌─────────────────────────────────────────┐
│   OpenCode Plugin (single process)       │
│                                          │
│   index.ts → store.ts → db.ts           │    Disk     ┌──────────┐
│                  │                       │───────────▶│ LanceDB  │
│                  ├─ embedder.ts ──────── │ ──┐        │ (local   │
│                  └─ extractor.ts ─────── │ ──┤        │  files)  │
│                                          │   │        └──────────┘
└──────────────────────────────────────────┘   │
                                               │ fetch()
                                         ┌─────┴─────┐
                                         │ Voyage AI │
                                         │ + LLMs    │
                                         └───────────┘
```

---

## SESSION CONTINUITY

### Research Completed

- LanceDB Node SDK API: `connect()`, `createTable()`, `openTable()`, `search()`, `where()`, `limit()`, `toArray()` — documented via Context7
- Voyage AI API: `POST /v1/embeddings`, model `voyage-code-3`, 1024 dimensions, `fetch()` compatible
- Backend Python code: All 11 files analyzed (1,590 lines), every function mapped to TypeScript equivalent
- Plugin code: All 13 files analyzed (2,920 lines), `client.ts` identified as only file needing replacement
- Hono: `serveStatic` from `hono/bun`, lightweight API routes — documented via Context7

### Next Session Protocol

1. Read this design doc completely
2. Start Phase 1 (LanceDB spike) — this is the hard gate
3. If spike passes, proceed through phases 2-6
4. After each phase: run relevant tests, update this doc with status
5. After Phase 5: run full benchmark, validate regression threshold
6. Phase 6: cutover only after all validation passes

### Key File References

- This doc: `.github/designs/003-plugin-embedded-rewrite.md`
- Issue: #50
- Current plugin: `plugin/src/` (13 files, 2,920 lines)
- Backend to port: `backend/app/` (11 files, 1,590 lines)
- New plugin: `plugin-v2/src/` (to be created)
- Design framework: `.github/designs/FEATURE-DESIGN-FRAMEWORK.md`
- Prior design docs: `001-per-turn-memory-refresh.md`, `002-gemini-extraction-provider.md`
