<div align="center">

# codexfi

**Persistent memory for [OpenCode](https://opencode.ai) AI agents.**

> *The best memory system is the one that just works. No Docker. No Python. No frontend servers. Just `curl -fsSL https://codexfi.com/install | bash` and you're done.*

<br/>

[![npm](https://img.shields.io/npm/v/codexfi?style=flat&color=CB3837)](https://www.npmjs.com/package/codexfi)
[![License: MIT](https://img.shields.io/badge/License-MIT-F7DF1E?style=flat)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-FBF0DF?style=flat&logo=bun&logoColor=black)](https://bun.sh/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Embedded-CF3CFF?style=flat)](https://lancedb.com/)
[![Voyage AI](https://img.shields.io/badge/Voyage_AI-Embeddings-5B6BF5?style=flat)](https://www.voyageai.com/)
[![Anthropic](https://img.shields.io/badge/Anthropic-Haiku-D97706?style=flat)](https://anthropic.com)
[![xAI](https://img.shields.io/badge/xAI-Grok-000000?style=flat&logo=x&logoColor=white)](https://x.ai/)
[![Google](https://img.shields.io/badge/Google-Gemini-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
[![OpenCode](https://img.shields.io/badge/OpenCode-Plugin-FF6B35?style=flat)](https://opencode.ai)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-hero-dark.svg">
  <img src=".github/assets/readme-hero-light.svg" alt="codexfi memory loop — conversation to memory and back" width="100%">
</picture>

</div>

---

## What is this?

OpenCode starts every session from scratch. No memory of past decisions, established patterns, or project context. Every session, you repeat yourself.

**codexfi fixes this.** After every assistant turn, key facts are automatically extracted and stored locally. On every new session, relevant memories are silently injected into context. The agent just *remembers*.

---

## Install

```bash
bunx codexfi install
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-install-dark.svg">
  <img src=".github/assets/readme-install-light.svg" alt="Terminal command: curl -fsSL https://codexfi.com/install | bash" width="100%">
</picture>


The installer prompts for API keys, registers the plugin, and you're done. Start any OpenCode session and you'll see a `[MEMORY]` block confirming it's active.

### Prerequisites

- [Bun](https://bun.sh) runtime
- [OpenCode](https://opencode.ai) AI coding agent
- One extraction API key: [Anthropic](https://console.anthropic.com) (recommended), [xAI](https://console.x.ai), or [Google](https://aistudio.google.com/apikey)
- [Voyage AI](https://www.voyageai.com) API key (free tier available)

---

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-how-it-works-dark.svg">
  <img src=".github/assets/readme-how-it-works-light.svg" alt="5-step pipeline: You code → Extract → Store → Inject → Remember" width="100%">
</picture>


1. **You code normally.** No commands, no `/save`, nothing to learn.
2. **After every turn**, the plugin extracts typed facts from the conversation and stores them locally in LanceDB.
3. **On every LLM call**, a `[MEMORY]` block is rebuilt into the system prompt with project context, preferences, and semantically relevant memories.
4. **When you switch topics** mid-session, semantic search refreshes to surface different memories.
5. **Across sessions**, the agent picks up where it left off — project decisions, error fixes, your preferences, everything.

All data stays on your machine at `~/.codexfi/`. Nothing is sent anywhere except the embedding and extraction APIs.

---

## Features

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-features-dark.svg">
  <img src=".github/assets/readme-features-light.svg" alt="codexfi Features: Local Storage, Automatic, Typed Memory, Multi-Provider, Compaction-Proof, Privacy Filter" width="100%">
</picture>


- **Fully automatic** — saves after every turn, injects on every call
- **100% local storage** — LanceDB embedded in-process
- **Multi-provider extraction** — Anthropic Haiku (default), xAI Grok, or Google Gemini
- **Code-optimised embeddings** — Voyage `voyage-code-3`
- **Typed memory system** — `architecture`, `error-solution`, `preference`, `progress`, and more
- **Smart deduplication** — cosine similarity prevents duplicates
- **Contradiction handling** — new facts automatically supersede stale ones
- **Compaction-proof** — memory lives in the system prompt, never lost to context truncation
- **Privacy filter** — wrap content in `<private>...</private>` to exclude from extraction
- **Web dashboard** — `codexfi dashboard` for live activity, costs, and memory browser
- **CLI** — `codexfi list`, `search`, `stats`, `export`, `forget`, `status`

---

## Configuration

Config at `~/.config/opencode/codexfi.jsonc`:

```jsonc
{
  "extractionProvider": "anthropic",  // "anthropic", "xai", or "google"
  "voyageApiKey": "pa-...",
  "anthropicApiKey": "sk-ant-...",
  "similarityThreshold": 0.45,       // retrieval cutoff (0-1)
  "maxMemories": 10                  // per scope per session
}
```

---

## Agent instructions (optional)

The plugin works without this, but adding instructions to `~/.config/opencode/AGENTS.md` improves agent behavior — it understands the `[MEMORY]` block, uses the `memory` tool correctly, and never announces memory operations.

See [`plugin/README.md`](./plugin/README.md) for the recommended AGENTS.md snippet.

---

## Privacy

All data stays on your machine. Outbound API calls go only to Voyage AI (embeddings) and your chosen extraction provider (one per turn). Wrap sensitive content in `<private>...</private>` to exclude it entirely.

---

## More

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-benchmark-dark.svg">
  <img src=".github/assets/readme-benchmark-light.svg" alt="Benchmark: 94.5% Overall" width="100%">
</picture>


- **[Plugin internals](./plugin/README.md)** — architecture, data flow, extraction providers, development setup
- **[Benchmark](./benchmark/README.md)** — 94.5% on DevMemBench (200 questions, 8 categories)
- **[E2E tests](./testing/README.md)** — 12 autonomous test scenarios

---

## License

[MIT](./LICENSE)

---

<div align="center">

Built with [OpenCode](https://opencode.ai) · [LanceDB](https://lancedb.com) · [Voyage AI](https://www.voyageai.com) · [Bun](https://bun.sh)

</div>
