<div align="center">

# codexfi

**Persistent memory for AI coding agents.** Starts as an [OpenCode](https://opencode.ai) plugin.

The agent learns from every session automatically — no commands, no manual saves, no cloud.

<br/>

[![Score: 94.5%](https://img.shields.io/badge/Benchmark-94.5%25-22C55E?style=flat)](../benchmark/README.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-F7DF1E?style=flat)](../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2-FBF0DF?style=flat&logo=bun&logoColor=black)](https://bun.sh/)
[![Voyage AI](https://img.shields.io/badge/Voyage_AI-Code_Embeddings-5B6BF5?style=flat)](https://www.voyageai.com/)
[![Anthropic](https://img.shields.io/badge/Anthropic-Haiku_4.5-D97706?style=flat)](https://anthropic.com)
[![xAI Grok](https://img.shields.io/badge/xAI-Grok-000000?style=flat&logo=x&logoColor=white)](https://x.ai/)
[![Google Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
[![Self-Hosted](https://img.shields.io/badge/Self--Hosted-100%25_Local-22C55E?style=flat&logo=homeassistant&logoColor=white)](https://github.com/prosperitypirate/codexfi)
[![Zero Docker](https://img.shields.io/badge/Zero-Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://github.com/prosperitypirate/codexfi)
[![OpenCode Plugin](https://img.shields.io/badge/OpenCode-Plugin-FF6B35?style=flat)](https://opencode.ai)

</div>

---

## What is this?

A single Bun package that gives OpenCode agents persistent memory across sessions. Everything runs embedded — pure TypeScript vector store, Voyage AI for embeddings, multi-provider LLM extraction — with zero external processes and zero native dependencies.

After every assistant turn, the conversation is automatically analysed. Key facts are extracted, embedded, and stored locally. At the start of every new session, relevant memories are silently injected into the agent's context. The agent simply *remembers*.

---

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/prosperitypirate/codexfi
cd codexfi/plugin
bun install
bun run build
```

### 2. Set API keys

Run the installer to store your keys in `~/.codexfi/codexfi.jsonc`:

```bash
bunx codexfi install
```

Or pass keys directly for non-interactive setup:

```bash
bunx codexfi install --no-tui --voyage-key pa-... --anthropic-key sk-ant-...
```

### 3. Register with OpenCode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["codexfi"]
}
```

### 4. Start a session

Open any project in OpenCode. Memory is silently injected into system context every turn — you won't see it, but the agent does. Memories auto-save after every assistant turn.

**That's it.** No Docker. No Python. No separate server.

---

## Features

- **Fully automatic** — memories save after every assistant turn with zero user action
- **Turn 1 visibility** — auto-init reads 28 project files + recent git log and makes memories available immediately on the first turn
- **Background enrichment** — after the first response, enriches with directory tree, entry points, and CI configs
- **Fresh project detection** — empty directories get a `[MEMORY - NEW PROJECT]` hint to guide the agent
- **Embedded storage** — pure TypeScript SQLite WAL vector store at `~/.codexfi/store/store.db`
- **Multi-provider extraction** — Anthropic Haiku (default), xAI Grok (fastest), Google Gemini (native JSON) with automatic fallback
- **Code-optimised embeddings** — Voyage `voyage-code-3` (1024 dims), purpose-built for code and technical content
- **Always-fresh context** — `[MEMORY]` block rebuilt in system prompt every LLM call via `system.transform`
- **Per-turn semantic refresh** — every user message triggers a semantic search update so context matches the current topic
- **Compaction-proof** — memory lives in the system prompt, which is never compacted
- **Typed memory system** — `architecture`, `error-solution`, `preference`, `progress`, etc. in structured blocks
- **Hybrid search** — semantic search on atomic facts + raw source chunks for exact values
- **Smart deduplication** — cosine similarity prevents duplicate memories
- **Relational versioning** — contradicting memories are automatically superseded
- **Memory aging** — session summaries condense into learned patterns; only latest `progress` survives
- **Project + user scope** — separate namespaces for project knowledge vs personal preferences
- **Explicit save** — say "remember this" and the agent stores it immediately
- **Privacy filter** — `<private>...</private>` tags are stripped before any extraction

---

## Architecture

```
src/
├── index.ts              — main plugin hooks (system.transform, chat.message, tool.memory, event)
├── config.ts             — centralized constants + validateId()
├── types.ts              — Zod schemas for memory records
├── prompts.ts            — all LLM prompt templates
├── db.ts                 — vector store init/adapter
├── store.ts              — full CRUD + dedup + aging + contradiction + search with recency blending
├── extractor.ts          — multi-provider LLM extraction (Anthropic/xAI/Google) + fallback + retry
├── embedder.ts           — Voyage AI voyage-code-3 embedding via fetch
├── retry.ts              — exponential backoff with jitter
├── telemetry.ts          — CostLedger + ActivityLog
├── names.ts              — name registry JSON persistence
├── plugin-config.ts      — user-facing config from ~/.codexfi/codexfi.jsonc
└── services/
    ├── auto-init-config.ts — init file list (28 files) and total char cap
    ├── auto-save.ts      — background extraction after assistant turns
    ├── compaction.ts     — context window compaction with memory injection
    ├── context.ts        — [MEMORY] block formatting for system.transform
    ├── directory-tree.ts — project tree generator for background enrichment
    ├── disabled-warning.ts — warning hint when plugin is misconfigured
    ├── fresh-project-hint.ts — [MEMORY - NEW PROJECT] hint for empty directories
    ├── logger.ts         — async file logger (no sync I/O)
    ├── privacy.ts        — <private> tag stripping
    └── tags.ts           — project/user tag computation from directory hash
```

### Data flow

```
User message → chat.message hook
  ├── Turn 1: 4 parallel fetches (profile, user search, project list, project search)
  │   ├── If zero project memories + existing codebase → silent auto-init
  │   │   ├── Reads 28 project files + recent 20 git commits → extracts with init mode
  │   │   └── Re-fetches memories so Turn 1 [MEMORY] block is populated
  │   ├── If zero project memories + empty directory → [MEMORY - NEW PROJECT] hint injected
  │   └── After Turn 1 response: background enrichment (directory tree, entry points, CI configs)
  └── Turns 2+: single semantic search refreshes "Relevant to Current Task"

  → system.transform injects [MEMORY] block into system prompt (every LLM call)

Assistant completes turn → event hook
  └── auto-save: extract facts from last 8 messages → embed → dedup → store
      └── Every 5 turns: also generate session summary
```

### How the agent sees memory

```
[MEMORY]

## Project Brief
- codexfi is a self-hosted persistent memory system for AI coding agents.

## Architecture
- Plugin embeds a pure TypeScript vector store, extraction, and embeddings directly — no external services.

## Tech Context
- Uses voyage-code-3 embeddings; extraction via claude-haiku-4-5 (default)
- Bun runtime, TypeScript, Zod validation, tabs for indentation

## Progress & Status
- Benchmark at 94.5% (189/200); cross-synthesis at 72% is primary remaining gap

## Last Session
- Completed code cleanup — removed all migration-era references from 21 files

## User Preferences
- Use bun not npm for all installs
- Prefers concise responses; no emojis unless explicitly requested

## Relevant to Current Task
- [94%, 2026-02-23] Default extraction model is claude-haiku-4-5 — most consistent
- [88%, 2026-02-21] Contradiction detection marks superseded memories via superseded_by field
```

---

## How It Works

### System prompt injection (every LLM call)

The `[MEMORY]` block lives in the **system prompt**, not in message history. It is rebuilt fresh on every LLM call via `experimental.chat.system.transform`:

- **Turn 1**: 4 parallel calls fetch profile, user memories, project list, and semantic search. Results cached per-session.
- **Turns 2+**: A single semantic search (~300ms) refreshes "Relevant to Current Task".
- **Every LLM call**: `system.transform` reads the cache, rebuilds `[MEMORY]`, pushes it into the system prompt.

This means zero token accumulation, survives compaction, and topic switches cause different memories to surface.

### Auto-save (after every turn)

Every time the assistant completes a turn:

1. Snapshot the recent conversation (last 8 exchanges)
2. LLM extracts a JSON array of typed facts
3. Each fact is embedded with `voyage-code-3` and stored after cosine dedup
4. Raw source conversation stored as `chunk` (enables hybrid search for exact values)
5. Contradiction search finds and supersedes stale memories

A 15-second cooldown handles OpenCode's double-fire of the completion event.

### Memory types

| Type | What it captures |
|------|-----------------|
| `project-brief` | Core project definition, goals, scope |
| `architecture` | System design, patterns, component relationships |
| `tech-context` | Stack, languages, frameworks, key dependencies — not specific commands or tool paths (use `project-config`) |
| `product-context` | Why the project exists, problems solved |
| `progress` | Current state — only the latest entry survives |
| `session-summary` | What was worked on; oldest condense into `learned-pattern` |
| `error-solution` | Bug fixes, gotchas, approaches that failed |
| `preference` | Cross-project personal preferences |
| `learned-pattern` | Reusable patterns condensed from past sessions |
| `project-config` | Config preferences, run commands, env setup |
| `conversation` | Raw conversation context |

### Compaction survival

When OpenCode truncates the conversation, the `[MEMORY]` block is unaffected (it's in the system prompt, not message history). The plugin also intercepts the compaction hook to inject memories into the compaction context for richer summaries, then triggers a full cache refresh on the next turn.

---

## Extraction Providers

| Provider | Model | Speed | Benchmark | Notes |
|---|---|---|---|---|
| **Anthropic** (default) | `claude-haiku-4-5` | ~14s/session | **93.5% avg** (3pp variance) | Most consistent |
| **xAI** | `grok-4-1-fast-non-reasoning` | ~5s/session | ~86.5% avg (16pp variance) | Fastest, cheapest |
| **Google** | `gemini-3-flash-preview` | ~21s/session | — | Native JSON mode |

Switch via `EXTRACTION_PROVIDER=xai` (or `anthropic`, `google`). Extraction runs in the background — latency is invisible to users.

---

## Benchmark

**94.5% overall** (189/200) on [DevMemBench](../benchmark/README.md) — 200 questions across 8 categories.

```
tech-stack        ████████████████████ 100%  (25/25)  ✓
architecture      ████████████████████ 100%  (25/25)  ✓
preference        ████████████████████ 100%  (25/25)  ✓
abstention        ████████████████████ 100%  (25/25)  ✓
session-cont.     ███████████████████░  96%  (24/25)  ✓
knowledge-update  ███████████████████░  96%  (24/25)  ✓
error-solution    ██████████████████░░  92%  (23/25)  ✓
cross-synthesis   ██████████████░░░░░░  72%  (18/25)  ⚠
──────────────────────────────────────────────────────
Overall           94.5%  (189/200)
```

**Extractor:** `claude-haiku-4-5` · **Judge/Answer:** `claude-sonnet-4-6` · **Embeddings:** `voyage-code-3` · **K=20 retrieval**

E2E: 13 scenarios. See [benchmark/README.md](../benchmark/README.md) for full results.

---

## Configuration

Config file at `~/.codexfi/codexfi.jsonc` (created by `codexfi install`):

```jsonc
{
  // ── API Keys (required) ───────────────────────────────────────────
  "voyageApiKey": "pa-...",         // Voyage AI — embeddings (required)
  "anthropicApiKey": "sk-ant-...",  // Anthropic — extraction (pick one)
  // "xaiApiKey": "xai-...",        // xAI — extraction (fastest)
  // "googleApiKey": "AIza...",     // Google — extraction (native JSON)

  // ── Extraction Provider ───────────────────────────────────────────
  // Which LLM to use for memory extraction: "anthropic" | "xai" | "google"
  "extractionProvider": "anthropic",

  // ── Behaviour ─────────────────────────────────────────────────────
  // Minimum similarity score for retrieval (default: 0.45)
  "similarityThreshold": 0.45,

  // Max memories retrieved per scope per session (default: 10)
  "maxMemories": 10,

  // Max project memories for structured sections (default: 30)
  "maxStructuredMemories": 30,

  // Context fill ratio that triggers compaction (default: 0.80)
  "compactionThreshold": 0.80,

  // Turns between session-summary auto-saves (default: 5)
  "turnSummaryInterval": 5,

  // Additional keyword patterns that trigger explicit save
  // "keywordPatterns": ["bookmark this", "save for later"]
}
```

Switch extraction provider by setting `"extractionProvider"` in `codexfi.jsonc` (or via the `codexfi install` command). The `EXTRACTION_PROVIDER` environment variable can still be used as an override for CI/testing.

---

## Development

```bash
bun install
bun run build          # build to dist/
bun run typecheck      # type-check only
bun run smoke:e2e      # full pipeline smoke test (requires API keys)
bun run spike          # vector store validation
```

### Log file

```bash
tail -f ~/.codexfi.log
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `zod` | Runtime validation for memory record schemas |
| `@opencode-ai/plugin` | OpenCode plugin SDK types |
| `@opencode-ai/sdk` | OpenCode SDK for client interactions |

---

## Agent Instructions (AGENTS.md)

The plugin works without this, but adding instructions to `~/.config/opencode/AGENTS.md` improves agent behavior — it understands the `[MEMORY]` block, uses the `memory` tool correctly, and never announces memory operations.

<details>
<summary>Recommended AGENTS.md snippet</summary>

````markdown
# Memory System

You have a **persistent, self-hosted memory system** that works automatically in the background. It uses a pure TypeScript vector store + Voyage AI embeddings, running locally.

## How it works (fully automatic — no user action needed)

**On every LLM call**, a `[MEMORY]` block is rebuilt and injected into the system prompt. It contains:
- **Project Brief** — what the project is, its purpose
- **Architecture** — system design, component structure
- **Tech Context** — stack, tools, languages, dependencies
- **Product Context** — features, goals, product decisions
- **Progress & Status** — current state, what's done, what's next
- **Last Session** — summary of the previous conversation
- **User Preferences** — personal cross-project preferences
- **Relevant to Current Task** — semantically matched memories

**After every assistant turn**, the plugin extracts atomic typed facts from the last 8 messages and stores them.

**Per-turn semantic refresh**: The "Relevant to Current Task" section is re-searched against the current user message on every turn.

**Compaction survival**: Memory lives in the system prompt, which is never compacted.

**Privacy**: Content wrapped in `<private>...</private>` tags is stripped before extraction.

## Your role

- **Read and use the `[MEMORY]` block** — treat it as ground truth for the current project state.
- **Never ask the user** to "save", "load", or manage memory — it is fully automatic.
- **Never announce** that you are saving or loading memory.
- **When the user explicitly asks you to remember something**, use the `memory` tool with `mode: "add"` immediately.

## Memory tool

Use it when:
- The user explicitly asks you to remember something
- You discover something important mid-session (key decision, tricky bug fix, strong preference)
- You need context not in the `[MEMORY]` block — search proactively on task switches

**Scopes:** `project` (default) or `user` (cross-project preferences)

**Types:** `project-brief`, `architecture`, `tech-context`, `product-context`, `progress`, `project-config`, `error-solution`, `preference`, `learned-pattern`

**Examples:**
```
memory({ mode: "add", content: "Auth uses JWT in httpOnly cookies", scope: "project", type: "architecture" })
memory({ mode: "search", query: "how is authentication handled" })
memory({ mode: "list", scope: "project", limit: 10 })
```
````

</details>

> **Already have an `AGENTS.md`?** Append the Memory System section rather than replacing it.

---

## Privacy

All data stays on your machine. The only outbound API calls are:

- **Voyage AI** — text sent for embedding generation
- **Your extraction provider** — conversation text for memory extraction (one provider per request)

Wrap sensitive content in `<private>...</private>` to exclude it from extraction.

---

<div align="center">

Built with [OpenCode](https://opencode.ai) · [Voyage AI](https://www.voyageai.com) · [Anthropic](https://anthropic.com) · [xAI](https://x.ai) · [Google AI](https://ai.google.dev) · [Bun](https://bun.sh)

</div>
