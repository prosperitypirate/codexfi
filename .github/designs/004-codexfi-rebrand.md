# Codexfi Rebrand & Launch — Design Document

**Feature**: Rename project to Codexfi, publish npm package, launch product website  
**Issue**: TBD (create after PR #54 merges)  
**Branch**: TBD  
**Status**: PLANNING  
**Created**: February 25, 2026  
**Updated**: February 25, 2026  
**Estimated Duration**: ~1 week across 3 phases  

---

## EXECUTIVE SUMMARY

### The Problem

The project is currently named `opencode-memory`, but:

1. **`opencode-memory` is taken on npm** — someone else published v1.0.3 under that name
2. **The name ties us to OpenCode** — limits future scope (other editors, other agents, standalone API)
3. **No product identity** — it reads like a utility, not a product. Compare `supermemory` vs `opencode-supermemory`
4. **No web presence** — no landing page, no docs site, no brand

### The Solution

Rebrand to **Codexfi** — a standalone product identity with its own domain, npm package, and website.

- **Name**: `codexfi` (npm package, product name, brand)
- **Domain**: `codexfi.com` (already owned)
- **Etymology**: Latin *cōdex* = "bound book" — the first technology for persistent, organized, retrievable knowledge. The "fi" suffix evokes *fidēlis* (faithful/reliable). A codex that never forgets.
- **Install command**: `bunx codexfi install`
- **OpenCode ecosystem listing**: `codexfi` — "Persistent memory across sessions"

### What Changes vs What Stays

| Aspect | Before | After |
|--------|--------|-------|
| npm package name | (blocked — taken) | `codexfi` |
| GitHub repo | `prosperitypirate/opencode-memory` | `prosperitypirate/codexfi` |
| Install command | (none) | `bunx codexfi install` |
| CLI binary name | `opencode-memory` | `codexfi` |
| Config file path | `~/.config/opencode/memory.jsonc` | `~/.config/opencode/codexfi.jsonc` |
| Data directory | `~/.opencode-memory/` | `~/.codexfi/` |
| Log file | `~/.opencode-memory.log` | `~/.codexfi.log` |
| Dashboard title | "opencode-memory" | "Codexfi" |
| Plugin registration | `file:///...plugin-v2` | `file:///...plugin` (after cutover) |
| Slash command | `/memory-init` | `/memory-init` (unchanged — describes action, not brand) |
| Memory tool name | `memory` | `memory` (unchanged — OpenCode SDK interface) |
| Website | none | `codexfi.com` |
| OpenCode ecosystem page | not listed | `codexfi` — Persistent memory across sessions |

### What Does NOT Change

- **Core architecture** — LanceDB, Voyage AI, extraction pipeline, plugin hooks
- **Memory tool API** — `memory({ mode, content, scope, type })` stays the same
- **Data format** — LanceDB schema, costs.json, names.json, activity.json structure
- **Config structure** — same JSONC fields, just different file path
- **OpenCode integration** — still a plugin, still uses 4 hooks, still injects [MEMORY] block

---

## ARCHITECTURE

### Migration Path

The rebrand is a **rename + publish**, not a rewrite. No code logic changes.

```
Current state (PR #54):
  prosperitypirate/opencode-memory
  └── plugin-v2/          ← all source code here
      ├── src/
      ├── dist/
      └── package.json    ← name: "opencode-memory" (placeholder)

After Phase 6 cutover + rebrand:
  prosperitypirate/codexfi
  └── plugin/             ← renamed from plugin-v2/
      ├── src/
      ├── dist/
      └── package.json    ← name: "codexfi"
```

### Data Migration

Users upgrading from `opencode-memory` to `codexfi`:

- **Option A (recommended)**: Fresh start. Memories rebuild naturally in 2-3 sessions.
- **Option B**: Symlink `~/.codexfi → ~/.opencode-memory` to preserve existing data.

No automated migration needed — the memory system is designed to reconstruct itself.

---

## IMPLEMENTATION PHASES

### Phase 1: Cutover & Rename (PR #54 merge + follow-up PR)

**Prerequisite**: PR #54 merges with all Phase 1-5b work.

**1a. Phase 6 cutover** (in PR #54 or immediate follow-up):
- [ ] Delete `backend/`, `frontend/`, `docker-compose.yml`
- [ ] Delete `plugin/` (old v1)
- [ ] Rename `plugin-v2/` → `plugin/`
- [ ] Update CI to reference `plugin/` instead of `plugin-v2/`

**1b. Codexfi rename** (new branch, new PR):
- [ ] `package.json`: `"name": "codexfi"`, `"bin": { "codexfi": "dist/cli.js" }`
- [ ] Update `plugin-config.ts`: config file path → `~/.config/opencode/codexfi.jsonc`
- [ ] Update `config.ts`: `DATA_DIR` → `~/.codexfi`
- [ ] Update `services/logger.ts`: log file → `~/.codexfi.log`
- [ ] Update `cli/index.ts`: banner, help text, command name → `codexfi`
- [ ] Update `cli/commands/install.ts`: output text, next-steps guidance
- [ ] Update `dashboard/html.ts`: title, banner → "Codexfi"
- [ ] Update all `fmt.banner()` calls
- [ ] Rename GitHub repo: `opencode-memory` → `codexfi`
- [ ] Update `.github/designs/` references
- [ ] Update `AGENTS.md` if it references old paths

**Success criteria**: `bunx codexfi install` works. `codexfi list`, `codexfi dashboard`, etc. all function. Data stored in `~/.codexfi/`.

### Phase 2: npm Publish

- [ ] Create npm account (if not exists) or verify ownership
- [ ] `npm publish` (or `bun publish`) from `plugin/` directory
- [ ] Verify `bunx codexfi install` works from a clean machine
- [ ] Verify `bunx codexfi@latest install` pulls correct version
- [ ] Add `"repository"`, `"homepage"`, `"keywords"` to package.json
- [ ] Add npm badge to README

**Success criteria**: Anyone can run `bunx codexfi install` and get a working memory system.

### Phase 3: Website (Stretch Goal)

**Stack**: Static site on Vercel, deployed from `codexfi.com`.

**Pages**:
- **Landing page** (`/`) — hero with one-liner install, feature grid, architecture diagram
- **Docs** (`/docs`) — installation, configuration, CLI reference, dashboard guide
- **API reference** (`/docs/api`) — memory tool modes, config options, environment variables

**Design direction**:
- Dark theme (consistent with dashboard)
- Monospace typography
- Minimal — let the product speak
- Hero: `bunx codexfi install` with terminal animation
- Feature cards: Zero-config, Cross-session, Self-hosted, Observable

**Tech options**:
- **Astro + Starlight** — built for docs sites, fast, Vercel-native
- **Next.js** — overkill for a mostly-static site
- **Plain HTML** — consistent with dashboard philosophy but harder to maintain docs

**Success criteria**: `codexfi.com` loads, looks professional, has install instructions and basic docs.

---

## NAMING DECISION LOG

### Context

The npm package `opencode-memory` is taken (v1.0.3 by `knikolov`/`shuans`). We explored:

| Option | Status | Reason |
|--------|--------|--------|
| `opencode-memory` | Taken | Someone else published it |
| `opencode-mem` | Taken | Also taken |
| `@anomalyco/opencode-memory` | Available | We don't own @anomalyco (that's OpenCode's org) |
| `@prosperitypirate/opencode-memory` | Available | Too long for bunx |
| `oc-memory` | Available | Short but not memorable |
| `codex-memory` | Available | Strong, but two words |
| **`codexfi`** | **Available** | **Short, memorable, ownable domain, product feel** |

### Why "Codexfi"

1. **Etymology**: Latin *cōdex* = persistent organized knowledge. Exactly what we build.
2. **Domain**: `codexfi.com` already owned.
3. **One word**: Like `supermemory`, `notion`, `vercel` — product names, not utility names.
4. **Unscoped**: `bunx codexfi install` — shortest possible install command.
5. **Not boxed in**: Can grow beyond OpenCode to other editors, agents, or standalone use.
6. **Distinct from OpenAI Codex**: "codex" is a common Latin word. "codexfi" is unique. Same way "Notion" coexists with the English word "notion."

---

## RISK ASSESSMENT

| Risk | Impact | Mitigation |
|------|--------|-----------|
| GitHub repo rename breaks links | Low | GitHub auto-redirects old URLs indefinitely |
| Users with existing `~/.opencode-memory/` data | Low | Symlink guide in migration docs; memories rebuild in 2-3 sessions |
| `codexfi` name confusion with OpenAI Codex | Low | Different product category; "codexfi" is a unique compound word |
| npm name squatting on `codexfi` | Medium | Publish ASAP after merge to claim the name |
| Website scope creep | Medium | Phase 3 is explicitly a stretch goal; ship Phases 1-2 first |

---

## TIMELINE

| Phase | Depends On | Duration | Target |
|-------|-----------|----------|--------|
| Phase 1a: Cutover | PR #54 merge | 1 session | Next session |
| Phase 1b: Rename | Phase 1a | 1 session | Same session |
| Phase 2: npm publish | Phase 1b | 30 minutes | Same day |
| Phase 3: Website | Phase 2 | 2-3 sessions | Week after |

---

## OPEN QUESTIONS

1. **Backward compatibility**: Should `codexfi` check for `~/.opencode-memory/` and auto-migrate, or just document the symlink approach?
2. **npm org**: Publish as `codexfi` (unscoped) or `@codexfi/cli`? Recommend unscoped for shortest bunx command.
3. **Website framework**: Astro + Starlight vs plain HTML? Astro is likely the best balance of maintainability and speed.
4. **README scope**: Full docs in README, or minimal README pointing to codexfi.com?
