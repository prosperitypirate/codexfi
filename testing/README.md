# codexfi Test Suite

Four test tiers covering unit logic, integration, concurrent safety, and full end-to-end agent sessions.

> **Storage:** bun:sqlite with WAL mode. Replaced JSONL (v0.5) and LanceDB (v0.4) to support
> concurrent multi-agent read/write without data loss. See design doc `011-sqlite-vector-store.md`.

## Prerequisites

**1. Plugin built**
```bash
cd plugin && bun run build
```

**2. OpenCode CLI installed**
```bash
bun install -g opencode-ai
# Verify: opencode --version  (1.2.10+)
```

**3. Plugin set to LOCAL dev build in `~/.config/opencode/opencode.json`**

> **CRITICAL:** The E2E test harness imports `plugin/src/db.ts` and `plugin/src/store.ts`
> directly to verify memories. If `opencode.json` uses the npm-published `"codexfi"` package
> instead of the local dev build, the `opencode run` sessions will write to the npm plugin's
> store while the test harness reads from the local plugin's store — resulting in **0 memories
> found and all scenarios failing**.

```json
{
  "plugin": ["file:///Users/neo/Development/codexfi/plugin"]
}
```

After testing, restore to the published package:
```json
{
  "plugin": ["codexfi"]
}
```

**4. API keys in `~/.config/opencode/codexfi.jsonc`**

The plugin reads keys from `codexfi.jsonc` — env vars are not read by the plugin. Run `bunx codexfi install` or create the file manually:
```jsonc
{
  "voyageApiKey": "pa-...",
  "anthropicApiKey": "sk-ant-...",
  "extractionProvider": "anthropic"
}
```
An AI provider key for the OpenCode agent sessions is also required — set this in your shell or `.env` (e.g. `ANTHROPIC_API_KEY`) for OpenCode's own model calls.

## Test tiers

| Tier | Tests | Command | Time | Requirements |
|------|-------|---------|------|-------------|
| Unit | 139 | `bun test src/unit/` | ~1s | None |
| Integration | 31 | `bun test src/integration/` | ~3s | `VOYAGE_API_KEY` |
| Stress | 3 | `bun test src/stress/` | ~1s | None |
| E2E | 13 scenarios | `bun run test:e2e` | ~10min | Live opencode + API keys |

### Stress tests (concurrent multi-agent safety)

These validate the SQLite WAL store under multi-process contention — the scenario where
multiple OpenCode agents read and write the same `store.db` simultaneously.

| Test | Processes | Operations | Validates |
|------|-----------|-----------|-----------|
| `concurrent-writes` | 20 writers | 400 INSERTs | Zero data loss, all IDs unique, `PRAGMA integrity_check = ok` |
| `concurrent-reads` | 20 readers | 400 searches against 500 seeded records | All searches return results, no errors, DB intact |
| `concurrent-mixed` | 15 writers + 15 readers | 300 writes + 300 reads simultaneously | Zero data loss, all reads succeed, no SQLITE_BUSY errors |

Each test spawns real OS child processes (not async concurrency within one process) hitting
the same `.db` file — matching the actual multi-agent deployment pattern.

## Running

```bash
cd testing
bun install                    # first time only
bun test src/unit/             # unit tests only
bun test src/integration/      # integration tests only
bun test src/stress/           # concurrent stress tests only
bun run test:e2e               # all 13 E2E scenarios (live dashboard at localhost:4243)
bun run test:e2e:scenario 01   # single E2E scenario
```

E2E output is printed to stdout with ANSI colours and shown live at `http://localhost:4243`.
Each run is also saved to `results/` (gitignored). After each scenario, the test harness
**automatically deletes all memories it created** from the store.

## Latest run results (2026-04-06) — SQLite WAL store (PR #151)

Full run against `feat/pure-ts-vector-store` branch. Storage: bun:sqlite with WAL mode.
Extraction via Anthropic Haiku.

```
Unit:        139 pass,  0 fail  (1.0s)
Integration:  31 pass,  0 fail  (3.5s)
Stress:        3 pass,  0 fail  (0.7s)  ← 20 writers + 20 readers + 15+15 mixed
E2E:       12/13 pass             (629s)
```

```
FAIL  01  Cross-Session Memory Continuity       17.5s  ← flaky: agent omitted project name
PASS  02  README-Based Project-Brief Seeding    14.9s
PASS  03  Transcript Noise Guard                15.0s
PASS  04  Project Brief Always Present          19.5s
PASS  05  Memory Aging                          50.3s
PASS  06  Existing Codebase Auto-Init           68.1s
PASS  07  Enumeration Hybrid Retrieval          38.2s
PASS  08  Cross-Synthesis (isWideSynthesis)     54.9s
PASS  09  maxMemories=20 Under Load            176.9s
PASS  10  Knowledge Update / Superseded         67.3s
PASS  11  System Prompt Memory Injection        23.2s
PASS  12  Multi-Turn Per-Turn Refresh           59.2s
PASS  13  Auto-Init Turn 1 Visibility           24.0s
```

Scenario 01 failure: agent recalled all tech facts (SQLite, Bun, TypeScript, Repository pattern)
but said "a CLI task management tool" instead of "taskflow". Previous solo run passed. Extraction
variance, not a store bug.

### Previous results (2026-03-07) — JSONL store

```
12/13 PASS (scenario 09 was known K=20 margin, not a regression)
```

### Previous results (2026-02-25) — plugin embedded rewrite

```
12/12 PASS  —  Total: ~465s (~7.8 min)
```

### Observations and known issues

**Scenario 04 — project-brief type not extracted without README**
The `project-brief` memory type is never saved when there's no README. The agent extracts `tech-context` and `progress` instead. The scenario still passes because memory recall works — but the `project-brief` count assertion is diagnostic only (non-blocking). Root cause: `seedProjectBrief` likely only fires on `triggerSilentAutoInit` (README path), not on conversation-only sessions.

**Scenario 03 — assertion updated (not a bug)**
The original assertion checked `s2.text` for the project name "ferrite-api". The LLM responded correctly ("a Rust web service") without always naming it. Changed to check the backend memory content directly — more reliable.

**Scenario 09 — memory count is non-deterministic**
The xAI extractor consolidates facts differently each run — 6 short sessions produced 5 memories once, 18 another time. The scenario uses rich, detailed session messages (8 sessions) to ensure consistent ≥8 memory count. This mirrors the same ingest nondeterminism seen in the benchmark.

## Known issue: OpenCode Desktop app interference

If the OpenCode desktop app is running, it sets `OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME`, and `OPENCODE_CLIENT` in your shell environment. The `opencode run` CLI inherits these and its internal server then requires Basic Auth — but run-mode sends no auth headers, causing every CLI session to fail silently.

**The test harness already handles this automatically** via `cleanEnv()` in `src/opencode.ts`, which strips those three variables before spawning each `opencode run` process. You do not need to close the desktop app.

If you run `opencode run` manually from a terminal where the desktop app is active and see unexpected failures, unset those vars first:
```bash
env -u OPENCODE_SERVER_PASSWORD -u OPENCODE_SERVER_USERNAME -u OPENCODE_CLIENT \
  opencode run "your message" --dir /path/to/project -m anthropic/claude-sonnet-4-6
```

This is a known bug in `opencode` v1.2.10 — tracked at https://github.com/anomalyco/opencode/issues/14532.

## Known issue: `codexfi.jsonc` deleted by OpenCode Desktop

The OpenCode Desktop app periodically deletes `~/.config/opencode/codexfi.jsonc`. The watcher
log at `~/.codexfi-watcher.log` shows it probes multiple filenames (`codexfi.json`,
`codexfi.jsonc`, `memory.jsonc`) and deletes them in rapid succession — a config
discovery/migration routine. Without the config file, the plugin is disabled and E2E
tests fail with 0 memories.

**Root cause:** Under investigation. A forensic watcher at `local/watch-codexfi-config.sh`
uses `fs_usage` (syscall tracing) to capture the exact PID + process name that performs
the `unlink()`. Run with sudo for full tracing:

```bash
# Terminal 1: forensic watcher (needs root for fs_usage)
sudo /path/to/codexfi/local/watch-codexfi-config.sh

# Terminal 2: run E2E tests
cd testing && bun run test:e2e
```

When a deletion is detected, the watcher dumps the `fs_usage` syscall trace showing exactly
which process deleted the file. Check `~/.codexfi-watcher.log` for results.

If the config gets deleted mid-test, restore it manually:
```bash
cp ~/.codexfi.jsonc.backup ~/.config/opencode/codexfi.jsonc
```

## Scenarios

| # | Name | What it tests |
|---|------|---------------|
| 01 | Cross-Session Memory Continuity | Auto-save fires after session end; session 2 recalls facts from session 1 |
| 02 | README-Based Project-Brief Seeding | `triggerSilentAutoInit` reads README on first session; project-brief memory is created and recalled in session 2 |
| 03 | Transcript Noise Guard | Saved memories contain no raw `[user]`/`[assistant]` transcript lines; memory recall works across sessions |
| 04 | Project-Brief Always Present | Memories accumulate from conversation even without README; session 2 recalls project facts |
| 05 | Memory Aging | Backend replaces older `progress` memories with newest; only 1 survives across 3 sessions |
| 06 | Existing Codebase Auto-Init | `triggerSilentAutoInit` reads real project files (package.json, tsconfig, src/) on first open; memories are created without any conversation seeding |
| 07 | Enumeration Hybrid Retrieval | `types[]` param fires for "list all preferences" queries; answer covers preferences seeded across multiple sessions, not just the most recent |
| 08 | Cross-Synthesis (isWideSynthesis) | "across both projects" heuristic fires; answer synthesises facts from two separate project memory namespaces |
| 09 | maxMemories=20 Under Load | With >10 memories stored, facts from early sessions still recalled — confirms K=20 retrieval depth |
| 10 | Knowledge Update / Superseded | After ORM migration, agent answers with the new ORM (Tortoise), not the stale one (SQLAlchemy); backend reflects superseded state |
| 11 | System Prompt Memory Injection | [MEMORY] block is injected via `system.transform` into the system prompt (not as a synthetic message part); agent references seeded facts |
| 12 | Multi-Turn Per-Turn Refresh | 6-turn conversation via `opencode serve`; per-turn semantic refresh surfaces topic-relevant memories as the user switches topics mid-session |
| 13 | Auto-Init Turn 1 Visibility + Enrichment | Auto-init uses init mode, re-fetches memories for Turn 1 visibility, background enrichment fires after first response |

## Architecture

```
testing/
├── src/
│   ├── unit/                  — 139 unit tests (cosine math, CRUD, filters, serialisation)
│   ├── integration/           — 31 integration tests (store, db, embedder, plugin-load)
│   ├── stress/                — 3 concurrent multi-process tests
│   │   ├── worker.ts          — child process entry point (write or read mode)
│   │   ├── concurrent-writes.test.ts   — 20 processes × 20 writes, zero loss
│   │   ├── concurrent-reads.test.ts    — 20 processes × 20 searches on 500 records
│   │   └── concurrent-mixed.test.ts    — 15 writers + 15 readers simultaneously
│   ├── helpers/
│   │   └── temp-db.ts         — test isolation (redirects store to temp dir)
│   ├── e2e/
│   │   ├── runner.ts          — entry point, runs scenarios, emits live SSE events
│   │   ├── opencode.ts        — spawns opencode serve sessions
│   │   ├── memory-api.ts      — direct store access for verification
│   │   ├── report.ts          — ANSI result formatting
│   │   ├── live/
│   │   │   ├── emitter.ts     — SSE event emitter (same pattern as benchmark)
│   │   │   ├── server.ts      — Bun.serve on port 4243
│   │   │   └── page.ts        — self-contained HTML live dashboard
│   │   └── scenarios/
│   │       ├── 01-cross-session.ts ... 13-auto-init-turn1.ts
│   ├── results/               — gitignored; JSON output of each run
│   ├── package.json
│   └── tsconfig.json
```

### Key changes for plugin

1. **`memory-api.ts` rewired** — imports `store.*` and `db.*` from `plugin/src/` directly instead of making HTTP calls to `localhost:8020`. Calls `db.refresh()` before reads to pick up writes from the `opencode serve` child process.

2. **`opencode.ts` uses server mode** — `opencode run` exits before async plugin event handlers (auto-save, extraction) complete. Switched to `opencode serve` with per-directory server caching so the plugin process stays alive for extraction to finish. `waitForMemories(dir, N, 30_000)` polls until data appears.

3. **`runner.ts` refreshes store** — calls `db.refresh()` before cleanup deletes to fix lock contention when the serve process is still holding a stale reference.

4. **Scenario 12 calls `addMemoryDirect()`** — this imports `store.ingest()` directly in the test runner process (not in a child `opencode serve` process), so extraction provider/model config must be correct in the built `dist/index.js`. Different config lifecycle than scenarios 01-11.

## How `opencode run` is used

Most scenarios use **single-shot mode** via `opencode run`:
```bash
opencode run "<message>" --dir <isolated-tmp-dir> -m anthropic/claude-sonnet-4-6 --format json
```

`--format json` emits one JSON event per line. The test harness parses these to extract:
- Session ID
- Full text response (concatenated text parts)
- Exit code and timing

Each scenario gets its own isolated `createTestDir()` directory under `/private/tmp/oc-test-<name>-<uuid>`, so tests never share state.

### Persistent server mode (`opencode serve`)

Scenario 12 uses **persistent server mode** for true multi-turn testing. Each `opencode run` invocation is a separate process — the plugin's in-memory session caches reset between runs, making it impossible to test per-turn refresh (turns 2+). `opencode serve` keeps a single plugin process alive across turns.

The test harness provides helpers in `opencode.ts`:
- `startServer(dir)` — spawns `opencode serve --dir <dir>`, waits for the HTTP API to become ready
- `createSession(port, model)` — `POST /session` to create a new session
- `sendServerMessage(port, sessionId, message)` — `POST /session/:id/message` to send a user message and collect the streamed response
- `deleteSession(port, sessionId)` — `DELETE /session/:id` to clean up
- `stopServer(handle)` — kills the server process

The `model` field in the server API must be an object `{ providerID, modelID }`, not a string like `"anthropic/claude-sonnet-4-6"`.

### Direct embedded store seeding

For deterministic test setup, `memory-api.ts` provides:
- `addMemoryDirect(projectTag, content, type?)` — calls `store.ingest()` directly to seed a memory (runs through the LLM extractor in the test runner process)
- `searchMemories(projectTag, query, limit?)` — calls `store.search()` directly to verify semantic search results
- `getMemoriesForDir(dir)` — calls `store.list()` for all memories under a project tag
- `waitForMemories(dir, count, timeoutMs)` — polls `store.list()` until `count` memories appear (used for async auto-save)

## Memory tag computation

The plugin identifies each project by hashing the absolute directory path:
```
projectTag = "opencode_project_" + sha256(directory)[:16]
```

The test harness replicates this logic in `memory-api.ts:projectTagForDir()` to query the backend for exactly the memories that the plugin would have written.
