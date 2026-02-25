<div align="center">

# opencode-memory CLI

**Manage your agent's memory from the terminal.**

Browse, search, export, and inspect — everything the plugin does, accessible from the command line.

<br/>

[![8 Commands](https://img.shields.io/badge/Commands-8-22C55E?style=flat)](https://github.com/prosperitypirate/opencode-memory)
[![Zero Dependencies](https://img.shields.io/badge/Zero-Dependencies-CF3CFF?style=flat)](https://github.com/prosperitypirate/opencode-memory)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2-FBF0DF?style=flat&logo=bun&logoColor=black)](https://bun.sh/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Embedded-CF3CFF?style=flat)](https://lancedb.com/)
[![Voyage AI](https://img.shields.io/badge/Voyage_AI-Semantic_Search-5B6BF5?style=flat)](https://www.voyageai.com/)
[![ANSI Colors](https://img.shields.io/badge/ANSI-Color_Output-FF6B35?style=flat)](https://no-color.org/)
[![NO_COLOR](https://img.shields.io/badge/NO__COLOR-Respected-888888?style=flat)](https://no-color.org/)
[![JSON Output](https://img.shields.io/badge/JSON-Machine_Readable-F7DF1E?style=flat)](https://github.com/prosperitypirate/opencode-memory)
[![OpenCode](https://img.shields.io/badge/OpenCode-Plugin_CLI-FF6B35?style=flat)](https://opencode.ai)

</div>

---

## Quick Start

```bash
# From the plugin directory
bun run cli install        # register plugin + create /memory-init command
bun run cli status         # verify everything is working
bun run cli list           # see what the agent remembers
```

Or after building:

```bash
node dist/cli.js install
```

---

## Commands

### `install` — Set up the plugin

Registers the plugin with OpenCode, creates the `/memory-init` slash command, and verifies API keys.

```
$ opencode-memory install

Install
───────────
  - Plugin path: /Users/neo/Development/opencode-memory/plugin-v2

  Step 1 — Register plugin with OpenCode

  ✓ Plugin already registered in opencode.json

  Step 2 — Create slash commands

  ✓ Created /memory-init slash command

  Step 3 — Verify environment

  ✓ VOYAGE_API_KEY set (pa-PNK...)
  ✓ ANTHROPIC_API_KEY set — extraction ready

  ✓ Setup complete!
```

---

### `status` — Health check

Verifies database, API keys, plugin registration, and log file in one glance.

```
$ opencode-memory status

Status
──────────
  ✓ Data directory ~/.opencode-memory
  ✓ LanceDB database ~/.opencode-memory/lancedb
  ✓ Voyage API key set (pa-PNK...)
  ✓ Extraction API key anthropic (sk-ant...)
  ✓ OpenCode plugin registered in opencode.json
  ✓ Log file ~/.opencode-memory.log

  6/6 checks passed — system healthy.
```

```bash
# Machine-readable output for scripting
opencode-memory status --json
```

---

### `list` — Browse memories

Display stored memories in a formatted table with type colors and relative dates.

```
$ opencode-memory list --limit 5

Memories
────────────
  - Scope: project (/Users/neo/my-project)
  - Showing 5 of 5 max

  ID       │ Type           │ Memory                                        │    Updated
  ────────-+-──────────────-+-──────────────────────────────────────────────-+-──────────
  a3f82b10 │ architecture   │ API uses Express with controller/service la…  │      today
  7cd91e44 │ tech-context   │ Stack: TypeScript 5.7, Bun runtime, Zod va…  │  yesterday
  e2b45f88 │ error-solution │ Fixed OOM in batch export — streaming JSON…  │     3d ago
  19ca7721 │ progress       │ Auth module complete, payment integration i…  │     5d ago
  bb302f67 │ preference     │ Always use explicit return types on async f…  │     1w ago
```

```bash
opencode-memory list --user              # user-scoped memories
opencode-memory list --type architecture # filter by type
opencode-memory list --all               # include superseded
opencode-memory list --json              # raw JSON output
```

---

### `search` — Semantic search

Vector search over memories using the same Voyage AI embedding pipeline as the plugin.

```
$ opencode-memory search "how is authentication handled"

  ⠋ Searching project memories...

Search Results
──────────────────
  - Query: "how is authentication handled"
  - Scope: /Users/neo/my-project
  - Found 3 results

  1. 87% █████████████████░░░ architecture 2026-02-20
     Auth uses JWT stored in httpOnly cookies, refresh token rotation every 7 days.
     > The auth middleware validates tokens on every request...
     > Refresh endpoint at /api/auth/refresh handles rotation...

  2. 72% ██████████████░░░░░░ tech-context 2026-02-18
     Session management via express-session backed by Redis, 24h TTL.

  3. 55% ███████████░░░░░░░░░ error-solution 2026-02-15
     Fixed auth redirect loop — middleware was checking cookie before it was set.
```

```bash
opencode-memory search "database migration" --limit 5
opencode-memory search "what bugs were fixed" --user
opencode-memory search "deployment" --json
```

---

### `stats` — Database statistics

Memory counts, type distribution, per-project breakdown, and cumulative API costs.

```
$ opencode-memory stats

Database
────────────
  Total memories: 152
  Active: 140
  Superseded: 12
  Database size: 28.3 MB
  Data directory: ~/.opencode-memory

Memory Types
────────────────
  Type               │  Count │     % │ Distribution
  ──────────────────-+-──────-+-─────-+-────────────────────
  tech-context       │     59 │   42% │ ████████
  architecture       │     26 │   19% │ ████
  learned-pattern    │     19 │   14% │ ███
  project-brief      │     15 │   11% │ ██
  preference         │      7 │    5% │ █
  error-solution     │      6 │    4% │ █

API Costs
─────────────
  Total: $0.5041

  Provider     │  Calls │     Tokens │       Cost
  ────────────-+-──────-+-──────────-+-──────────
  Anthropic    │    274 │     299.9K │    $0.4891
  xAI          │     57 │      63.7K │    $0.0107
  Voyage AI    │    672 │      23.7K │    $0.0043
```

---

### `export` — Export memories

Export all memories for a scope to JSON or CSV. Pipe to a file or use `--output`.

```bash
# JSON to stdout
opencode-memory export --user

# CSV to file
opencode-memory export --format csv --output backup.csv

# Include superseded memories
opencode-memory export --all --output full-backup.json

# Pipe to jq for filtering
opencode-memory export --json | jq '.[] | select(.metadata.type == "architecture")'
```

---

### `dashboard` — Web dashboard

Launch the on-demand web dashboard. Starts a local HTTP server and opens the browser.

```
$ opencode-memory dashboard

  ✓ Initializing database
  ✓ Dashboard running at http://localhost:9120
  - Press Ctrl+C to stop
```

The dashboard shows real-time stats, API costs, activity feed, memory type distribution,
recent memories, project/scope breakdown, and semantic search — all in a single self-contained
HTML page with no external dependencies.

```bash
opencode-memory dashboard --port 3000   # custom port
opencode-memory dashboard --no-open     # don't auto-open browser
```

---

### `forget` — Delete a memory

Delete by full UUID or short prefix. Ambiguous prefixes are rejected with a list of matches.

```
$ opencode-memory forget a3f8

  - Deleting: a3f82b10-7e4a-4c91-b892-3d5f8a2e1c09
  - Content: API uses Express with controller/service layer pattern, routes in src/routes/

  ✓ Memory deleted.
```

```
$ opencode-memory forget a3

  ✗ Prefix "a3" matches 4 memories. Be more specific:

  - a3f82b10 API uses Express with controller/service layer pattern...
  - a3b91c22 Auth middleware validates JWT on every request...
  - a30e7f55 API versioning via /v1/ prefix, no content negotiation...
  - a3119d88 Rate limiting at 100 req/min per IP via express-rate-limit...
```

---

## Global Flags

Every command supports these flags:

| Flag | Description |
|---|---|
| `--json` | Machine-readable JSON output (suppresses formatting) |
| `--help`, `-h` | Show help for the current command |
| `--version` | Print version and exit |

---

## Architecture

```
src/cli/
├── index.ts                — entry point, command router, help text
├── fmt.ts                  — ANSI colors, tables, spinners, layout (zero deps)
├── args.ts                 — argument parser (zero deps)
├── shared.ts               — DB init + tag resolution shared utilities
└── commands/
    ├── install.ts          — plugin registration + slash command creation
    ├── list.ts             — formatted memory table with type colors
    ├── search.ts           — semantic search with similarity bars
    ├── stats.ts            — DB stats, type distribution, API costs
    ├── status.ts           — health check (6 verifications)
    ├── export.ts           — JSON/CSV export with RFC 4180 quoting
    ├── forget.ts           — delete by ID with prefix resolution
    └── dashboard.ts        — web dashboard launcher

src/dashboard/
├── server.ts               — Bun.serve() HTTP server + JSON API endpoints
└── html.ts                 — self-contained HTML dashboard (single string)
```

**Design principles:**

- **Zero external dependencies** — ANSI colors via escape codes, table layout by hand, arg parsing from scratch
- **Lazy command loading** — each command is a dynamic `import()`, so `help` and `--version` are instant
- **Dual output** — every command renders both human-friendly (ANSI tables, spinners) and machine-friendly (`--json`)
- **`NO_COLOR` respected** — follows the [no-color.org](https://no-color.org/) convention; falls back to ASCII on dumb terminals
- **Same store** — reads/writes the exact same LanceDB database as the plugin, using the same tag computation

---

<div align="center">

Part of [opencode-memory](../README.md) — persistent, self-hosted memory for OpenCode agents.

</div>
