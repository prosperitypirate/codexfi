# opencode-memory E2E Test Suite

Fully autonomous end-to-end tests for the `opencode-memory` plugin. The agent (not a human) creates isolated project directories, spawns `opencode run` sessions, talks to the agent, inspects the memory backend, and reports pass/fail — zero user interaction required.

## Prerequisites

**1. Memory backend running**
```bash
docker compose up -d
# Verify: curl http://localhost:8020/health
```

**2. OpenCode CLI installed**
```bash
bun install -g opencode-ai
# Verify: opencode --version  (1.2.10+)
```

**3. Plugin built**
```bash
cd plugin && bun run build
```

**4. Plugin configured in `~/.config/opencode/config.json`**
```json
{
  "plugins": ["file:///path/to/opencode-memory/plugin"]
}
```

**5. An AI provider configured** (e.g. Anthropic API key in env or config)

## Running

```bash
cd testing
bun install       # first time only
bun run test      # runs all 10 scenarios
```

Output is printed to stdout with ANSI colours. Each run is also saved to `results/` (gitignored).

## Known issue: OpenCode Desktop app interference

If the OpenCode desktop app is running, it sets `OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME`, and `OPENCODE_CLIENT` in your shell environment. The `opencode run` CLI inherits these and its internal server then requires Basic Auth — but run-mode sends no auth headers, causing every CLI session to fail silently.

**The test harness already handles this automatically** via `cleanEnv()` in `src/opencode.ts`, which strips those three variables before spawning each `opencode run` process. You do not need to close the desktop app.

If you run `opencode run` manually from a terminal where the desktop app is active and see unexpected failures, unset those vars first:
```bash
env -u OPENCODE_SERVER_PASSWORD -u OPENCODE_SERVER_USERNAME -u OPENCODE_CLIENT \
  opencode run "your message" --dir /path/to/project -m anthropic/claude-sonnet-4-6
```

This is a known bug in `opencode` v1.2.10 — tracked at https://github.com/anomalyco/opencode/issues/14532.

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

## Architecture

```
testing/
├── src/
│   ├── runner.ts          — entry point, runs all scenarios sequentially
│   ├── opencode.ts        — spawns opencode run, parses JSON events, cleanEnv()
│   ├── memory-api.ts      — queries localhost:8020, computes project tags
│   ├── report.ts          — ANSI result formatting
│   └── scenarios/
│       ├── 01-cross-session.ts
│       ├── 02-readme-seeding.ts
│       ├── 03-transcript-noise.ts
│       ├── 04-project-brief-always.ts
│       ├── 05-memory-aging.ts
│       ├── 06-existing-codebase.ts
│       ├── 07-enumeration-retrieval.ts
│       ├── 08-cross-synthesis.ts
│       ├── 09-max-memories.ts
│       └── 10-knowledge-update.ts
├── results/               — gitignored; JSON output of each run
├── package.json
└── tsconfig.json
```

## How `opencode run` is used

Each scenario calls:
```bash
opencode run "<message>" --dir <isolated-tmp-dir> -m anthropic/claude-sonnet-4-6 --format json
```

`--format json` emits one JSON event per line. The test harness parses these to extract:
- Session ID
- Full text response (concatenated text parts)
- Exit code and timing

Each scenario gets its own isolated `createTestDir()` directory under `/private/tmp/oc-test-<name>-<uuid>`, so tests never share state.

## Memory tag computation

The plugin identifies each project by hashing the absolute directory path:
```
projectTag = "opencode_project_" + sha256(directory)[:16]
```

The test harness replicates this logic in `memory-api.ts:projectTagForDir()` to query the backend for exactly the memories that the plugin would have written.
