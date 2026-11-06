# codexfi — plugin internals

This directory **is** the Claude Code plugin (`codexfi@codexfi`). It is installed straight from git by Claude Code, so the built bundle `dist/codexfi.js` is committed.

```
plugin/
├── .claude-plugin/plugin.json   manifest (+ MCP server declaration)
├── hooks/hooks.json             SessionStart · UserPromptSubmit · Stop · PreCompact · SessionEnd
├── scripts/run.sh               runtime launcher (bun → node ≥ 22.5 → silent no-op)
├── dist/codexfi.js              single-file bundle (CLI + hooks + worker + MCP)
├── package.json / package-lock.json   runtime dep: @huggingface/transformers (auto-installed by Claude Code)
└── src/
    ├── claude/       Claude Code integration
    │   ├── hooks.ts        hook handlers (read hooks inject, write hooks enqueue)
    │   ├── context.ts      SessionStart block + per-prompt block (Memory-Bank aware, per-session dedup)
    │   ├── transcript.ts   incremental JSONL transcript reader (exactly-once byte cursor)
    │   ├── worker.ts       detached single-instance job worker (extraction, summaries, auto-init)
    │   ├── state.ts        sessions/, queue/, worker.lock, logs/ under ~/.codexfi
    │   ├── mcp.ts          stdio MCP server: memory_search / memory_add / memory_list / memory_forget
    │   └── runtime.ts      init, tags, disable switches, 10k-cap fitting
    ├── llm.ts        Claude via `claude -p --safe-mode` (default) or Anthropic API
    ├── embedder.ts   local, on-device ONNX embeddings only; model-specific thresholds
    ├── extractor.ts  extraction / summary / contradiction / condensation prompts → JSON
    ├── store.ts      ingest, addMemory, dedup, supersede, aging, search, re-embed migration
    ├── store/        SQLite (bun:sqlite | node:sqlite) vector store, WAL, migrations
    ├── services/     memory-bank detection, query intent, [MEMORY] formatter, privacy, tags
    ├── cli/          `codexfi status | list | search | stats | export | forget | dashboard | install`
    └── dashboard/    local web dashboard
```

## Lifecycle

| Claude Code event | codexfi | Budget |
|---|---|---|
| `SessionStart` (startup / clear / compact) | structured `[MEMORY]` block; enqueue auto-init for brand-new projects | ~110 ms |
| `SessionStart` (resume) | nothing — earlier context is replayed from the transcript | — |
| `UserPromptSubmit` | embed prompt locally, search project + user scope, inject memories not yet shown this session | ~250 ms |
| `Stop` | enqueue a turn job, spawn worker if none | ~90 ms |
| `PreCompact`, `SessionEnd` | enqueue a session-summary job | ~90 ms |
| worker (background) | read new transcript bytes → extract with Haiku → embed → dedup/supersede → store; re-embed rows from older embedding models | seconds |

Every hook fails silent. Hook traffic from subagents (`agent_id`) is ignored. `CODEXFI_DISABLE=1` (set on codexfi's own `claude -p` children) makes every entrypoint a no-op, which — together with `--safe-mode` — prevents recursion.

## Memory model

Typed memories (`project-brief`, `architecture`, `architecture-pattern`, `tech-context`, `project-config`, `product-context`, `progress`, `active-context`, `session-summary`, `error-solution`, `preference`, `learned-pattern`) stored per **project** (directory hash) or **user** (git email hash; cross-project). Rules:

- **Dedup**: a new fact within the model's dedup distance of an existing one updates it in place (text, vector, type).
- **Supersede**: candidates near a new fact are checked by the LLM; stale ones are marked `superseded_by`.
- **Aging**: `progress` and `active-context` are singletons; `session-summary` keeps the newest 3 and condenses older ones into `learned-pattern`.
- **Embedding model tag**: each row records `embed_model`; only same-model vectors are ever compared.

## Configuration

`~/.codexfi/codexfi.jsonc` (all optional) — see the root [README](../README.md#configuration-optional). Environment overrides: `CODEXFI_DATA_DIR`, `CODEXFI_LLM_BACKEND`, `CODEXFI_LLM_MODEL`, `CODEXFI_EMBEDDING_PROVIDER`, `CODEXFI_LOCAL_MODEL`, `CODEXFI_MODEL_DIR`, `CODEXFI_CLAUDE_BIN`, `CODEXFI_DISABLE`, `CODEXFI_NO_WORKER`.

## Development

```bash
cd plugin
npm install             # or bun install
npm run typecheck
npm run build           # → dist/codexfi.js (commit it: the plugin installs from git)

# Load the working tree in Claude Code for one session, without installing:
claude --plugin-dir ./plugin

# Drive hooks by hand against an isolated store:
export CODEXFI_DATA_DIR=/tmp/codexfi-dev
echo '{"session_id":"s1","cwd":"'"$PWD"'","source":"startup"}' | node dist/codexfi.js hook session-start
echo '{"session_id":"s1","cwd":"'"$PWD"'","prompt":"how do we run tests?"}' | node dist/codexfi.js hook user-prompt-submit
```

Logs: `~/.codexfi/logs/{hook,worker}.log`. Tests live in [`../testing`](../testing/README.md), benchmarks in [`../benchmark`](../benchmark/README.md).
