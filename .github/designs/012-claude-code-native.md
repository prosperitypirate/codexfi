# codexfi 1.0 — Claude Code Native (Design Document)

**Feature**: Rebuild codexfi as a Claude Code–exclusive plugin with zero extra setup — no OpenCode, no xAI/Google, no required API keys
**Branch**: `feat/claude-code-native`
**Status**: IMPLEMENTED (see §9 for benchmark evidence and §10 for open items)
**Created**: November 6, 2026

---

## 1. Executive Summary

### The problem

codexfi was built as an OpenCode plugin. Since then:

- Claude Code (terminal CLI and VS Code extension) has become the dominant agent host for this kind of workflow.
- codexfi needed **two paid keys** (Voyage for embeddings + an extraction LLM key). For a Claude Code subscriber that is setup friction for something Claude Code itself could do.
- Claude Code grew a much richer extension surface (≈33 hook events, plugins + marketplaces, MCP, skills, mods) than an OpenCode-first design can use.
- The popular competitor **claude-mem** proved demand but also showed the failure modes (runaway subscription burn, leaking daemons, recency-only injection, no published accuracy).

### The solution

A single Claude Code plugin (`/plugin marketplace add prosperitypirate/codexfi`) whose moving parts are:

| Concern | Before (0.7.x, OpenCode) | After (1.0, Claude Code) |
|---|---|---|
| Host integration | OpenCode `chat.message` / `system.transform` / `event` | Claude Code hooks: SessionStart, UserPromptSubmit, Stop, PreCompact, SessionEnd |
| Explicit memory tool | OpenCode `tool.memory` | MCP stdio server: `memory_search`, `memory_add`, `memory_list`, `memory_forget` |
| Extraction LLM | xAI / Anthropic / Google API keys | **The user's own `claude` CLI** (`claude -p --safe-mode …`) — subscription or whatever Claude Code uses; optional Anthropic API key |
| Embeddings | Voyage AI `voyage-code-3` (key required) | **On-device ONNX model** via transformers.js; Voyage optional |
| Extraction trigger | streaming buffer, "last 8 messages" | Stop hook → **job queue** → detached single worker; byte-offset transcript cursor (each turn extracted exactly once) |
| Install | `curl … \| bash` + keys | `/plugin install codexfi@codexfi` — Claude Code installs npm deps itself |
| Memory Bank | unaware (duplicated it) | **Memory-Bank-aware**: skips what the bank already covers |

Everything is local: `~/.codexfi/` (SQLite store, queue, logs, model weights). Nothing leaves the machine except the extraction call, which goes through the user's own Claude Code.

---

## 2. Research inputs (summarised)

Three research tracks fed this design (full reports were produced in the build session):

1. **Claude Code capabilities (v2.1.289 terminal / v2.1.318 VS Code).**
   - `additionalContext` from SessionStart/UserPromptSubmit is injected as a system reminder, **capped at 10,000 chars** (overflow is replaced by a file pointer + 2k preview), persisted in the transcript and **replayed (not re-run) on resume**.
   - SessionStart re-runs on `resume`, `clear`, `compact`, `fork`; UserPromptSubmit has a 30 s default timeout and blocks the prompt; SessionEnd shares a 1.5 s budget.
   - Hooks also fire inside subagents (`agent_id` present).
   - The VS Code extension does **not** put `claude` on PATH; hooks receive `CLAUDE_CODE_EXECPATH`.
   - `claude -p --bare` cannot use a subscription (API key only). `--safe-mode` keeps the normal login while skipping plugins, hooks, CLAUDE.md, MCP and auto-memory.
   - Plugins: Claude Code auto-installs a plugin's npm dependencies (package.json + npm lockfile, `--ignore-scripts`, 60 s timeout).
   - **Mods** (v2.1.287+) can call `$.model.complete` on the user's plan — the most sanctioned subscription path — but they are ~5 weeks old, have no filesystem access (SQLite/ONNX would need a sidecar anyway), and some events are guarded on Team/Enterprise logins.
2. **claude-mem teardown** — what to copy (fit under the 10k cap by dropping whole items, re-inject after compact, write-fast hooks, never invisible subscription burn) and what to avoid (a permanent daemon, a Python sidecar, one LLM turn per tool call, recency-only injection, writing into the user's repo, no accuracy numbers).
3. **Local embeddings vs Voyage** — 30+ ONNX models evaluated on the benchmark memory corpus (§9.1).

---

## 3. Architecture

```
Claude Code session
 │
 ├─ SessionStart ─────────► codexfi hook session-start
 │   (startup/clear/compact;     list structured memories → [MEMORY] block (≤9.5k chars)
 │    skipped on resume)         Memory Bank present? → only sessions since last bank save + prefs
 │                               brand-new project? → enqueue auto-init job
 │
 ├─ UserPromptSubmit ─────► codexfi hook user-prompt-submit        (~250 ms incl. local embed)
 │                               embed prompt locally → search project + user scope
 │                               drop memories already injected this session
 │                               "remember …" detected → note pointing at memory_add
 │
 ├─ (Claude works; may call MCP tools memory_search / memory_add / …)
 │
 ├─ Stop ─────────────────► codexfi hook stop                       (~90 ms)
 │                               enqueue {turn job} → spawn detached worker if none running
 ├─ PreCompact / SessionEnd ► enqueue {summary job}
 │
 └──────────── background: codexfi worker (single instance, exits when queue empty)
                  read transcript from saved byte offset → windows of ≤12k chars
                  extract via `claude -p --safe-mode --model haiku` (or Anthropic API)
                  embed locally → dedup → contradiction/supersede → aging → SQLite
                  re-embed rows from an older embedding model (Voyage → local) in batches
```

### 3.1 Why hooks + worker + MCP (and not mods) for 1.0

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Classic hooks + detached worker + MCP** | Works on every Claude Code ≥2.1 surface; plain processes (SQLite, ONNX work); testable offline; same code runs the benchmark | LLM via `claude -p` subprocess (≈600 tokens overhead/call) | **Chosen** |
| Mods (`$.model.complete`, `prompt.submit`) | First-party subscription billing; in-process | ~5 weeks old, weekly breaking changes; no fs → still needs a sidecar for SQLite/ONNX; guarded events on Team/Enterprise | Phase 2: add a mod-based LLM backend behind `llm.ts` |
| Permanent daemon (claude-mem style) | Warm model, no per-hook startup | Leaks, ports, lifecycle bugs (claude-mem's top issue class) | Rejected — a short-lived worker + 250 ms cold path is enough |

### 3.2 LLM backend (`plugin/src/llm.ts`)

- `auto` (default): `claude-cli` if a `claude` binary is found (`CODEXFI_CLAUDE_BIN` → `CLAUDE_CODE_EXECPATH` → PATH → known install dirs), else `anthropic-api` if a key is configured.
- CLI call: `claude -p --safe-mode --model haiku --output-format json --system-prompt <task> --tools "" --setting-sources "" --strict-mcp-config --no-session-persistence --disable-slash-commands`, prompt on stdin, cwd = neutral temp dir. Measured: **~590 input tokens overhead, ~1.6–2 s per call** (vs ~36k tokens for a default `claude -p`).
- Recursion guard, belt and braces: `--safe-mode` + `--setting-sources ""` load no plugins/hooks, **and** the child env carries `CODEXFI_DISABLE=1`, which makes every codexfi entrypoint exit immediately.
- Policy note: Anthropic's terms forbid third-party apps from offering claude.ai login or intermediating credentials. codexfi never touches credentials; it invokes the user's own unmodified Claude Code binary. The mod `$.model.*` API (documented as "spend your usage") is the cleanest long-term path and is tracked as Phase 2.

### 3.3 Embeddings (`plugin/src/embedder.ts`)

- `local` (default): `@huggingface/transformers` ONNX pipeline, weights cached in `~/.codexfi/models` on first use. Model choice and thresholds: §9.1.
- `voyage` (optional): unchanged behaviour for users who want the best retrieval and already have a key.
- Every row records `embed_model`; vector search, dedup and contradiction detection only compare vectors from the **current** model. Rows from another model (e.g. 0.7.x Voyage vectors) stay fully usable for the structured SessionStart block (no vectors needed) and are migrated by the worker's background re-embed pass (`reembedStale`).
- Hybrid BM25 was evaluated and **rejected**: it lowered nDCG@10 for every dense model tested (§9.1).

### 3.4 Storage changes

- New column `memories.embed_model` (forward-only migration on open; legacy rows labelled `voyage-code-3`).
- `crud.update` can now replace the vector; dedup refreshes now re-embed the updated text (previously the old vector was kept — a latent inconsistency).
- New `store.addMemory()` stores an agent-written fact verbatim (no extraction call) — used by `memory_add`.

### 3.5 Memory Bank coexistence

Many Claude Code users maintain a **Memory Bank** (`memory-bank/` with projectbrief, productContext, systemPatterns, techContext, activeContext, progress) loaded at session start. codexfi's structured sections map 1:1 onto those files, so injecting both duplicates tokens. When `memory-bank/` is detected (walking up ≤4 parents) and `memoryBank` ≠ `"off"`:

- SessionStart injects **only** session summaries newer than the bank's last save (max core-file mtime) plus cross-project user preferences, labelled as supplementing the bank.
- UserPromptSubmit is unchanged — per-turn retrieval of *specific* facts is exactly what a curated, budgeted bank cannot provide.

The benchmark's `memory-bank` mode measures whether this adds value (§9.3).

### 3.6 Coexistence with Claude Code auto-memory

Built-in auto memory (`~/.claude/projects/<project>/memory/MEMORY.md`, first 200 lines / 25 KB) is on by default and cannot be disabled by a plugin. codexfi does not write to it. They are complementary: auto memory holds a handful of curated facts Claude chooses to keep; codexfi holds the long tail (every turn extracted, semantically searchable, cross-project user scope, superseding of stale facts).

---

## 4. Files

| Area | Files |
|---|---|
| Claude Code layer (new) | `plugin/src/claude/{hooks,context,transcript,state,worker,spawn,runtime,mcp,auto-init}.ts` |
| LLM (new) | `plugin/src/llm.ts` |
| Engine changes | `config.ts`, `plugin-config.ts`, `embedder.ts`, `extractor.ts`, `store.ts`, `store/{schema,sqlite,crud,search,types}.ts`, `telemetry.ts`, `prompts.ts` |
| Shared services (new) | `services/{memory-bank,query-types}.ts` |
| Plugin packaging (new) | `.claude-plugin/marketplace.json`, `plugin/.claude-plugin/plugin.json` (incl. MCP server), `plugin/hooks/hooks.json`, `plugin/scripts/run.sh`, committed bundle `plugin/dist/codexfi.js` |
| Removed | `plugin/src/index.ts` (OpenCode entry), `services/{auto-save,compaction,disabled-warning,fresh-project-hint,directory-tree,logger}.ts`, `smoke-e2e.ts`, OpenCode E2E suite, `opencode-*` GitHub workflows, `@opencode-ai/*` deps, xAI/Google providers |
| CLI | `install` (Claude Code plugin install), `status` (new health checks), `stats`/dashboard (generic backends) |
| Benchmark | pluggable answer/judge backend (`claude-cli`), concurrency, `--dataset v1|v2`, `--mode memory-bank` |

---

## 5. Edge cases & decisions

| Case | Decision |
|---|---|
| Hook output > 10k chars | `fitToLimit()` drops whole trailing bullets (never mid-fact) to ≤9.5k |
| Resumed session | SessionStart injects nothing (context is replayed from the transcript) |
| Repeated retrieval | Per-session injected-id set; a memory is shown at most once per context window (reset on startup/clear/compact) |
| Subagents | Hook events with `agent_id` are ignored (exploration noise) |
| Long turns | Split into ≤12k-char windows on message boundaries instead of truncating |
| Our own injected `[MEMORY]` | Lives in transcript `attachment` records, which the parser skips — never re-extracted |
| Concurrent sessions | One worker (exclusive lock file, stale-pid takeover); SQLite WAL for readers |
| SessionEnd 1.5 s budget | Enqueue + detach only |
| Embedding runtime missing | Plugin dependency auto-install; fallback resolution from `~/.codexfi/runtime`; failures are logged, never block |
| Privacy | `<private>…</private>` stripped before storage; `excludePaths` makes codexfi fully silent in chosen directories (hooks and MCP) |
| Container tags | Legacy `opencode_project_*` / `opencode_user_*` prefix kept so existing stores keep working |
| Benchmark with an API key in env | `CODEXFI_CLI_STRIP_API_KEY=1` forces the CLI child onto the subscription |

---

## 6. Rollback

The branch is self-contained. To roll back: uninstall the plugin (`claude plugin uninstall codexfi@codexfi`). The store migration only *adds* a column; 0.7.x can still read the database (it ignores unknown columns), though rows re-embedded locally would no longer match its Voyage queries.

---

## 7. Phase 2 (not in this branch)

1. Mod-based LLM backend (`$.model.complete`) behind `llm.ts`, gated on Claude Code ≥ 2.1.29x.
2. PreToolUse(Read) file-scoped injection ("what we know about this file").
3. `memory-bank` sync skill: draft activeContext/progress updates from codexfi session summaries.
4. Subagent memory via SubagentStart `additionalContext`.
5. Usage-limit awareness: back off background extraction near the 5-hour / weekly limits.

---

## 9. Evidence

### 9.1 Local embeddings vs Voyage (retrieval only)

Corpus: 522 memories produced by earlier benchmark runs; 175 answerable questions; pooled relevance labels (benchmark judge labels + blind top-10 pool completion). nDCG@10 (Δ vs Voyage, 95% CI):

| system | nDCG@10 | Δ vs voyage | Hit@20 |
|---|---|---|---|
| voyage-code-3 (API) | 0.796 | — | 0.977 |
| embeddinggemma-300m (local) | 0.754 | −0.043 [−0.067, −0.019] | 0.954 |
| jina-v2-base-code (local) | 0.749 | −0.048 [−0.078, −0.019] | 0.977 |
| all-MiniLM-L6-v2 (local) | 0.723 | −0.073 | 0.966 |
| bge-small-en-v1.5 (local) | 0.712 | −0.084 | 0.971 |
| BM25 only | 0.663 | −0.134 | 0.966 |
| voyage + BM25 hybrid | 0.757 | −0.040 (hybrid hurts) | 0.960 |

_Model selection and cold-start latency: see §9.4._

### 9.2 End-to-end QA (DevMemBench v1, 200 questions)

_Filled in from benchmark runs — see benchmark/README.md._

### 9.3 Memory Bank vs Memory Bank + codexfi

_Filled in from benchmark runs — see benchmark/README.md._

### 9.4 Latency (measured on Apple Silicon, Node 25 / Bun 1.3)

| path | time |
|---|---|
| Stop hook (enqueue + spawn worker) | ~90 ms |
| SessionStart hook (structured block) | ~110 ms |
| UserPromptSubmit hook incl. local model load + query embed | ~250 ms |
| One extraction call via `claude -p --safe-mode` (haiku) | ~1.6–3 s (background) |
