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
	telemetry.ts    ~250 lines  CostLedger + ActivityLog (port from backend)
	index.ts        ~900 lines  OpenCode hooks (swap client.* for store.*)
	services/       ~1100 lines auto-save, compaction, context, tags, etc. (mostly unchanged)
	cli/index.ts    ~100 lines  Terminal inspection commands
	dashboard/      ~200 lines  On-demand Hono server (started via memory tool)
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
#   - progress: query all by user_id + type, sort by created_at DESC, delete all except newest
#   - session-summary: query all by user_id + type, sort by created_at DESC
#     if count > 3: condense oldest into learned-pattern via LLM, then delete condensed summaries
#     identification: by created_at timestamp (most recent 3 kept, older ones condensed)
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
import { homedir } from "node:os";
import { join } from "node:path";

const DB_PATH = join(homedir(), ".opencode-memory", "lancedb");
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

### LanceDB Advanced Features (from Context7 research)

The LanceDB Node SDK supports several advanced features that improve search quality and data management:

**Full-Text Search (FTS) Index:**

```typescript
// Create FTS index on memory content for keyword matching
await table.createIndex("memory", {
	config: lancedb.Index.fts({
		withPosition: true,
		stem: true,
		removeStopWords: true,
	}),
});

// Pure FTS query (no vectors needed)
const ftsResults = await table.search("jwt authentication", "fts").limit(10).toArray();
```

**Hybrid Search (Vector + FTS with reranking):**

```typescript
// Combine vector similarity + keyword relevance using Reciprocal Rank Fusion
const hybridResults = await table
	.search(queryVector)
	.where("user_id = 'project::myproject'")
	.limit(20)
	.rerank(lancedb.Reranker.rrf())  // or LinearCombination, Cohere
	.toArray();
```

This is relevant for the enumeration search path (listing all memories of a type) and session-continuity queries where keyword matching ("last session", "previously") complements vector similarity.

**Merge Insert (Upsert):**

```typescript
// Atomic upsert — update if exists, insert if new
await table
	.mergeInsert("id")
	.whenMatchedUpdateAll()
	.whenNotMatchedInsertAll()
	.execute(newRecords);
```

Useful for contradiction resolution: instead of separate delete + insert, use `mergeInsert` to atomically supersede old memories.

**Vector Index (for scale):**

```typescript
// IVF-PQ index for faster search at >50K rows
await table.createIndex("vector", {
	config: lancedb.Index.ivfPq({
		distanceType: "cosine",
		numPartitions: 256,
		numSubVectors: 96,
	}),
});

// HNSW-SQ for better recall (recommended for our use case)
await table.createIndex("vector", {
	config: lancedb.Index.hnswSq({
		distanceType: "cosine",
	}),
});
```

Not needed at our scale (<10K memories) but available when needed — LanceDB scans linearly without index and only benefits from indexing at higher row counts.

**Scalar Filtering Index:**

```typescript
// BTree index on user_id for fast filtering
await table.createIndex("user_id", { config: lancedb.Index.btree() });

// Bitmap index on type (low cardinality — ~10 distinct values)
await table.createIndex("type", { config: lancedb.Index.bitmap() });
```

**Table Optimization (VACUUM equivalent):**

```typescript
// Periodic maintenance — compaction + pruning old versions + index optimization
await table.optimize({
	cleanupOlderThan: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
});

// Table versioning — useful for debugging and rollback
const version = await table.version();
const versions = await table.listVersions();
await table.checkout(version - 1);  // Read from previous version
await table.checkoutLatest();        // Return to latest
await table.restore();               // Restore checked-out version as latest
```

Schedule `table.optimize()` on `session.idle` events (same trigger as auto-save) with a longer cooldown (e.g., every 24 hours). This prevents unbounded growth of Lance fragment files.

**Implementation plan**: Start without indexes (Phase 2). Add FTS index in Phase 5 if benchmark shows keyword queries underperforming. Add vector indexes only if database exceeds ~50K rows.

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

### Bun Native APIs

Prefer Bun-native APIs over Node.js equivalents throughout the codebase:

| Operation | Node.js | Bun Native | Where Used |
|-----------|---------|------------|------------|
| Read file | `fs.readFileSync()` | `Bun.file(path).text()` | Config loading, JSONC parsing |
| Write file | `fs.writeFileSync()` | `Bun.write(path, data)` | Telemetry ledger, session cache |
| JSONC parse | Custom parser | `Bun.JSONC.parse(text)` | Config loading (replaces `services/jsonc.ts`) |
| HTTP server | Express / Hono standalone | `Bun.serve({ fetch })` | Dashboard server |
| Shell commands | `child_process` / `execa` | `Bun.$` | CLI installer |
| File existence | `fs.existsSync()` | `await Bun.file(path).exists()` | Config, DB directory checks |

**Key implication**: `Bun.JSONC.parse()` is built into the runtime and can replace our custom `services/jsonc.ts` (85 lines) entirely. This reduces the codebase by one file.

### Telemetry — CostLedger + ActivityLog (Required)

Telemetry is a **core module**, not optional. Every API call (Voyage AI embeddings, LLM extraction) records tokens and cost to a local file so the memory tool can report stats/costs/activity on demand.

```typescript
// telemetry.ts — ~250 lines (port from backend/app/telemetry.py, 280 lines)

interface CostEntry {
	timestamp: string;
	provider: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	cost: number;
	operation: "embed" | "extract" | "condense" | "contradict";
}

const LEDGER_PATH = `${process.env.HOME}/.opencode-memory/costs.jsonl`;

export async function recordCost(entry: CostEntry): Promise<void> {
	const line = JSON.stringify(entry) + "\n";
	await Bun.write(LEDGER_PATH, line, { append: true });
}

export async function getCosts(since?: string): Promise<CostEntry[]> {
	const file = Bun.file(LEDGER_PATH);
	if (!await file.exists()) return [];
	const text = await file.text();
	return text.trim().split("\n")
		.map(line => JSON.parse(line))
		.filter(e => !since || e.timestamp >= since);
}

export async function getActivity(limit: number = 50): Promise<ActivityEntry[]> {
	// Similar JSONL append + read pattern
}
```

**Memory tool modes** for telemetry data:

| Mode | Description | Data Source |
|------|-------------|------------|
| `stats` | Memory count by type, project, storage size | LanceDB `countRows()` + `du -sh` |
| `costs` | API costs by provider/model, totals | `costs.jsonl` ledger |
| `activity` | Recent API calls, latencies, error rates | `activity.jsonl` log |

### OpenCode Plugin Integration Features

Research into the OpenCode plugin SDK revealed several features to use:

**Custom tool with Zod schema** (already used for memory tool, but can expand):

```typescript
import { tool } from "@opencode-ai/plugin";
import { z } from "zod";

// The memory tool already exists — extend with new modes
tools: [tool({
	name: "memory",
	description: "Persistent memory system...",
	args: z.object({
		mode: z.enum(["search", "add", "list", "forget", "profile", "stats", "costs", "activity", "dashboard", "help"]),
		query: z.string().optional(),
		content: z.string().optional(),
		scope: z.enum(["user", "project"]).optional(),
		type: z.enum(["project-brief", "architecture", ...]).optional(),
		memoryId: z.string().optional(),
		limit: z.number().optional(),
	}),
	execute: async (args, context) => {
		// context provides: { agent, sessionID, messageID, directory, worktree }
	},
})]
```

**TUI integration** for user notifications:

```typescript
// Show toast when memories are saved (non-blocking notification)
client.tui.showToast("Saved 3 new memories");

// Show toast when dashboard starts
client.tui.showToast("Dashboard running at http://localhost:3030");
```

**Structured logging** via OpenCode SDK:

```typescript
// Replace console.log / custom logger with SDK logging
client.app.log({ body: { service: "opencode-memory", level: "debug", message: "Extracted 5 memories from conversation" } });
client.app.log({ body: { service: "opencode-memory", level: "warn", message: "Voyage API rate limit approaching" } });
client.app.log({ body: { service: "opencode-memory", level: "error", message: `LanceDB write failed: ${error.message}` } });
```

**Compaction hook** (already implemented, but document the API):

```typescript
// experimental.session.compacting — inject memory context into compaction
"experimental.session.compacting": async (input, output) => {
	// output.context.push() adds text to compaction summary
	output.context.push("[MEMORY]\n" + memoryBlock);
	// output.prompt can replace entire compaction prompt (rarely needed)
}
```

**Event subscriptions** available for future features:

| Event | Potential Use |
|-------|--------------|
| `session.created` | Auto-initialize project memories |
| `session.idle` | Trigger background dedup/aging |
| `session.error` | Log errors to activity ledger |
| `session.diff` | Track session state changes |
| `file.edited` | Track which files the agent modifies |
| `tool.execute.before/after` | Measure tool execution latency |
| `permission.asked/replied` | Audit permission decisions |

**Environment variable injection** via `shell.env` hook:

```typescript
// Inject API keys into shell environment for CLI tools
"shell.env": async (input, output) => {
	output.env.VOYAGE_API_KEY = config.VOYAGE_API_KEY;
	output.env.OPENCODE_MEMORY_DIR = config.DATA_DIR;
}
```

This hook injects env vars into all shell execution (AI tools and user terminals). Useful for making API keys available to CLI subcommands without explicit passing.

### Dashboard — Hybrid Model (Agent Inline + On-Demand Hono)

The dashboard follows a **hybrid approach** rather than always-running server:

**Primary path — Agent inline queries** (via memory tool modes):

```
User: "How much has memory cost me?"
Agent: memory({ mode: "costs" })
→ Returns formatted table in chat, no server needed
```

The memory tool handles `stats`, `costs`, and `activity` modes by reading local files (JSONL ledger, LanceDB) and returning formatted text directly to the agent.

**Secondary path — On-demand Hono server** (for rich visual exploration):

```
User: "Show me the dashboard"
Agent: memory({ mode: "dashboard" })
→ Starts Hono server on port 3030
→ Returns "Dashboard running at http://localhost:3030"
→ User opens browser
```

```typescript
// dashboard/server.ts — ~200 lines
import { Hono } from "hono";
import { serveStatic } from "hono/bun";

const app = new Hono();

// API routes reading from same LanceDB
app.get("/api/memories", async (c) => {
	const memories = await store.list(c.req.query("userId") || "default", {
		limit: parseInt(c.req.query("limit") || "100"),
	});
	return c.json(memories);
});
app.get("/api/stats", async (c) => { ... });
app.get("/api/costs", async (c) => { ... });
app.get("/api/activity", async (c) => { ... });
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Static SPA assets
app.use("/*", serveStatic({ root: "./dashboard/public" }));

let server: ReturnType<typeof Bun.serve> | null = null;

export function startDashboard(port: number = 3030): string {
	if (server) return `Dashboard already running at http://localhost:${port}`;
	server = Bun.serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
	return `Dashboard running at http://localhost:${port}`;
}

export function stopDashboard(): void {
	server?.stop();
	server = null;
}
```

**Lifecycle**: Server starts on `memory({ mode: "dashboard" })`, stops on `memory({ mode: "dashboard", content: "stop" })` or when OpenCode session ends (cleanup in `session.deleted` event). The dashboard is NOT always running — it starts only when requested.

---

## KEY PATTERNS FOR PORTING

Critical implementation details discovered during deep codebase analysis. These are patterns, workarounds, and gotchas that must be preserved or fixed in the rewrite.

### CRITICAL — Must Port Exactly

**1. assistantTextBuffer Streaming Pattern**

The `messages.transform` hook fires BEFORE the LLM call, so `cachedMessages` never contains the latest assistant response. The plugin works around this with a streaming buffer:

```typescript
// auto-save.ts — accumulates streaming text
// Map<"sessionID:messageID", string>
const assistantTextBuffer = new Map<string, string>();  // Hard cap: 200 entries, FIFO eviction

// message.part.updated events → buffer text chunks
// message.updated (finish !== "tool-calls") → inject into cachedMessages
function injectFinalAssistantMessage(sessionId: string, messageId: string): void {
	const key = `${sessionId}:${messageId}`;
	const text = assistantTextBuffer.get(key);
	if (!text) return;
	// Inject synthetic assistant message into cachedMessages
	assistantTextBuffer.delete(key);
}
```

**Why this matters**: Without this pattern, auto-save extraction would never see the assistant's most recent response. This is not a bug — it's a fundamental timing constraint in the hook system.

**2. SDK Fetch Fallback Pattern**

```typescript
// auto-save.ts — fetchMessages() tries SDK first, falls back to cache
async function fetchMessages(sessionId: string): Promise<Message[]> {
	try {
		return await client.session.messages(sessionId);  // Fails in TUI mode ("Unauthorized")
	} catch {
		return cachedMessages.get(sessionId) ?? [];  // Primary mechanism
	}
}
```

The SDK message API is unreliable in TUI mode. The transform cache + streaming buffer is the **actual** message source for extraction. The rewrite must preserve this dual-path approach.

**3. Compaction Filesystem I/O (NOT "Minimal Changes")**

`compaction.ts` (561 lines) directly reads and writes OpenCode's internal message storage:

```typescript
// compaction.ts — injectHookMessage()
// Writes synthetic JSON files to:
//   ~/.opencode/messages/{sessionID}/{messageID}.json
//   ~/.opencode/parts/{messageID}/{partID}.json

// findNearestMessageWithFields()
// Reads message JSONs to extract agent, model, path metadata
// Scans ~/.opencode/messages/{sessionID}/ directory
```

**Current design doc says "copies with minimal changes" — this is wrong.** Compaction is deeply coupled to OpenCode's internal storage format. The rewrite must:
- Preserve the exact JSON format for `injectHookMessage()` (OpenCode reads these files)
- Handle the directory scanning in `findNearestMessageWithFields()`
- Test that injected messages survive compaction and appear in subsequent turns

**4. Compaction State Machine (3-Phase)**

```
compactionInProgress: Set<string>    — guards concurrent compaction per session
lastCompactionTime: Map<string, number> — 30s cooldown per session
summarizedSessions: Set<string>      — tracks sessions for summary extraction
```

**State leak bug to fix**: `summarizedSessions.add(sessionId)` is called BEFORE `summarize()`. If `summarize()` throws, cleanup removes from `compactionInProgress` but NOT from `summarizedSessions`, causing the session to be permanently skipped for future summary extraction. Fix: move `add()` after successful `summarize()`.

**5. Two Parallel Auto-Save Tracks**

`onSessionIdle()` runs both tracks concurrently:

```typescript
await Promise.all([
	extractAndSave(),        // Last 8 messages → atomic typed facts (EXTRACTION prompts)
	generateSessionSummary() // Last 20 messages → single session-summary (SUMMARY prompts)
]);
```

| Track | Messages | Min Required | Prompt Set | Output | Cooldown |
|-------|----------|-------------|------------|--------|----------|
| Extraction | Last 8 | 2 messages, 100 chars | `EXTRACTION_SYSTEM/USER` | Multiple typed facts | 15s per session |
| Summary | Last 20 | 4 messages | `SUMMARY_SYSTEM/USER` | Single session-summary | Every 5 turns |

Both tracks share the same `memoryClient.addMemories()` endpoint (→ `store.ingest()` in rewrite) but use different prompt templates and thresholds.

**6. Three Distinct Extraction Modes**

The extractor is called in three different contexts with different prompts:

| Mode | Prompt Pair | Input | Output | Called From |
|------|-------------|-------|--------|-------------|
| Normal | `EXTRACTION_SYSTEM/USER` | Conversation (last 8 msgs) | Multiple typed facts | `extractAndSave()` |
| Summary | `SUMMARY_SYSTEM/USER` | Conversation (last 20 msgs) | Single session-summary | `generateSessionSummary()` |
| Init | `INIT_EXTRACTION_SYSTEM/USER` | Project files (README, etc.) | Typed facts (always includes project-brief) | `addMemoryFromProjectFiles()` |

The rewrite extractor must support all three modes via a `mode` parameter.

**7. Enumeration Query Detection**

```typescript
// client.ts — ENUMERATION_REGEX
const ENUMERATION_REGEX = /\b(list|show|display|every|all)\b.*\b(env|var|pref|config|pattern|error|solution)\b/i;
const WIDE_SYNTHESIS_REGEX = /\b(across\s+both|all\s+projects?)\b/i;

// When triggered: type-filtered retrieval supplements semantic search
// Types queried: tech-context, preference, learned-pattern, error-solution, project-config
// Wide synthesis adds: architecture
// Type-filtered extras get fixed score of 0.25
// Total response: up to 40 items (20 semantic + 20 type-filtered extras)
```

This pattern boosts recall for "list all preferences" style queries where pure vector similarity would miss items with different phrasings.

### MEDIUM — Port with Adjustments

**8. Module-Level State with Hard Caps**

All module-level Maps must preserve hard caps to prevent memory leaks:

| State | Type | Max Entries | Eviction |
|-------|------|-------------|----------|
| `assistantTextBuffer` | `Map<string, string>` | 200 | FIFO |
| `lastExtracted` | `Map<string, number>` | 500 | FIFO |
| `turnCountPerSession` | `Map<string, number>` | 500 | FIFO |
| `sessionCaches` | `Map<string, Message[]>` | Unbounded | Cleaned on `session.deleted` |
| `modelLimits` | `Map<string, number>` | Populated once at init | Never evicted |

**9. Dedup vs Fresh Insert Side Effects**

| Path | Dedup Check | Contradiction Detection | Aging Rules |
|------|-------------|------------------------|-------------|
| Dedup match (UPDATE) | Yes — updates `memory`, `updated_at`, `hash`, `metadata_json`, `chunk` | NO | NO |
| New insert (ADD) | Yes — no match found | YES | YES |

This is intentional: dedup updates are lightweight refreshes of existing knowledge. Only genuinely new memories trigger the expensive contradiction + aging pipeline.

**10. Scope Detection Heuristic**

```typescript
// Backend checks for "_user_" substring in user_id
// Tags generate: "opencode_user_{hash}" and "opencode_project_{hash}"
const isUserScope = userId.includes("_user_");
```

The rewrite must preserve this naming convention — it's how user-scoped vs project-scoped memories are distinguished.

**11. Name Registry (names.json)**

Separate JSON file at `{DATA_DIR}/names.json` — NOT stored in LanceDB:

```python
# backend/app/registry.py — 64 lines
# Thread-safe locking (Python threading.Lock)
# Maps hashes to human-readable names
# e.g., "opencode_project_a1b2c3" → "my-project"
```

The rewrite needs a `names.ts` module (~40 lines) using `Bun.file()` / `Bun.write()` with in-memory cache.

### BUG TO FIX IN REWRITE

**12. Privacy Stripping Gap**

`<private>` tags are currently only stripped in the memory tool `add` handler (`index.ts` line 662-664). Three other paths skip privacy stripping entirely:

| Path | Privacy Strip? | Risk |
|------|---------------|------|
| Memory tool `add` | YES | None |
| Auto-save (`addMemoryFromMessages`) | **NO** | Private content stored from conversations |
| Compaction (`ingestConversation`) | **NO** | Private content stored from compaction summaries |
| Init (`addMemoryFromProjectFiles`) | **NO** | Private content stored from project files |

**Fix**: Apply `stripPrivateContent()` in all four paths before sending to extraction or storage.

**13. Logger Uses Sync I/O**

```typescript
// logger.ts — 15 lines
// Uses appendFileSync() — blocks the event loop
// Replace with: await Bun.write(path, data, { append: true })
```

### REFERENCE — Hardcoded Values Inventory

All magic numbers that should be centralized in `config.ts`:

**Plugin-side (13 values):**

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `TIMEOUT_MS` | 30000 | client.ts | HTTP request timeout |
| `MAX_CONVERSATION_CHARS` | 100000 | auto-save.ts | Max conversation size for extraction |
| `DEFAULT_THRESHOLD` | 0.80 | index.ts | Context size threshold for compaction trigger |
| `MIN_TOKENS` | 50000 | compaction.ts | Minimum token count before compaction considered |
| `COMPACTION_COOLDOWN` | 30000 | compaction.ts | 30s between compactions per session |
| `DEFAULT_CONTEXT_LIMIT` | 200000 | compaction.ts | Default max context tokens |
| `COOLDOWN_MS` | 15000 | auto-save.ts | 15s between extractions per session |
| `MIN_EXCHANGE_CHARS` | 100 | auto-save.ts | Minimum conversation length for extraction |
| `MAX_MESSAGES` | 8 | auto-save.ts | Last N messages for extraction |
| `INIT_TOTAL_CHAR_CAP` | 7000 | index.ts | Max chars read from project files for init |
| `similarity` | 0.55 | client.ts | Minimum similarity threshold for search |
| `chunk_truncation` | 400 | client.ts | Max chars per memory chunk |
| `hash_prefix` | 16 | client.ts | Hash prefix length for content dedup |

**Backend-side (14 values):**

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `DEDUP_DISTANCE` | 0.12 | store.py | Vector distance threshold for dedup |
| `STRUCTURAL_DEDUP` | 0.25 | store.py | Structural dedup distance threshold |
| `CONTRADICTION_CANDIDATE` | 0.5 | store.py | Distance threshold for contradiction candidates |
| `STRUCTURAL_CONTRADICTION` | 0.75 | store.py | Structural contradiction distance threshold |
| `CANDIDATE_LIMIT` | 25 | store.py | Max candidates for dedup/contradiction search |
| `MAX_SESSION_SUMMARIES` | 3 | store.py | Cap on session-summary type per project |
| `MAX_CONTENT_CHARS` | 8000 | extractor.py | Max input chars for extraction |
| `MAX_SUMMARY_CHARS` | 4000 | extractor.py | Max input chars for summary extraction |
| `max_tokens` | 2000 | extractor.py | Max output tokens for LLM calls |
| `temperature` | 0 | extractor.py | LLM temperature (deterministic) |
| `timeout` | 60s | extractor.py | LLM API call timeout |
| `RECENCY_DECAY` | 0.1 | routes/memories.py | Recency weight decay factor |
| `ENUM_BASE_SCORE` | 0.25 | routes/memories.py | Base score for type-filtered enum results |
| `ACTIVITY_MAX` | 200 | telemetry.py | Activity log ring buffer size |

All 27 values should be centralized in `config.ts` with sensible defaults and optional env var overrides.

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

// === ASYNC STRESS TEST (critical for Bun NAPI-RS compat) ===
const db2 = await lancedb.connect("/tmp/opencode-memory-spike-async");
const asyncTable = await db2.createTable("async_test", [{
	id: "seed", memory: "seed", vector: new Array(1024).fill(0), user_id: "test",
}]);

// Concurrent writes — verify no corruption
await Promise.all(
	Array.from({ length: 10 }, (_, i) =>
		asyncTable.add([{
			id: `concurrent-${i}`,
			memory: `Concurrent write ${i}`,
			vector: new Array(1024).fill(i / 10),
			user_id: "test",
		}])
	)
);
const count = await asyncTable.countRows();
console.log(`Concurrent writes: ${count} rows (expected 11)`);

// Search during write
const [writeResult, searchResult] = await Promise.all([
	asyncTable.add([{ id: "during-search", memory: "Written during search", vector: new Array(1024).fill(0.5), user_id: "test" }]),
	asyncTable.search(new Array(1024).fill(0.5)).limit(5).toArray(),
]);
console.log(`Search during write: ${searchResult.length} results`);

// Optimize (VACUUM equivalent)
await asyncTable.optimize();
console.log("✓ table.optimize() works");

await db2.dropTable("async_test");
console.log("✓ All async stress tests pass in Bun");
```

**Success Criteria:**
- `bun run spike.ts` passes all operations without errors
- Search returns `_distance` field
- Filters with `where()` work correctly
- No NAPI binding crashes or segfaults
- Works on macOS ARM (dev machine)
- **Async patterns work correctly**: concurrent writes don't corrupt data, search during write returns consistent results, async operations complete fully (Bun NAPI-RS caveat: some modules exit early before async ops finish)
- `table.optimize()` runs without errors

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
- [ ] `plugin-v2/src/telemetry.ts` — CostLedger + ActivityLog (port from `backend/app/telemetry.py`)
- [ ] `plugin-v2/src/names.ts` — Name registry with JSON persistence (port from `backend/app/registry.py`)
- [ ] `plugin-v2/src/types.ts` — Zod schemas for memory records and API responses

**Port mapping:**

| Python Source | TypeScript Target | Lines | Notes |
|---------------|-------------------|-------|-------|
| `backend/app/config.py` (125 lines) | `config.ts` (~130 lines) | 1:1 | `os.environ.get()` → `process.env` |
| `backend/app/db.py` (15 lines) | `db.ts` (~50 lines) | 3x | Add connect + schema + table management |
| `backend/app/embedder.py` (32 lines) | `embedder.ts` (~30 lines) | 1:1 | `voyageai.Client` → `fetch()` |
| `backend/app/extractor.py` (443 lines) | `extractor.ts` (~200 lines) | 0.45x | `httpx` → `fetch()`, telemetry calls to `telemetry.ts` |
| `backend/app/prompts.py` (202 lines) | `prompts.ts` (~200 lines) | 1:1 | Template literals, zero logic |
| `backend/app/store.py` (266 lines) | `store.ts` (~250 lines) | 0.95x | Sync Python → async TypeScript |
| `backend/app/models.py` (60 lines) | `types.ts` (~80 lines) | 1.3x | PyArrow schema → Zod + TS types |
| `backend/app/telemetry.py` (280 lines) | `telemetry.ts` (~250 lines) | 0.9x | CostLedger + ActivityLog; `Bun.write()` for JSONL append |
| `backend/app/registry.py` (64 lines) | `names.ts` (~40 lines) | 0.6x | Name registry; JSON file with in-memory cache; `Bun.file()` / `Bun.write()` |

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
4. **Telemetry from day one** — CostLedger and ActivityLog port as core module; every `fetch()` to Voyage AI or extraction LLMs records tokens/cost to `~/.opencode-memory/costs.jsonl`
5. **Bun native APIs** — use `Bun.file()` / `Bun.write()` for file I/O, `Bun.JSONC.parse()` for config loading (replaces custom JSONC parser)

**`validateId()` implementation** — concrete input validation for LanceDB `where()` clauses:

```typescript
// store.ts — input validation before string interpolation in where() filters
const VALID_ID_PATTERN = /^[a-zA-Z0-9_:.\-]+$/;

function validateId(input: string): string {
	if (!VALID_ID_PATTERN.test(input)) {
		throw new Error(`Invalid ID format: "${input}" — only alphanumeric, underscore, colon, dot, hyphen allowed`);
	}
	return input;
}

// Usage in every query:
const safeUserId = validateId(userId);
const results = await table
	.search(queryVector)
	.where(`user_id = '${safeUserId}' AND superseded_by = ''`)
	.limit(20)
	.toArray();
```

**Extraction provider error handling:**

```typescript
// extractor.ts — fallback order + retry with exponential backoff
const PROVIDER_FALLBACK_ORDER = ["anthropic", "xai", "google"] as const;

interface RetryConfig {
	maxRetries: number;      // 3
	baseDelayMs: number;     // 500ms
	maxDelayMs: number;      // 10000ms
	jitter: number;          // 0.25 (±25%)
	timeoutMs: number;       // 30000ms per attempt
}

export async function callLlm(system: string, user: string): Promise<string> {
	const primary = config.EXTRACTION_PROVIDER;
	const fallbackOrder = [primary, ...PROVIDER_FALLBACK_ORDER.filter(p => p !== primary)];

	for (const provider of fallbackOrder) {
		try {
			return await callWithRetry(provider, system, user, {
				maxRetries: 3,
				baseDelayMs: 500,
				maxDelayMs: 10000,
				jitter: 0.25,
				timeoutMs: 30000,
			});
		} catch (error) {
			client.app.log({ body: {
				service: "opencode-memory",
				level: "warn",
				message: `Provider ${provider} failed after retries: ${error.message}`,
			}});
			// Try next provider in fallback order
		}
	}
	// All providers exhausted — log error, return empty (silent degradation)
	client.app.log({ body: {
		service: "opencode-memory",
		level: "error",
		message: "All extraction providers failed — skipping extraction for this turn",
	}});
	return "[]"; // Empty JSON array — no memories extracted
}
```

**Silent degradation rationale**: Extraction failure should never block the user's coding session. The memory system degrades gracefully — this turn's conversation won't be extracted, but the next turn will retry. Users see degradation via `memory({ mode: "activity" })` which shows error rates.

**LanceDB write conflict retry:**

```typescript
// store.ts — retry with exponential backoff for write conflicts
async function withRetry<T>(
	operation: () => Promise<T>,
	label: string,
	maxRetries: number = 5,
	baseMs: number = 50,
): Promise<T> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (attempt === maxRetries) throw error;
			const delay = baseMs * Math.pow(2, attempt) * (1 + Math.random() * 0.25);
			client.app.log({ body: {
				service: "opencode-memory",
				level: "warn",
				message: `${label} attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms`,
			}});
			await Bun.sleep(delay);
		}
	}
	throw new Error("unreachable");
}

// Usage:
await withRetry(() => table.add(records), "LanceDB write");
```

**Operation timeouts:**

| Operation | Timeout | Retry |
|-----------|---------|-------|
| Embed (Voyage AI) | 10s | 3 attempts |
| Extract (LLM) | 30s | 3 attempts + provider fallback |
| LanceDB write | 5s | 5 attempts (50ms base backoff) |
| LanceDB search | 10s | 3 attempts |
| LanceDB delete | 5s | 3 attempts |

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
- [ ] `plugin-v2/src/services/compaction.ts` — Copy, swap client calls. **NOTE**: This is NOT a minimal port — compaction.ts has deep filesystem coupling (see "Key Patterns for Porting" §3). Must preserve `injectHookMessage()` JSON format, `findNearestMessageWithFields()` directory scanning, and the 3-phase state machine. Fix `summarizedSessions` state leak bug (see §4).
- [ ] `plugin-v2/src/services/context.ts` — Copy unchanged
- [ ] `plugin-v2/src/services/tags.ts` — Copy unchanged
- [ ] `plugin-v2/src/services/jsonc.ts` — **Remove** — replaced by `Bun.JSONC.parse()`
- [ ] `plugin-v2/src/services/privacy.ts` — Copy, then **apply in all 4 ingestion paths** (memory tool add, auto-save, compaction, init — see "Key Patterns for Porting" §12)
- [ ] `plugin-v2/src/services/logger.ts` — **Rewrite** — replace `appendFileSync()` with `await Bun.write(path, data, { append: true })` (see §13)
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
**Criticality**: **Non-blocking stretch goal.** Phase 4 runs in parallel with Phase 3 (shares Phase 2 dependency) but is NOT on the critical path. Core memory functionality (Phases 1-3) ships without CLI. Phase 5 validation tests core plugin, not CLI. Phase 6 cutover does not depend on CLI being complete. Dashboard (Hono) is part of Phase 4 — also non-blocking.

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

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		user: { type: "string", short: "u" },
	},
});

const [command, ...args] = positionals;
const userId = values.user || "default";

await init();

switch (command) {
	case "list":
		const memories = await store.list(userId, { limit: 20 });
		for (const m of memories) {
			console.log(`[${m.type}] ${m.memory}`);
		}
		break;
	case "search":
		const results = await store.search(args.join(" "), userId);
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

**Distribution via bunx:**

The CLI is published as an npm package with a `bin` field:

```jsonc
// package.json
{
	"name": "opencode-memory",
	"bin": {
		"opencode-memory": "./dist/cli.js"
	},
	// ...
}
```

- `bunx opencode-memory <command>` auto-installs from npm to global cache and executes
- `bunx --bun opencode-memory` forces Bun runtime (in case package has Node shebang)
- Version pinning: `bunx opencode-memory@1.2.3 install`

**Future option — standalone binary via `bun build --compile`:**

```bash
# Creates a single executable bundling Bun runtime + all deps
bun build ./src/cli/index.ts --compile --outfile opencode-memory
# Result: ~/bin/opencode-memory (no Bun installation required to run)
```

This is a stretch goal for distribution — useful for users who don't have Bun installed but want the CLI. The compiled binary includes the Bun runtime, so it's self-contained (~50MB). Not needed for initial release since OpenCode already requires Bun.

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
# Update ~/.config/opencode/opencode.json to load plugin-v2/ instead of plugin/

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
| Concurrent writes from multiple OpenCode sessions | LanceDB supports concurrent readers + single writer via WAL; OpenCode typically runs one session at a time | Retry with exponential backoff: base 50ms, max 5 retries, ±25% jitter. See Phase 2 `withRetry()` implementation |
| Database corruption on crash | LanceDB uses Lance format with ACID transactions; data directory backed by append-only columnar files | No special handling needed; Lance format is crash-safe |
| API key configuration | Currently in Docker env vars; must work via OpenCode plugin config or env vars | Support both: `process.env.VOYAGE_API_KEY` and plugin config file |
| Privacy stripping gap — `<private>` tags not stripped in auto-save, compaction, or init paths | **Fix in rewrite**: apply `stripPrivateContent()` in all 4 ingestion paths before extraction/storage | See "Key Patterns for Porting" §12; wrap all `store.ingest()` entry points |
| NAPI-RS async completion in Bun | Bun ignores `async_hooks`; some NAPI-RS modules exit early before async ops complete | Phase 1 spike must stress-test concurrent writes, search-during-write, and optimize(); see spike test script |
| Compaction state leak (`summarizedSessions`) | Fix bug: `summarizedSessions.add()` called before `summarize()` — if it throws, session permanently skipped | Move `add()` after successful `summarize()` call; see "Key Patterns for Porting" §4 |

### Medium Priority — Should Resolve, Can Defer

| Edge Case | Proposed Approach | Deferral Risk |
|-----------|-------------------|---------------|
| Large memory databases (>10K memories) | LanceDB handles millions of rows; no index needed below 100K | Low — single-user system unlikely to exceed 10K |
| Voyage AI rate limits (2000 RPM) | Current usage ~10-30 RPM in dense sessions; no rate limiting needed | Low — see RPM analysis below |
| LanceDB disk usage growth | Lance format compacts automatically; monitor `~/.opencode-memory/` size | Low — text + 1024-dim vectors are small per record |
| Platform-specific NAPI binaries | `@lancedb/lancedb` publishes binaries for macOS ARM/Intel, Linux x64/ARM, Windows x64 | Medium — untested platforms may need build from source |

**Voyage AI RPM Analysis:**

Per-turn embedding calls breakdown:
- Turn 1: 1 embed (user query for semantic search) + 0-N embeds from extraction (batched, ~1 call)
- Turn 2+: 1 embed (per-turn refresh query) + 0-N from extraction
- Auto-save extraction: each extracted memory gets 1 embed call (typically 3-8 per extraction)
- Session summary: 1 embed call per summary

Realistic dense session (10 turns, 1 hour):
- Semantic searches: 10 turns × 1 embed = 10 calls
- Extractions: ~5 extraction events × 5 memories avg × 1 embed = 25 calls
- Summaries: 2 summaries × 1 embed = 2 calls
- **Total: ~37 calls/hour ≈ 0.6 RPM** (2000 RPM limit → 3,300x headroom)

Even extreme edge case (100 turns/hour with extraction every turn): ~500 calls/hour ≈ 8.3 RPM. Rate limiting is not needed.

### Low Priority — Acceptable to Leave Unresolved

| Edge Case | Why It's Acceptable |
|-----------|---------------------|
| No web dashboard initially | CLI + agent inline queries provide inspection; on-demand Hono dashboard is Phase 4 stretch goal |
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
| Dashboard lifecycle | On-demand (not always running) | Started via `memory({ mode: "dashboard" })`, stopped on session end; avoids wasting resources |
| Dashboard data access | Hybrid: agent inline queries + on-demand Hono server | Agent handles `stats`/`costs`/`activity` directly; Hono provides rich visual exploration when needed |
| Telemetry | Required core module (CostLedger + ActivityLog) | User actively uses cost tracking; every API call must record tokens/cost to JSONL file |
| File I/O | Bun native APIs (`Bun.file()`, `Bun.write()`) | Faster than Node.js `fs`; native to runtime; reduces dependencies |
| JSONC parsing | `Bun.JSONC.parse()` (built-in) | Eliminates custom `services/jsonc.ts` (85 lines); built into Bun runtime |
| Logging | `client.app.log()` via OpenCode SDK | Integrates with OpenCode's log viewer; replaces custom `logger.ts` |
| User notifications | `client.tui.showToast()` | Non-blocking toast for "saved N memories", "dashboard started", etc. |
| Search indexing | Start without; add FTS/vector indexes if needed | LanceDB linear scan is fast enough at <10K rows; indexes add complexity |
| Upsert pattern | `mergeInsert()` for contradiction superseding | Atomic replace instead of separate delete + insert; safer for data integrity |
| Package manager | pnpm for plugin-v2 | User preference; consistent with project standards |
| Indentation | Tabs | User preference; enforced across all new files |
| DB location | `~/.opencode-memory/lancedb/` | Follows XDG-like convention; outside project directory; shared across projects |
| Plugin folder name | `plugin-v2/` during development, rename to `plugin/` at cutover | Allows parallel development without breaking current system |
| Name registry persistence | Separate `names.json` file (not LanceDB) | Matches current backend pattern; simple key-value map doesn't benefit from vector storage; `Bun.file()`/`Bun.write()` with in-memory cache |
| Privacy stripping | Apply in all 4 ingestion paths (not just memory tool `add`) | Bug fix — current plugin only strips in one path; auto-save, compaction, and init paths leak private content |
| Table optimization schedule | `table.optimize()` on `session.idle` with 24h cooldown | Prevents unbounded Lance fragment file growth; `cleanupOlderThan: 7 days` removes old versions |
| Logger I/O | Async `Bun.write()` (replace sync `appendFileSync()`) | Sync I/O blocks event loop; `Bun.write()` is non-blocking and Bun-native |
| Hardcoded values | Centralize all 27 magic numbers in `config.ts` with env var overrides | Currently scattered across 8 files; centralization enables runtime tuning without code changes |
| JSONC parser | Remove `services/jsonc.ts`, use `Bun.JSONC.parse()` | Built into Bun runtime; eliminates 85 lines of custom code |
| Compaction state leak fix | Move `summarizedSessions.add()` after successful `summarize()` | Prevents sessions from being permanently skipped for summary extraction on error |

---

## CONFIDENCE CHECK

| Area | Score | Notes |
|------|-------|-------|
| LanceDB Node SDK API | 8/10 | Context7 docs confirm full API (search, FTS, hybrid, upsert, indexing); spike needed for Bun runtime compat only |
| Voyage AI fetch replacement | 10/10 | Trivial HTTP POST; well-documented endpoint; already tested conceptually |
| Extraction provider fetch | 9/10 | All three providers use OpenAI-compat or simple REST; backend code is the reference |
| Store logic port (dedup/aging) | 9/10 | Direct port from Python; logic is well-understood from analysis session |
| Plugin hook integration | 9/10 | Full plugin SDK documented; swap is mechanical BUT compaction.ts filesystem I/O is complex (see §3) |
| Compaction survival | 9/10 | Already implemented; but `injectHookMessage()` JSON format + directory scanning needs careful porting |
| Telemetry port | 9/10 | Direct port from Python telemetry.py; JSONL append with `Bun.write()` is trivial |
| CLI tooling | 9/10 | Simple `parseArgs` + store calls; bunx distribution well-documented |
| Dashboard (hybrid) | 9/10 | Agent inline queries are just formatted store reads; Hono on-demand server is ~100 lines |
| E2E/Benchmark validation | 9/10 | Existing test infrastructure; just point to new plugin |
| Bun native API usage | 10/10 | `Bun.file()`, `Bun.write()`, `Bun.JSONC.parse()`, `Bun.serve()` all well-documented and stable |
| OpenCode SDK integration | 9/10 | Full docs fetched (custom tools, TUI, events, logging); SDK types available |

**Overall: 9.2/10** — Deep codebase analysis revealed important complexity in compaction.ts (filesystem I/O, state machine) and auto-save.ts (streaming buffer, dual tracks) that lowers plugin integration confidence from 10 to 9. Privacy stripping gap identified as a bug to fix. LanceDB confidence remains at 8 pending Bun NAPI spike. All 27 hardcoded values inventoried. Name registry persistence documented.

---

## METRICS & MEASUREMENT

| Metric | How Measured | Baseline (Docker) | Target (Embedded) |
|--------|-------------|-------------------|-------------------|
| Setup time | Manual timing | ~2-5 min (Docker pull + compose up) | <10 seconds (`bunx opencode-memory install`) |
| Memory operation latency | Logging timestamps | ~5-15ms (HTTP round-trip) | <1ms (direct function call) |
| E2E scenario pass rate | `bun run test` | 11/11 | 11/11 |
| Benchmark score | `bun run bench run` | ~93.5% (latest) | ≥90% (no regression) |
| Lines of code (total) | `wc -l` | 2,920 (plugin) + 1,590 (backend) = 4,510 | ~2,450 (plugin-v2 only, includes telemetry) |
| Dependencies | Package count | Python + Node + Docker | Bun + @lancedb/lancedb + hono |
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

- **LanceDB Node SDK API** (Context7, deep): `connect()`, `createTable()`, `openTable()`, `search()`, `where()`, `limit()`, `toArray()`, plus advanced: FTS indexing (`Index.fts()`), hybrid search with reranking (`Reranker.rrf()`), `mergeInsert()` for upserts, IVF-PQ/HNSW-SQ vector indexes, BTree/Bitmap scalar indexes, `countRows()`, `update()`, `delete()`, `optimize()` (VACUUM: compaction + pruning + index optimization with `cleanupOlderThan`), versioning (`version()`, `listVersions()`, `checkout()`, `restore()`)
- **Voyage AI API**: `POST /v1/embeddings`, model `voyage-code-3`, 1024 dimensions, `fetch()` compatible, $0.22/1M tokens, 2000 RPM
- **Backend Python code**: All 11 files analyzed (1,590 lines), every function mapped to TypeScript equivalent
- **Plugin code**: All 13 files analyzed (2,920 lines), `client.ts` identified as only file needing replacement
- **Hono** (Context7): `serveStatic` from `hono/bun`, lightweight API routes, `Bun.serve({ fetch: app.fetch })`
- **Bun v1.3.9** (Perplexity, Feb 2026): `Bun.file()` / `Bun.write()`, `Bun.JSONC.parse()`, `Bun.serve()`, `Bun.$`, `bun build --compile`, NAPI support confirmed mature (bcrypt, argon2 working), `bunx --bun` flag, version pinning
- **OpenCode Plugin SDK** (official docs): `tool()` helper with Zod args, `client.tui.showToast()`, `client.app.log()`, `experimental.session.compacting` hook, event subscriptions (`session.created/idle/error`, `tool.execute.before/after`, `file.edited`), plugin dependency loading via `.opencode/package.json`
- **OpenCode SDK** (official docs): `createOpencode()` client, `session.create/list/get/prompt`, `find.text/files/symbols`, `file.read/status`, `event.subscribe()` SSE, structured output with `format: { type: "json_schema" }`
- **Deep codebase re-read** (round 2): 13 critical findings — assistantTextBuffer streaming pattern, SDK fetch fallback, compaction filesystem I/O, compaction state machine (3-phase with state leak bug), two parallel auto-save tracks, three extraction modes, enumeration query detection, module-level state caps (5 Maps), dedup vs insert side effects, scope detection heuristic, name registry (names.json), privacy stripping gap (bug), sync logger I/O. All 27 hardcoded values inventoried across plugin (13) and backend (14).
- **LanceDB + Bun compatibility** (Perplexity): NAPI-RS 90%+ Node test pass rate in Bun; warning on async operations (Bun ignores async_hooks, some modules exit early); no LanceDB-specific issues reported but thorough testing required

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
