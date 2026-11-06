<div align="center">

# codexfi

**Persistent, searchable memory for [Claude Code](https://code.claude.com).**

> *Claude Code remembers what you told it. codexfi remembers everything you worked out together — every decision, fix and convention — and puts the relevant piece back in front of Claude at the moment it matters.*

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-F7DF1E?style=flat)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Plugin-D97706?style=flat)](https://code.claude.com)
[![No API keys](https://img.shields.io/badge/API_keys-none_required-22C55E?style=flat)](#how-it-works)
[![Local embeddings](https://img.shields.io/badge/Embeddings-on--device-3178C6?style=flat)](#how-it-works)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

## What is this?

Claude Code starts every session cold. Its built-in auto-memory keeps a short `MEMORY.md` of things Claude decides to save, and a hand-maintained Memory Bank captures the big picture — but the long tail (the exact error and its fix, the port you moved to, why you rejected library X, the test flag the user insists on) is gone by next week.

**codexfi closes that gap automatically:**

- **After every turn**, a background worker extracts typed facts (decisions, fixes, conventions, preferences, progress) from the transcript.
- **At session start**, Claude gets a compact project picture (brief, architecture, tech, progress, recent sessions, your cross-project preferences).
- **On every prompt**, the memories relevant to *that* prompt are retrieved semantically and injected — once per session, never repeated.
- **Mid-task**, Claude can call `memory_search` / `memory_add` / `memory_list` / `memory_forget` (MCP tools).
- **Stale facts are superseded** when they change ("moved from port 8000 to 3000"), not left to contradict each other.

## Zero setup

- **No API keys.** Background extraction runs through **your own Claude Code login** (`claude -p`, Haiku, ~600 tokens of overhead per call). Embeddings run **on your machine** (ONNX, downloaded once).
- **No daemon, no ports, no Python.** Hooks return in ~0.1–0.3 s; a short-lived worker does the slow part and exits.
- **Works in the terminal and the VS Code extension** (same `~/.claude` settings; codexfi finds the extension's bundled `claude` binary automatically).

## Install

In Claude Code:

```
/plugin marketplace add prosperitypirate/codexfi
/plugin install codexfi@codexfi
```

or from a shell:

```bash
claude plugin marketplace add prosperitypirate/codexfi
claude plugin install codexfi@codexfi
```

Start a new session. Requirements: Claude Code ≥ 2.1, and [Bun](https://bun.sh) or Node ≥ 22.5 on your PATH.

Check health any time:

```bash
npx codexfi status        # or: bunx codexfi status
```

## How it works

```
SessionStart      → [MEMORY] project picture (≤9.5k chars, skipped on resume)
UserPromptSubmit  → embed prompt locally → top memories for THIS prompt (not yet shown)
Stop / PreCompact / SessionEnd → enqueue → detached worker:
                    transcript (exactly-once byte cursor) → claude -p --safe-mode (haiku)
                    → typed facts → local embedding → dedup → supersede stale → SQLite
```

Everything lives in `~/.codexfi/` (SQLite store, job queue, logs, model weights). The only outbound call is the extraction request, made by your own Claude Code.

## Works with your Memory Bank

If your project has a `memory-bank/` (projectbrief, productContext, systemPatterns, techContext, activeContext, progress), codexfi detects it and **stops duplicating it**: at session start it only adds sessions since your last `save bank` plus your cross-project preferences, and per prompt it retrieves the specific details a curated, token-budgeted bank can't keep. Set `"memoryBank": "off"` to disable this behaviour. The benchmark's `memory-bank` mode measures exactly this combination — see [benchmark results](./benchmark/README.md).

## Benchmark

DevMemBench — 200 questions across 8 developer-memory categories, LLM-as-judge. See [benchmark/README.md](./benchmark/README.md) for the full methodology and every run.

<!-- BENCHMARK-SUMMARY:START -->
| | codexfi 0.7.x | **codexfi 1.0** |
|---|---|---|
| API keys required | Voyage + Anthropic | **none** |
| DevMemBench v1 (200 Q) | 91.0% | **92.0%** |
| Retrieval Hit@20 | 88.0% | 88.0% |
| Search latency (p50) | 88 ms | **6 ms** |

Same answer/judge model for both runs; the difference is within run-to-run noise, so 1.0 is at parity while needing nothing but Claude Code.
<!-- BENCHMARK-SUMMARY:END -->

## Configuration (optional)

`~/.codexfi/codexfi.jsonc` — every field is optional:

```jsonc
{
  "llmBackend": "auto",            // "auto" | "claude-cli" | "anthropic-api"
  "llmModel": "haiku",             // any Claude Code model alias or id
  "localModel": "jina-v2-base-code", // or "all-MiniLM-L6-v2" (lighter, faster)
  "memoryBank": "auto",            // "auto" | "off"
  "autoInit": true,                // seed a new project from README/manifests/git log
  "excludePaths": ["/Users/me/clients/secret-co"],  // codexfi stays silent here
  "anthropicApiKey": ""            // only for llmBackend "anthropic-api"
}
```

## Privacy

- Data never leaves your machine except the extraction call your own Claude Code makes.
- Wrap anything in `<private>…</private>` to keep it out of memory.
- `excludePaths` turns codexfi off completely for chosen directories (hooks and tools).
- Subagent traffic is ignored; codexfi never writes into your repository.

## CLI

`codexfi status | list | search | stats | export | forget | dashboard` — see [plugin/src/cli/README.md](./plugin/src/cli/README.md).

## Upgrading from 0.7.x (OpenCode)

codexfi 1.0 is Claude Code–only. Your existing `~/.codexfi` store is kept: on first run the worker re-embeds old 0.7.x vectors with the local model in the background (structured memories are usable immediately). The `opencode_*` container tags are preserved, so nothing is orphaned.

## More

- **[Design: Claude Code native (1.0)](./.github/designs/012-claude-code-native.md)** — architecture, decisions, trade-offs, evidence
- **[Plugin internals](./plugin/README.md)**
- **[Benchmark](./benchmark/README.md)**
- **[Tests](./testing/README.md)**

## License

[MIT](./LICENSE)
