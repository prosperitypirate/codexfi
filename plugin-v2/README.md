# plugin-v2 — Embedded Memory Plugin

Replaces the entire Docker/Python/Next.js backend stack with a single Bun package that embeds LanceDB, extraction, and embeddings directly into the OpenCode plugin runtime. Zero Docker, zero Python, zero separate processes.

## Why

The v1 architecture required users to run `docker compose up -d` to start a Python backend (FastAPI + LanceDB + Voyage AI) before the plugin could function. This created:

- A hard dependency on Docker for local development
- A separate Python process for memory extraction and storage
- HTTP round-trips between plugin and backend on every operation
- Deployment complexity (two processes, two languages, two sets of dependencies)

plugin-v2 eliminates all of this by embedding the entire backend into the plugin itself.

## Architecture

```
plugin-v2/
├── src/
│   ├── index.ts              — 997 lines, main plugin hooks (system.transform, chat.message, tool.memory, event)
│   ├── config.ts             — 184 lines, all 27+ centralized constants + validateId()
│   ├── types.ts              — 107 lines, Zod schemas for memory records
│   ├── prompts.ts            — 199 lines, all LLM prompt templates (1:1 port from backend/app/prompts.py)
│   ├── db.ts                 — 51 lines, LanceDB init/connect/refresh
│   ├── store.ts              — 630 lines, full CRUD + dedup + aging + contradiction + search with recency blending
│   ├── extractor.ts          — 442 lines, multi-provider LLM extraction (Anthropic/xAI/Google) + fallback + retry
│   ├── embedder.ts           — 69 lines, Voyage AI voyage-code-3 embedding via fetch
│   ├── retry.ts              — 109 lines, exponential backoff with jitter
│   ├── telemetry.ts          — 271 lines, CostLedger + ActivityLog
│   ├── names.ts              — 55 lines, name registry JSON persistence
│   ├── plugin-config.ts      — user-facing config from ~/.config/opencode/memory.jsonc
│   └── services/
│       ├── auto-save.ts      — background extraction after assistant turns
│       ├── compaction.ts     — context window compaction with memory injection
│       ├── context.ts        — [MEMORY] block formatting for system.transform
│       ├── privacy.ts        — <private> tag stripping
│       ├── tags.ts           — project/user tag computation from directory hash
│       ├── logger.ts         — async file logger (no sync I/O)
│       └── types/index.ts    — plugin-specific TS types
├── dist/                     — built output (bun run build)
├── package.json
└── tsconfig.json
```

### Data flow

```
User message → chat.message hook
  → auto-save extracts memories from last 8 messages (background)
    → extractor.ts: LLM call (Anthropic Haiku by default)
    → store.ts: embed → dedup → insert/update → aging → contradiction detection
  → store.search() for semantic refresh (turns 2+)
  → system.transform injects [MEMORY] block into context
```

### Key design decisions

1. **LanceDB embedded** — no server process, no Docker. Database lives at `~/.opencode-memory/lancedb/`.
2. **Voyage AI for embeddings** — `voyage-code-3` (1024 dims) via direct fetch, no SDK dependency.
3. **Multi-provider extraction** — Anthropic (default, most consistent), xAI (fastest), Google (native JSON mode). Automatic fallback chain with retry.
4. **All prompts are 1:1 ports** — SHA-256 verified identical to `backend/app/prompts.py`.

## Critical Discoveries & Fixes

### 1. LanceDB distance metric must be cosine, not L2 (68% → 85%)

**The single most impactful fix.** LanceDB JS defaults to L2 (Euclidean) distance. The Python backend uses `.metric("cosine")` on every search. Without `.distanceType("cosine")` on search calls, similarity scores are systematically lower (0.40 vs 0.58 for same query/memory pair), causing 62 of 200 benchmark questions to return zero results.

**Fix:** Add `.distanceType("cosine")` to all 3 search calls in `store.ts` (lines 49, 88, 398).

### 2. Chunk truncation must match backend (85% → 94.5%)

The Python backend stores the full truncated conversation (up to 8,000 chars) as a `chunk` field with each memory. The initial port truncated this to 400 chars — silently discarding 95% of source context. The answering LLM uses chunks for detail-dependent queries (exact config values, error strings, specific code patterns), so this 20x reduction in context caused a 7% benchmark regression.

**Fix:** `CHUNK_TRUNCATION` in `config.ts` set to `8_000` (matching `MAX_CONTENT_CHARS`). Display truncation in `context.ts` (400 chars for [MEMORY] block snippets) is separate and correct.

### 3. Double timeout on extraction calls

The retry wrapper (`EXTRACT_RETRY`) had a `timeoutMs: 30_000` that created a second timeout on top of the provider's own `AbortSignal.timeout(60_000)`. The effective timeout was `min(60s, 30s) = 30s`, silently killing extraction calls that the Python backend (60s timeout, no retry) would have completed.

**Fix:** Removed `timeoutMs` from `EXTRACT_RETRY`. Provider functions handle their own 60s timeout via `AbortSignal.timeout(LLM_TIMEOUT_MS)`.

### 4. LanceDB cross-process visibility requires table refresh

When `opencode serve` child process writes memories and another process reads them, the reader's cached table handle is stale. LanceDB caches table state internally.

**Fix:** Added `db.refresh()` (re-opens table) in `memory-api.ts` and `runner.ts` before reads.

### 5. `opencode run` exits before async plugin handlers complete

Auto-save extraction starts but the process dies mid-API-call. The extraction happens in a background event handler that outlives the CLI process.

**Fix:** Converted E2E test harness to use `opencode serve` mode with per-directory server cache. Server stays alive for extraction to complete; `waitForMemories()` polls until data appears.

### 6. Bun only auto-loads .env from CWD

When running the benchmark from project root, `benchmark/.env.local` (which has `JUDGE_MODEL`, `ANSWERING_MODEL`, `ANTHROPIC_API_KEY`) was not loaded. This caused embedded-v2 to use `claude-sonnet-4-5` instead of `claude-sonnet-4-6` as the answering model.

**Fix:** Explicit `.env.local` loader in `benchmark/src/index.ts` that resolves relative to `import.meta.url`, with override semantics (`.env.local` wins over root `.env`) and startup verification log.

### 7. LanceDB JS SDK prefilters by default

The Python backend uses `.where(filter, prefilter=True)` which filters BEFORE ANN search. Investigation revealed the JS SDK does this by default — `.postfilter()` is the explicit opt-out. No fix needed, but documented for future reference.

## Bug Fixes Applied (from design doc)

1. **Privacy stripping in all 4 ingestion paths** (design doc §12) — v1 only stripped `<private>` tags in some paths. v2 applies `stripPrivateContent()` before every call to `store.ingest()`: auto-save, session summary, compaction summary, and auto-init.

2. **Compaction state leak** (design doc §4) — v1 called `summarizedSessions.add(sessionID)` BEFORE `ctx.client.session.summarize()`. If `summarize()` threw, the session was permanently marked as summarized, and the summary was never captured. v2 moves `add()` to AFTER the successful call.

3. **Logger sync I/O** (design doc §13) — v1 used `appendFileSync` which blocks the event loop on every log write. v2 uses async `appendFile` from `node:fs/promises` with fire-and-forget `.catch(() => {})`.

## Benchmark Results

### embedded-v4 — 94.5% (189/200)

```
Category          embedded-v4    haiku-run1 (baseline)    Delta
──────────────────────────────────────────────────────────────────
Overall                94.5%              92.0%           +2.5%
tech-stack             100%               96%             +4.0%
architecture           100%               96%             +4.0%
session-continuity      96%               96%              0.0%
preference             100%               92%             +8.0%
error-solution          92%              100%             -8.0%
knowledge-update        96%               92%             +4.0%
cross-session-synth     72%               68%             +4.0%
abstention             100%               96%             +4.0%
```

**Extractor:** `claude-haiku-4-5` · **Judge/Answer:** `claude-sonnet-4-6` · **Embeddings:** `voyage-code-3` · **K=20 retrieval**

### Progression

| Run | Score | What changed |
|---|---|---|
| embedded-v1 | 68% | Initial port — L2 distance (wrong metric) |
| embedded-v2 | 85% | Fixed: `.distanceType("cosine")` on all searches |
| embedded-v3 | 85% | Fixed: benchmark model to `claude-sonnet-4-6` (was using 4-5 due to `.env.local` not loading) |
| **embedded-v4** | **94.5%** | Fixed: `CHUNK_TRUNCATION` 400→8000, removed double timeout on extraction |

## E2E Test Results

11/12 scenarios pass. Scenario 09 has a known K=20 margin issue (8/10 assertions under 41 memories — not a plugin bug).

```
PASS  01  Cross-Session Memory Continuity
PASS  02  README-Based Project-Brief Seeding
PASS  03  Transcript Noise Guard
PASS  04  Project Brief Always Present
PASS  05  Memory Aging
PASS  06  Existing Codebase Auto-Init
PASS  07  Enumeration Hybrid Retrieval
PASS  08  Cross-Synthesis (isWideSynthesis)
WARN  09  maxMemories=20 Under Load            ← 8/10 assertions, K=20 margin
PASS  10  Knowledge Update / Superseded
PASS  11  System Prompt Memory Injection
PASS  12  Multi-Turn Per-Turn Refresh
```

## Building

```bash
cd plugin-v2
bun install
bun run build    # outputs to dist/index.js
```

## Configuration

Set `VOYAGE_API_KEY` in your environment (required for embeddings). Extraction uses `ANTHROPIC_API_KEY` by default (can switch to xAI or Google via `EXTRACTION_PROVIDER`).

Plugin config lives at `~/.config/opencode/memory.jsonc` (optional, all defaults are sane).

Point OpenCode to the built plugin:
```json
{
  "plugin": ["file:///path/to/opencode-memory/plugin-v2/dist/index.js"]
}
```

## Dependencies

- `@lancedb/lancedb` — embedded vector database (NAPI bindings, works in Bun 1.2.19+)
- `zod` — runtime validation for memory record schemas
- `@opencode-ai/plugin` — OpenCode plugin SDK types
- `@opencode-ai/sdk` — OpenCode SDK for client interactions
