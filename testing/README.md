# codexfi Test Suite

Tests for the codexfi **Claude Code plugin**: the hook handlers, background worker,
MCP server, transcript reader, SQLite vector store, embedder and LLM plumbing.

Everything runs offline. No test calls the network, the real `claude` CLI, the
Anthropic API, or downloads an embedding model, and no test reads or writes your
real `~/.codexfi`.

```bash
cd testing
bun install          # once
bun test src/unit/ src/integration/      # = bun run test   (~4 s)
bun test src/stress/                     # = bun run test:stress (~1 s)
bun run typecheck
```

`src/integration/plugin-load.test.ts` runs the **built bundle**. Rebuild it after
changing plugin source: `cd plugin && npm run build` (or `bun run test:bundle`).

## Tiers

| Tier | Tests | Command | What it covers |
|------|-------|---------|----------------|
| Unit | 243 | `bun test src/unit/` | Pure logic + small on-disk state, in-process |
| Integration | 150 (+1 todo) | `bun test src/integration/` | Hooks, worker, MCP, store, embedder, context against a temp SQLite DB; the shipped bundle under Bun and Node |
| Stress | 3 | `bun test src/stress/` | 15–20 OS processes hammering one SQLite WAL database |

## Sandbox (how isolation works)

Plugin modules read their environment **at import time** (`config.ts` captures
`CODEXFI_DATA_DIR`, `plugin-config.ts` reads `~/.codexfi/codexfi.jsonc`), and
`bun test` shares one module cache across all files. So
[`src/helpers/preload.ts`](src/helpers/preload.ts) builds a sandbox before any
plugin module loads. It runs through `bunfig.toml` (`[test].preload`) **and** is the
first import of every test file, so it also applies when `bun test` is started
from another directory.

| What | How |
|------|-----|
| Home dir | `node:os` `homedir()` is mocked to a temp dir (Bun ignores runtime `HOME` changes); `HOME` is set too, so child processes inherit it |
| Data dir | `CODEXFI_DATA_DIR` → temp dir (store, queue, sessions, logs, costs) |
| Worker | `CODEXFI_NO_WORKER=1`: hooks never spawn a detached worker; tests call `runWorker()` in-process |
| LLM | `plugin/src/llm.ts` is mocked: `callLlm` / `callLlmStrict` → [`helpers/fake-llm.ts`](src/helpers/fake-llm.ts) (`setLlmHandler`, `llmCalls`). All other llm.ts exports stay real |
| `claude` binary | `CODEXFI_CLAUDE_BIN` → a shell stub that logs argv/stdin and prints canned JSON. Even an un-mocked call can't reach the real CLI |
| Embeddings | `@huggingface/transformers` is mocked with a deterministic bag-of-words model ([`helpers/mock-embedder.ts`](src/helpers/mock-embedder.ts)): shared words → similar, unrelated → ~0, identical → 1 |
| Keys / Claude env | `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_PROJECT_DIR`, `CODEXFI_DISABLE` are unset |

`bun test` emits no exit event, so a run can't delete its own sandbox
(`$TMPDIR/codexfi-test-*`). Each run removes sandboxes older than one hour instead.

### Helpers

| File | Purpose |
|------|---------|
| `helpers/preload.ts` | Sandbox + module mocks (above) |
| `helpers/test-env.ts` | `makeTempDir`, `resetRuntimeState` (queue/sessions/logs/lock), `captureStdout` (patches `process.stdout.write` **and** `console.log/info/debug`, since Bun's console bypasses stdout.write), `writeTranscript`, `markEmbedderReady` / `markEmbedderMissing` (fake model weights on disk for `isEmbedderReady()`) |
| `helpers/temp-db.ts` | `setupTempDb` / `teardownTempDb`: a fresh SQLite store per suite |
| `helpers/fake-llm.ts` | Controllable LLM fake + `realLlm` (the real exports, used against the stub binary) |
| `helpers/mock-embedder.ts` | `bowVector`, `deterministicVector`, `cosine`, `MOCK_DIMS`, the fake transformers module |
| `helpers/mock-fetch.ts` | Route-based `fetch` mock (Voyage / Anthropic response builders) |

Writing a new test:

```ts
import "../helpers/preload.js"; // ALWAYS first, before any plugin import
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setLlmHandler, resetFakeLlm } from "../helpers/fake-llm.js";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";
import { EXTRACTION_SYSTEM } from "../../../plugin/src/prompts.js";

beforeAll(setupTempDb);
afterAll(teardownTempDb);

test("extracts", async () => {
	setLlmHandler((system) => (system === EXTRACTION_SYSTEM ? '[{"memory":"x","type":"tech-context"}]' : "[]"));
	// ...
});
```

Gotchas:
- Thresholds are model-specific (`embedder.ts` `activeThresholds()`). Assert relative
  to it, not to hard-coded similarities.
- Module mocks are process-wide. Don't `mock.module()` plugin modules in individual
  files; extend the preload instead.
- The worker waits until a job is 1.5 s old before reading its transcript (Claude Code
  flushes final lines late). `worker.test.ts` back-dates `createdAt` to skip that.
- Some suites are sequential by design (`worker.test.ts` turn jobs, `db.test.ts`), so
  `bun test --randomize` is not supported. File order doesn't matter.
- Seeded rows need `embed_model: currentEmbedModelId()`: vector search ignores rows
  from other embedding models.

## What each file covers

### Unit (`src/unit/`)

| File | Covers |
|------|--------|
| `llm.test.ts` | `buildClaudeArgs` (`--safe-mode`, `--tools ""`, `--setting-sources ""`, `--no-session-persistence`, `--system-prompt`, no `--bare`); `findClaudeBinary` order (`CODEXFI_CLAUDE_BIN` → `CLAUDE_CODE_EXECPATH` → PATH, cache reset); `resolveBackend`; real CLI path against the stub (stdin, argv, `CODEXFI_DISABLE=1`, usage parsing) |
| `transcript.test.ts` | `recordsToMessages` (system-reminder stripping, queued_command, tool_use one-liners, tool_result errors only, thinking/hook attachments/sidechains/meta skipped, same-role merging, caps); `readTranscriptFrom` (byte offsets, partial trailing line, shrunk-file reset, corrupt lines, UTF-8); `windowMessages` |
| `state.test.ts` | Session load/save (atomic, unsafe ids, 2,000-id cap, prune); job queue order/remove; worker lock (acquire/release, stale takeover, live foreign lock); `logLine` (format, 2 MB rotation, never throws) |
| `runtime.test.ts` | `fitToLimit` (whole bullets, continuation lines, empty headers, under 10k); `isDisabled` (`CODEXFI_DISABLE`, `excludePaths` segment-aware) |
| `memory-bank.test.ts` | Bank detection in cwd / parents, `maxDepth`, ignores dirs without core files, `lastSavedAt` |
| `config.test.ts` | `validateId`, constants, sandbox values; env vs `codexfi.jsonc` precedence in fresh processes (incl. API-key env fallback) |
| `plugin-config.test.ts` | Config path, `writeApiKeys` (merging, defaults, ASCII, no `extractionProvider`), JSONC loading (comments, `excludePaths` filtering, invalid regexes, malformed file) |
| `telemetry.test.ts` | `recordLlm` / `recordEmbedding` buckets + totals, persistence, legacy `costs.json` normalisation, ActivityLog ring buffer |
| `auto-init.test.ts` | `INIT_FILES`, `collectInitContent` (per-file/total caps, git log, `<private>` stripping) |
| `context.test.ts` | `formatContextForPrompt` sections, display threshold, Recent Sessions, per-type caps, cross-section dedup |
| `vector-store.test.ts` | Cosine, CRUD, filters, BLOB round-trip, lifecycle |
| `names`, `retry`, `prompts`, `ingest-result-schema` | Name registry, retry/backoff, prompt guards, `IngestResult` schema |

### Integration (`src/integration/`)

| File | Covers |
|------|--------|
| `hooks.test.ts` | `runHook`: stop / pre-compact / session-end enqueue; `agent_id` and `CODEXFI_DISABLE` no-ops; session-start (resume emits nothing, baseline + injected ids, auto-init, warmup when weights missing, < 10k output); user-prompt-submit (once-per-session injection, remember note, short prompts) |
| `worker.test.ts` | `runWorker` with fake LLM: turn extraction from a fixture transcript (privacy, hook-attachment exclusion), offset advance, repeat job stores nothing, incremental next turn, tiny exchanges, summary job, init job, lock, settle delay |
| `mcp.test.ts` | `handleRpc`: initialize (instructions), tools/list (4 tools), ping, -32601 / -32602, notifications; memory_add ↔ memory_search round trip, dedup update, contradiction only with candidates, scopes, `<private>`, list/forget, `excludePaths` |
| `claude-context.test.ts` | `buildSessionContext` (structured sections, memory-bank mode keeps only newer sessions, `memoryBank: "off"`); `buildPromptContext` (relevance, already-injected exclusion, enumeration extras) |
| `store-embeddings.test.ts` | `embed_model` migration of a pre-1.0 DB, cross-model search isolation, `addMemory` (dedup refreshes vector, contradiction supersede), `countStaleEmbeddings` / `reembedStale`, `ingest`, progress / active-context / session-summary aging |
| `embedder.test.ts` | Local path with the mocked model: model selection, prefixes, input cap, query memoisation, cache dir, `isEmbedderReady`, `activeThresholds` |
| `plugin-load.test.ts` | `dist/codexfi.js` under **Bun and Node** from an external cwd: `--version`, `hook stop` (enqueue, silent, fast), garbage stdin, `CODEXFI_DISABLE`, resume; MCP stdio initialize/tools/list; `run.sh`; `hooks.json` / `plugin.json` wiring; no static `bun:` imports, transformers external |
| `store-node-runtime.test.ts` | Store + telemetry + names bundled for Node and run under `node:sqlite` (byte-identical vector BLOBs, `embed_model`, `costs.json` backends) |
| `store.test.ts`, `db.test.ts`, `active-context-aging.test.ts` | Store CRUD/search/list/profile, db adapter, singleton aging through the real `addMemory` path |

### Stress (`src/stress/`)

| Test | Processes | Operations | Validates |
|------|-----------|-----------|-----------|
| `concurrent-writes` | 20 writers | 400 INSERTs | Zero data loss, unique IDs, `PRAGMA integrity_check = ok` |
| `concurrent-reads` | 20 readers | 400 searches over 500 seeded rows | All searches return results, DB intact |
| `concurrent-mixed` | 15 writers + 15 readers | 300 writes + 300 reads | Zero data loss, no `SQLITE_BUSY` |

Each spawns real OS processes on the same `.db` file, the same pattern as concurrent
hook / worker / MCP processes.

## Known engine issues pinned by `test.todo`

Run `bun test --todo` to execute them (they fail until fixed):

- **MCP stdout pollution**: `store.ts` `ageActiveContext()` logs with `console.log`.
  In the MCP server process stdout is the JSON-RPC channel, so `memory_add` with
  type `active-context` writes a non-protocol line into the stream
  (`mcp.test.ts`).

## Removed

The OpenCode-era E2E harness (`src/e2e/`, `opencode run` / `opencode serve`
scenarios) was deleted with the OpenCode plugin entry, along with the tests for
removed modules (`disabled-warning`, `directory-tree`, `fresh-project-hint`,
`checkConfigFile`, xAI/Google providers, `extractionProvider`, the old
`record{Xai,Google,Anthropic,Voyage}` ledger API). Old E2E run outputs remain in
`results/` and `src/results/` for history.
