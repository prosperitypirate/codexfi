<div align="center">

# codexfi

**Persistent memory for AI coding agents.** Starts as an [OpenCode](https://opencode.ai) plugin.

The agent learns from every session automatically — no commands, no manual saves, no cloud, no Docker.

<br/>

[![Score: 94.5%](https://img.shields.io/badge/Benchmark-94.5%25-22C55E?style=flat)](../benchmark/README.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-F7DF1E?style=flat)](../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2-FBF0DF?style=flat&logo=bun&logoColor=black)](https://bun.sh/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Embedded-CF3CFF?style=flat)](https://lancedb.com/)
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

A single Bun package that gives OpenCode agents persistent memory across sessions. Everything runs embedded — LanceDB for storage, Voyage AI for embeddings, multi-provider LLM extraction — with zero external processes.

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

```bash
# Required — embeddings
export VOYAGE_API_KEY=pa-...

# Required — extraction (pick one)
export ANTHROPIC_API_KEY=sk-ant-...    # default, most consistent
# export XAI_API_KEY=...               # fastest
# export GOOGLE_API_KEY=...            # native JSON mode
```

### 3. Register with OpenCode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["codexfi"]
}
```

### 4. Start a session

Open any project in OpenCode. The `[MEMORY]` block appears in context from the first message. Memories auto-save after every assistant turn.

**That's it.** No Docker. No Python. No separate server.

---

## Features

- **Fully automatic** — memories save after every assistant turn with zero user action
- **Embedded storage** — LanceDB runs in-process at `~/.codexfi/lancedb/`
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
├── db.ts                 — LanceDB init/connect/refresh
├── store.ts              — full CRUD + dedup + aging + contradiction + search with recency blending
├── extractor.ts          — multi-provider LLM extraction (Anthropic/xAI/Google) + fallback + retry
├── embedder.ts           — Voyage AI voyage-code-3 embedding via fetch
├── retry.ts              — exponential backoff with jitter
├── telemetry.ts          — CostLedger + ActivityLog
├── names.ts              — name registry JSON persistence
├── plugin-config.ts      — user-facing config from ~/.config/opencode/memory.jsonc
└── services/
    ├── auto-save.ts      — background extraction after assistant turns
    ├── compaction.ts     — context window compaction with memory injection
    ├── context.ts        — [MEMORY] block formatting for system.transform
    ├── privacy.ts        — <private> tag stripping
    ├── tags.ts           — project/user tag computation from directory hash
    ├── logger.ts         — async file logger (no sync I/O)
    └── types/index.ts    — plugin-specific TS types
```

### Data flow

```
User message → chat.message hook
  ├── Turn 1: 4 parallel fetches (profile, user search, project list, project search)
  │   └── If zero project memories + existing codebase → silent auto-init from README/package.json/etc
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
- Plugin embeds LanceDB, extraction, and embeddings directly — no external services.

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
| `tech-context` | Stack, tools, build commands, constraints |
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

E2E: 11/12 scenarios pass. See [benchmark/README.md](../benchmark/README.md) for full results.

---

## Configuration

Optional config at `~/.config/opencode/memory.jsonc`:

```jsonc
{
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

---

## Development

```bash
bun install
bun run build          # build to dist/
bun run typecheck      # type-check only
bun run smoke:e2e      # full pipeline smoke test (requires API keys)
bun run spike          # LanceDB NAPI bindings validation
```

### Log file

```bash
tail -f ~/.codexfi.log
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `@lancedb/lancedb` | Embedded vector database (NAPI bindings, Bun 1.2.19+) |
| `zod` | Runtime validation for memory record schemas |
| `@opencode-ai/plugin` | OpenCode plugin SDK types |
| `@opencode-ai/sdk` | OpenCode SDK for client interactions |

---

## Privacy

All data stays on your machine. The only outbound API calls are:

- **Voyage AI** — text sent for embedding generation
- **Your extraction provider** — conversation text for memory extraction (one provider per request)

Wrap sensitive content in `<private>...</private>` to exclude it from extraction.

---

<div align="center">

Built with [OpenCode](https://opencode.ai) · [LanceDB](https://lancedb.com) · [Voyage AI](https://www.voyageai.com) · [Anthropic](https://anthropic.com) · [xAI](https://x.ai) · [Google AI](https://ai.google.dev) · [Bun](https://bun.sh)

</div>
