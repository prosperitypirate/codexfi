# Design Doc 010 — Richer [MEMORY] Block

**Status**: PENDING  
**Created**: 2026-03-31  
**Branch**: `feat/richer-memory-block`  
**Author**: Clark Balan

---

## Quick Start for Implementors

If you're picking this up from a new session, here's the order of operations:

1. **Branch:** `git checkout feat/richer-memory-block` (already created)
2. **Read this entire doc** — especially Investigation Findings and Decision Log
3. **Phase 0 first:** Build the Tier 2 benchmark tool and run baselines BEFORE any plugin changes
4. **Phases 1–6:** Plugin changes (each phase is independently committable)
5. **Phase 7:** Tests + benchmark re-runs to validate improvement
6. **Commit per phase** with message referencing this design doc (e.g., `feat(plugin): add active-context memory type (010 Phase 1)`)
7. **PR:** feature branch → `main`, assigned to `clarkbalan`, labeled

**Key constraint:** All phases share the `feat/richer-memory-block` branch. Phase 0 builds benchmark tooling; Phases 1–7 modify the plugin. Each phase should be committed separately to enable per-phase rollback.

**Important project rules:**
- Never push directly to `main` — always PR
- All PRs assigned to `clarkbalan` with labels
- All database queries use parameterized statements (see `validateId()` in `config.ts:30`)
- Use `bun` as package manager, not npm/yarn

---

## Executive Summary

### Problem

The current `[MEMORY]` block injected into the system prompt is too sparse to give a coding agent the contextual depth it needs to work effectively across sessions. Key sections are one- or two-bullet summaries. There is no "active context" — no current work focus, no system state, no next steps. Architecture docs contain descriptions but no code patterns. The "Last Session" is a single line.

The contrast with file-based memory systems (e.g., Cline's `memory-bank/`) makes the gap concrete: a Cline agent landing cold on a project reads 236 lines of `activeContext.md` and immediately knows what was just built, what's running, what's broken, what to do next. A codexfi agent landing cold reads a handful of bullets and has to reconstruct context from scratch.

This is the #1 source of continuity friction for users transitioning from file-based memory workflows.

### Solution

Enrich the `[MEMORY]` block by:

1. **Adding an `## Active Context` section** — a dedicated memory type (`active-context`) that tracks current work focus, system state, pending decisions, and next steps. This is the highest-value section Cline has that codexfi entirely lacks.
2. **Setting minimum token budgets per section** — sections currently allowed to degrade to a single bullet get a floor. If a section has fewer than N bytes of content, it signals that memories for that type need to be enriched.
3. **Upgrading `## Last Session` to `## Recent Sessions`** — show the last 3 session summaries, not just 1, with condensed entries for older ones.
4. **Adding code patterns to `## Architecture`** — a new sub-type `architecture-pattern` that stores "how to do X in this codebase" recipes, shown alongside descriptive architecture memories.
5. **Raising the semantic similarity display threshold** — filter out `< 0.60` similarity results from `## Relevant to Current Task` to reduce noise.
6. **Exposing `active-context` as a first-class memory type** — with its own aging rule: only the latest survives (like `progress`), and extraction prompts are updated to recognize and extract active context signals.

### Why It Works

- **No new infrastructure** — LanceDB, Voyage AI, the hook system, and the assembly pipeline all stay the same. This is configuration and logic changes only.
- **Backwards compatible** — projects with no `active-context` memories simply render no section (same as today's missing sections). The enrichment is additive.
- **Token efficient** — target total block size ≤ 8K tokens (vs. Cline's 67K file dump). Each section gets a budget floor, not a ceiling increase.
- **Automatic** — users never `/save` anything. Active context is extracted per-turn by the existing auto-save pipeline, just targeting the new type.

---

## Current State

### [MEMORY] Block Assembly Pipeline

```
User message
    │
    ▼
chat.message hook (index.ts:637)
    │
    ├── Turn 1: 4 parallel LanceDB queries → populate SessionMemoryCache
    │     ├── getProfile(tags.user)              → cache.profile
    │     ├── searchMemories(msg, tags.user)      → cache.userSemanticResults
    │     ├── listMemories(tags.project, 30)      → cache.structuredSections (byType map)
    │     └── searchMemories(msg, tags.project)   → cache.projectSemanticResults
    │
    └── Turn 2+: semantic-only re-search
          └── searchMemories(msg, tags.project)   → cache.projectSemanticResults (replaced)
                                                     (full refresh if needsStructuredRefresh)

    ▼
experimental.chat.system.transform hook (index.ts:593)
    │
    └── formatContextForPrompt(cache.*) → [MEMORY] string → output.system.push(...)
```

### Key Files

| File | Purpose | Key Lines |
|------|---------|-----------|
| `plugin/src/services/context.ts` | `[MEMORY]` block assembly | 37–134 |
| `plugin/src/index.ts` | Hooks, cache management, refresh triggers | 238–895 |
| `plugin/src/store.ts` | LanceDB search, list, ingest, aging rules | 166–623 |
| `plugin/src/config.ts` | `STRUCTURED_SECTIONS`, thresholds, limits | 37–195 |
| `plugin/src/plugin-config.ts` | User-facing config defaults | 77–87 |
| `plugin/src/prompts.ts` | Extraction prompts for all memory types | 8–207 |
| `plugin/src/services/auto-save.ts` | Per-turn extraction, session summaries | 65–266 |

### Current Section Definitions (`context.ts:37–43`)

```typescript
const STRUCTURED_SECTIONS: Array<{ label: string; types: string[] }> = [
  { label: "Project Brief",    types: ["project-brief", "project-config"] },
  { label: "Architecture",     types: ["architecture"] },
  { label: "Tech Context",     types: ["tech-context"] },
  { label: "Product Context",  types: ["product-context"] },
  { label: "Progress & Status", types: ["progress"] },
];
const SESSION_SUMMARY_TYPES = ["session-summary", "conversation"];
```

### Current Section Rendering

Each section renders as:
```
## Section Label
- memory content 1
- memory content 2
```

No minimum content enforcement. No per-section ordering. No code snippet rendering.

### Current Limits

| Limit | Default | Location |
|-------|---------|----------|
| `maxStructuredMemories` | 30 | `plugin-config.ts:81` |
| `maxMemories` (semantic) | 20 | `plugin-config.ts:79` |
| `maxProfileItems` | 5 | `plugin-config.ts:82` |
| `similarityThreshold` | 0.45 | `plugin-config.ts:83` |
| Snippet truncation | 400 chars | `context.ts:124` |
| Session summaries kept | 3 | `store.ts:250` |

### What's Missing Today

| Gap | Impact |
|-----|--------|
| No `active-context` memory type | Agent has no idea what was just built, what's running, what to do next |
| Single `## Last Session` line | Session continuity is near-zero |
| Architecture = description only | Agent can't follow "how to add a feature" patterns |
| 0.45 semantic threshold | `## Relevant to Current Task` contains 50–60% similarity noise |
| No per-section minimum | Sections degrade to 1 bullet with no signal that they're sparse |
| `maxStructuredMemories: 30` total | All types share a single budget; important types get crowded out |

---

## Architecture

### New [MEMORY] Block Structure (Target)

```
[MEMORY]

## Project Brief                       (~500 tokens)
  project-brief + project-config memories

## Architecture                        (~800 tokens)
  architecture + architecture-pattern memories
  (patterns render as fenced code blocks when detected)

## Tech Context                        (~400 tokens)
  tech-context memories
  (commands rendered as inline code)

## Product Context                     (~400 tokens)
  product-context memories

## Active Context                      (~1,500 tokens)  ← NEW
  active-context memories (single latest, full detail)
  Contains: current work focus, system state, tech debt, next steps

## Recent Sessions                     (~600 tokens)    ← UPGRADED
  Last 3 session summaries (condensed entries for older ones)

## User Preferences                    (~400 tokens)
  User-scoped preference + learned-pattern memories

## Relevant to Current Task            (~1,200 tokens)
  Semantic search results (threshold raised to 0.60)
```

**Total target: ~5,800 tokens** — ~3× richer than today, ~10× more efficient than Cline's 67K dump.

### Data Flow Changes

```
                    CURRENT                              TARGET
                    ───────                              ──────
listMemories(30)    → byType map                  listMemories(50)   → byType map
                                                       +
                                                  (active-context resolved separately,
                                                   latest-only, not counted in shared budget)

formatContextForPrompt(...)                       formatContextForPrompt(...)
  STRUCTURED_SECTIONS loop                          STRUCTURED_SECTIONS loop (extended)
  Last Session (1 item)                             Recent Sessions (up to 3 items)
  User Preferences (5 items)                        User Preferences (8 items)
  Relevant (threshold 0.45)                         Relevant (threshold 0.60)
```

### New Memory Type: `active-context`

**Purpose:** Replaces the need for a manually-maintained `activeContext.md`. Stores the current session's work focus, system state, decisions, and next steps in a single rich memory.

**Aging rule:** Same as `progress` — only the latest active-context memory survives per project. When a new one is inserted, all previous ones are deleted (`store.ts:ageActiveContext`).

**Storage shape:**
```typescript
{
  memory: "Active focus: [what's being worked on]\nSystem state: [what's running]\nNext steps: [ordered list]\nTech debt: [known issues]",
  metadata: { type: "active-context", date: "YYYY-MM-DD" }
}
```

**Extraction trigger:** No dedicated trigger needed. The existing auto-save pipeline (`auto-save.ts:149`) already sends the full conversation to `store.ingest()` on every terminal assistant message. The extraction LLM decides which types to emit — adding `active-context` to the `EXTRACTION_SYSTEM` prompt is sufficient. See Finding 1 for full investigation.

### New Memory Sub-type: `architecture-pattern`

**Purpose:** Stores "how to do X" recipes with actual code. Separate from descriptive `architecture` memories so they don't crowd out system descriptions.

**Example content:**
```
How to add a new API endpoint:
1. Add route in `src/main.py`
2. Use `Depends(get_current_token)` for auth
3. Follow `fetch_oura_data()` pattern for external API calls
```

**Aging rule:** Standard versioning — supersede on contradiction, not singleton.

**Rendered in `## Architecture` section** alongside descriptive architecture memories, with a `> pattern:` prefix to distinguish them visually.

### Similarity Threshold Change

`similarityThreshold: 0.45 → 0.60` for the `## Relevant to Current Task` display threshold.

This only affects which results are *shown* in the [MEMORY] block. The underlying search still retrieves at 0.45 (full results available for other uses). The rendering filter in `context.ts` will check `similarity >= 0.60` before including in the section.

This is a separate config key: `displaySimilarityThreshold: 0.60` (distinct from `similarityThreshold: 0.45` which controls retrieval).

### Recent Sessions (Upgraded Last Session)

Currently: `## Last Session` shows only 1 item — the single most recent `session-summary` or `conversation` memory.

Target: `## Recent Sessions` shows up to 3, sorted newest-first:
- **Latest** (most recent): full text
- **2nd**: condensed to ~100 words
- **3rd**: condensed to ~50 words (date + impact + lesson)

The condensation is done at render time (not stored), using character truncation + summary suffix, not an LLM call (no latency cost).

---

## Investigation Findings

The following unknowns were identified after the initial draft and resolved through deep code review.

### Finding 1: Tool-Call Detection is NOT Possible in auto-save.ts — But NOT Needed

**Investigation:** Read `auto-save.ts:149–211`, `index.ts:1140–1202`, and the `Part` type from `@opencode-ai/sdk`.

**Facts discovered:**
- `auto-save.ts` receives `cachedMessages: CachedMessage[]` where each entry is `{ info: Message, parts: Part[] }`.
- The pipeline at `auto-save.ts:158–163` filters parts to `type === "text" && !synthetic` — **no tool-call parts pass through**.
- The `message.updated` event at `index.ts:1155–1162` filters `info.finish !== "tool-calls"` — auto-save only fires on **terminal** assistant messages (not mid-turn tool-call messages).
- There is no property on `info` or `parts` that indicates whether the broader turn included tool calls. The auto-save hook has no visibility into tool usage.

**Impact on design:** The original Phase 1 proposed "only extract `active-context` on turns where the assistant used file-editing or bash tools." This is **not implementable** without plumbing new data through the pipeline.

**Revised approach:** Drop the tool-call trigger entirely. Instead, add `active-context` as a new type in `EXTRACTION_SYSTEM` prompt (`prompts.ts:8–65`). The extraction LLM already reads the full conversation text and decides which types to emit per turn. It will naturally extract `active-context` when the conversation contains implementation work (file edits, bash commands, architectural decisions) and skip it for purely conversational turns.

This is simpler, requires fewer code changes, and leverages the extraction LLM's existing intelligence. The `ageActiveContext` singleton rule ensures only the latest survives regardless of extraction frequency.

**Auto-save.ts changes needed:** None. The existing `extractAndSave()` at line 149 already calls `store.ingest()` with the conversation text. The extraction LLM will produce `active-context` memories when appropriate. The only change is adding the type to `prompts.ts`.

### Finding 2: Extraction Prompt Pattern is Proven and Clean

**Investigation:** Read `prompts.ts:8–65` (`EXTRACTION_SYSTEM`), `prompts.ts:78–102` (`INIT_EXTRACTION_SYSTEM`), and `prompts.ts:115–137` (`SUMMARY_SYSTEM`).

**Facts discovered:**
- `EXTRACTION_SYSTEM` defines 10 memory types with detailed descriptions, anti-patterns, and usage guidance.
- Each type has 2–4 lines of description explaining when to use and when NOT to use.
- The LLM returns `[{"memory": "...", "type": "..."}]` — no structural change needed to add new types.
- `INIT_EXTRACTION_SYSTEM` (for auto-init from project files) defines a subset of 5 types — this does NOT need `active-context` since there's no "session" to have context about from static files.

**Impact on design:** Adding `active-context` and `architecture-pattern` to `EXTRACTION_SYSTEM` is a straightforward text addition following the exact same pattern as the existing 10 types. Confidence: **9/10**.

### Finding 3: Current [MEMORY] Block is ~4,808 bytes / ~1,200 tokens

**Investigation:** Measured the exact [MEMORY] block from the current session (without the "Relevant to Current Task" section, which varies per-message).

**Facts discovered:**
- Structured sections (Project Brief through User Preferences): **~4,808 bytes**
- At ~4 chars/token: **~1,200 tokens**
- With "Relevant to Current Task" (typically 5–10 results): **~1,500–2,000 tokens total**
- The design doc's original estimate of "~1,800 tokens" is confirmed accurate.

**Impact on design:** The target of ~5,000–8,000 tokens is realistic and represents a genuine 3–4x enrichment. No change needed.

### Finding 4: Per-Type Soft Caps Work Correctly with LanceDB Fetch

**Investigation:** Read `store.list()` at `store.ts:533–576` and the `byType` grouping loop at `index.ts:731–743`.

**Facts discovered:**
- `store.list()` uses a zero-vector query to scan all rows, filtered by `user_id` and `superseded_by = ''`.
- It fetches up to **10,000 rows**, sorts by `updated_at DESC` in JavaScript, then slices to `limit` (default 30).
- **All memory types** are returned in a single query. There is no type-based filtering at the LanceDB level.
- The `byType` grouping at `index.ts:731–743` partitions the results by `metadata.type` into a `Record<string, StructuredMemory[]>`.

**Concern resolved:** The worry was "if one type has many recent updates, does LanceDB's `updated_at DESC` sort starve other types before reaching the JS cap?" Answer: **Yes, this CAN happen** with `limit=30`. If a project has 25 `architecture` memories all recently updated, only 5 slots remain for other types. Raising to `limit=50` and applying per-type soft caps in JS after grouping solves this correctly.

**Key detail:** The zero-vector workaround fetches ALL matching rows (up to 10K) before the JS `slice(0, limit)`. The `limit` only controls how many are returned, not how many are scanned. So raising `maxStructuredMemories` from 30→50 has **zero impact on LanceDB scan performance** — the scan is already 10K rows.

### Finding 5: DevMemBench Covers Active Context Recall Extensively

**Investigation:** Read `benchmark/src/dataset/questions.json` (200 questions), `benchmark/src/types.ts` (category definitions), and `benchmark/src/prompts/index.ts` (judge prompts).

**Facts discovered:**
- The `session-continuity` category (25 questions) **directly tests active context recall**:
  - "What was accomplished in the project status session on January 25?"
  - "What's left before we can launch — what's still pending across both projects?"
  - "What's our API versioning strategy and when are deprecated routes being shut off?"
- The `knowledge-update` category (25 questions) tests **temporal state awareness** — knowing the LATEST value when facts changed over time.
- The `cross-session-synthesis` category (25 questions) tests **combining facts from multiple sessions** to describe current state.
- **75/200 questions (37.5%) directly measure dimensions of active context recall.**
- 4 specialized judge prompts exist: default, abstention, knowledge-update, preference. The default judge is used for `session-continuity`.

**Impact on design:** Phase 7's benchmark gate is **strong**. The `session-continuity` category alone provides 25 targeted questions. If `active-context` extraction improves session recall, we will see it directly in this category's score. No new benchmark scenarios needed.

---

## Evaluation Strategy

### The Measurement Gap

DevMemBench tests **retrieval quality** — "can we find the right memory given a question?" It does NOT test what actually matters to the user: **"does the agent land cold in a new session and immediately know what's going on?"**

The real user experience is:

```
New session starts
    → [MEMORY] block assembled from stored memories via formatContextForPrompt()
    → Agent reads it as system prompt context
    → Agent works effectively (or doesn't)
```

DevMemBench tests the extraction and search steps. It skips the formatting/presentation step entirely — questions are answered using raw search results, not the assembled `[MEMORY]` block. So even if benchmark scores go up, we have no direct proof the agent's experience improved.

### Three-Tier Evaluation

#### Tier 1: Regression Gate (DevMemBench — exists today)
- Run before and after implementation
- Scores must not decrease in any category
- Proves we didn't break extraction or retrieval
- **Limitation:** doesn't test the `[MEMORY]` block format or presentation quality

#### Tier 2: Block Quality Evaluation (NEW — built in Phase 0)
A new benchmark mode that tests the actual presentation layer end-to-end:

1. **Ingest** all 25 sessions (same as Tier 1)
2. **Assemble a `[MEMORY]` block** using `formatContextForPrompt()` — the real function the plugin uses
3. **Give that block** to an answering LLM as system context (no per-question search — the agent only sees what the block provides)
4. **Ask the same 200 questions**
5. **Judge answers** using the same judge prompts

This directly measures: given the memories we have, does the **formatted block** contain enough structured context for an agent to answer project questions correctly?

**Key insight:** The delta between Tier 1 (per-question search) and Tier 2 (block-only) reveals how much information is **lost** in the formatting/presentation step. Today that gap is likely large (sparse sections, single Last Session line, noisy semantic results). After our changes, it should shrink measurably.

**Implementation:** A new pipeline mode in `benchmark/src/pipeline/` that:
- Reuses the existing ingest phase
- Replaces the search phase with a `formatContextForPrompt()` call (imports from `plugin/src/services/context.ts`)
- Replaces the answer phase to inject the block as system context instead of per-question search results
- Reuses the existing evaluate and report phases
- Reports scores separately as "block-quality" results alongside standard "retrieval" results

#### Tier 3: Structured Dogfooding (manual, post-merge)

A checklist-based evaluation on 3 real projects:

```
Session Continuity Test:
1. Work a real coding session (≥5 turns, real implementation)
2. End session
3. Start fresh session on same project
4. WITHOUT re-explaining anything, ask: "what should I work on next?"
5. Score the response:
   [ ] Agent knows the project (brief, stack, architecture)     /1
   [ ] Agent knows what was just built (active context)          /1
   [ ] Agent knows what to do next (next steps)                  /1
   [ ] Agent follows project patterns without being told         /1
   [ ] Agent knows recent decisions and their rationale          /1
                                                         Total: /5
```

Score: X/5 per project. Run before and after on the same 3 projects.

### Benchmark Run Plan

| When | What | Purpose |
|------|------|---------|
| Phase 0 complete | Tier 1 baseline + Tier 2 baseline | Establish before-scores on `main` branch |
| After Phase 6 (all plugin changes done) | Tier 1 re-run + Tier 2 re-run | Measure improvement before writing tests |
| After Phase 7 (tests pass) | Tier 1 final + Tier 2 final | Confirm no regressions from test changes |
| Post-merge (manual) | Tier 3 dogfooding | Qualitative validation on real projects |

**Success criteria:**
- Tier 1: No category regression > 2%
- Tier 2: Block-quality score improves (any amount) in `session-continuity`, `knowledge-update`, and `cross-session-synthesis` categories
- Tier 2: Gap between Tier 1 and Tier 2 scores shrinks (proves better presentation)
- Tier 3: ≥ 4/5 on at least 2 of 3 projects

---

## Implementation Phases

### PHASE 0: Block Quality Evaluation Tool (Tier 2 Benchmark Mode)

**Goal**: Build a new benchmark mode that measures how well the assembled `[MEMORY]` block serves an agent, and establish baseline scores before making any plugin changes.  
**Duration**: 3–4 hours  
**Dependencies**: None (runs against current `main` code)  
**Status**: PENDING

**Deliverables:**
- [ ] `benchmark/src/pipeline/block-quality.ts` — New pipeline phase: calls `formatContextForPrompt()` (imported from plugin) with ingested memories to assemble a `[MEMORY]` block. Passes the block as system context to the answering LLM.
- [ ] `benchmark/src/pipeline/answer.ts` — Add a `blockOnly` mode: instead of injecting per-question search results, inject the pre-assembled `[MEMORY]` block as the sole context. The LLM answers from what the block provides.
- [ ] `benchmark/src/index.ts` — Add `--mode block-quality` CLI flag to run the Tier 2 pipeline instead of standard retrieval pipeline.
- [ ] `benchmark/src/types.ts` — Extend `BenchmarkReport` with `mode: "retrieval" | "block-quality"` field to distinguish result types.
- [ ] `benchmark/src/pipeline/report.ts` — Include `mode` in report output. When both retrieval and block-quality results exist, compute the **gap** (retrieval score minus block-quality score) per category.
- [ ] Run Tier 1 baseline: `bun run benchmark` → save report as `data/runs/baseline-retrieval/report.json`
- [ ] Run Tier 2 baseline: `bun run benchmark --mode block-quality` → save report as `data/runs/baseline-block-quality/report.json`
- [ ] Record baseline scores in this design doc (Metrics section)

**Success Criteria:**
- `--mode block-quality` runs end-to-end with all 200 questions
- Report includes per-category scores for block-quality mode
- Baseline scores recorded in design doc Metrics table
- Standard retrieval mode (`bun run benchmark`) is unaffected

**Implementation Notes:**
- `formatContextForPrompt` is a pure function with no side effects (see `context.ts:47`). It takes 4 arguments: `profile`, `userMemories`, `semanticResults`, and `byType`. The block-quality pipeline needs to populate these from ingested data the same way `index.ts:686–774` does during Turn 1 cache population.
- The block-quality answer prompt should be: "You are an AI coding agent. The following is your project memory context. Answer the question using ONLY the information in this context. If the context does not contain the answer, say you don't know." This isolates the test to what the block provides.
- The `[MEMORY]` block for Tier 2 should be assembled ONCE after ingesting all sessions (simulating a new session start), not per-question. This reflects real usage: the agent gets one block at session start and works from it.
- For the semantic search portion of the block ("Relevant to Current Task"), we need to decide what query to use. Option: use each question as the query (simulates the per-turn refresh). This means the block changes per question — realistic since `projectSemanticResults` refresh every turn.

---

### PHASE 1: `active-context` Memory Type

**Goal**: Add `active-context` as a first-class type — aging, extraction, and rendering in a new `## Active Context` section.  
**Duration**: 2–3 hours  
**Dependencies**: None  
**Status**: PENDING

**Deliverables:**
- [ ] `plugin/src/store.ts` — Add `ageActiveContext()` function (same pattern as `ageProgress`, lines 236–248). Only the latest `active-context` per project survives. Implementation: call `getMemoriesByType(userId, "active-context")`, delete all rows where `id !== newId`.
- [ ] `plugin/src/store.ts` — Add `"active-context"` case to `applyAgingRules()` at line 226–234 (alongside existing `"progress"` and `"session-summary"` cases).
- [ ] `plugin/src/config.ts` — Add `"active-context"` to `VERSIONING_SKIP_TYPES` set at line 136 (prevents dedup/contradiction check on ingest, same as `progress`).
- [ ] `plugin/src/prompts.ts` — Add `active-context` type definition to `EXTRACTION_SYSTEM` (line ~35, alongside the other 10 types). Description: "Current work focus — what is being built right now, what files are changing, system state, immediate next steps, known blockers. Write as a rich snapshot (3-6 sentences). Only extract when the conversation shows active implementation work, not for questions or discussions."
- [ ] `plugin/src/services/context.ts` — Add `{ label: "Active Context", types: ["active-context"] }` to `STRUCTURED_SECTIONS` array at line 37, positioned after "Progress & Status". Add a 2,000-char render cap for this section to prevent oversized memories from bloating the block.

**Success Criteria:**
- After a coding session, `memory list` shows a single `active-context` memory with current focus
- `[MEMORY]` block shows `## Active Context` section with rich content
- Second session of the same project shows the previous session's work context
- Only 1 `active-context` memory exists per project at any time

**Implementation Notes:**
- `ageActiveContext` is a direct copy of `ageProgress` (lines 236–248) with `"progress"` replaced by `"active-context"`.
- **No changes needed to `auto-save.ts`** — the existing `extractAndSave()` pipeline at line 149 already sends the full conversation to `store.ingest()`, which calls the extraction LLM. Adding `active-context` to `EXTRACTION_SYSTEM` is sufficient; the LLM decides when the conversation warrants it (see Finding 1).
- The extraction LLM naturally skips `active-context` on conversational turns (greetings, questions) because the prompt says "only extract when the conversation shows active implementation work."
- The `STRUCTURAL_DEDUP_DISTANCE` (0.25) should NOT apply to `active-context` — add it to `VERSIONING_SKIP_TYPES` instead, since the singleton aging rule handles lifecycle.

---

### PHASE 2: `architecture-pattern` Sub-type

**Goal**: Add `architecture-pattern` as a storage type, render it in `## Architecture` with visual distinction.  
**Duration**: 1–2 hours  
**Dependencies**: Phase 1 complete  
**Status**: PENDING

**Deliverables:**
- [ ] `plugin/src/services/context.ts` — Update `STRUCTURED_SECTIONS` Architecture entry: `types: ["architecture", "architecture-pattern"]`. Render `architecture-pattern` items with `> ` prefix to distinguish from descriptions.
- [ ] `plugin/src/prompts.ts` — Add extraction guidance: when the agent establishes a repeatable implementation pattern (how to add X, how to configure Y), extract as `architecture-pattern`.
- [ ] `plugin/src/config.ts` — Add `"architecture-pattern"` to `STRUCTURED_TYPES` set.

**Success Criteria:**
- A pattern like "how to add a new endpoint" is stored as `architecture-pattern`
- It renders in `## Architecture` with a `>` prefix
- It does not crowd out descriptive architecture memories (both appear)

---

### PHASE 3: `## Recent Sessions` Upgrade

**Goal**: Replace single `## Last Session` with `## Recent Sessions` showing last 3 summaries.  
**Duration**: 1 hour  
**Dependencies**: None (independent)  
**Status**: PENDING

**Deliverables:**
- [ ] `plugin/src/services/context.ts` — Update the session summary rendering block (currently lines 72–88). Instead of taking only the single most recent item, take up to 3, sorted newest-first.
- [ ] `plugin/src/services/context.ts` — Apply condensation at render time: latest = full text; 2nd = truncate at 600 chars + "..."; 3rd = truncate at 300 chars + "...". Change section header from `## Last Session` to `## Recent Sessions`.

**Success Criteria:**
- `## Recent Sessions` shows up to 3 entries after multiple sessions
- Latest entry is full-length; older entries are condensed
- Single-session projects still show 1 entry cleanly
- No LLM call added (pure string truncation)

---

### PHASE 4: Display Similarity Threshold

**Goal**: Raise the similarity floor for `## Relevant to Current Task` display to 0.60 to reduce noise.  
**Duration**: 30 minutes  
**Dependencies**: None (independent)  
**Status**: PENDING

**Deliverables:**
- [ ] `plugin/src/plugin-config.ts` — Add `displaySimilarityThreshold: 0.60` as a new user-configurable field (separate from `similarityThreshold: 0.45` which controls retrieval).
- [ ] `plugin/src/services/context.ts` — In the semantic results rendering loop (~line 113), filter `allSemantic` by `similarity >= PLUGIN_CONFIG.displaySimilarityThreshold` before rendering.
- [ ] `plugin/src/config.ts` — Add `displaySimilarityThreshold` to the config parsing/validation.

**Success Criteria:**
- Memories with < 60% similarity no longer appear in `## Relevant to Current Task`
- High-relevance memories (≥ 60%) still appear as before
- Config key documented in user-facing config schema

---

### PHASE 5: Per-Type Memory Budget Increase

**Goal**: Increase `maxStructuredMemories` and add per-type priority to prevent important types from being crowded out.  
**Duration**: 1–2 hours  
**Dependencies**: Phases 1 and 2 complete  
**Status**: PENDING

**Deliverables:**
- [ ] `plugin/src/plugin-config.ts` — Increase `maxStructuredMemories` default from 30 → 50.
- [ ] `plugin/src/index.ts` — In the `byType` grouping loop (~line 731), apply per-type soft caps: `project-brief`/`project-config` ≤ 8 total; `architecture`/`architecture-pattern` ≤ 12 total; `tech-context` ≤ 8; `product-context` ≤ 8; `progress` ≤ 1 (aging handles this); `active-context` ≤ 1 (aging handles this). These are soft caps (truncate excess), not hard LanceDB filters.
- [ ] `plugin/src/plugin-config.ts` — Increase `maxProfileItems` from 5 → 8 (User Preferences section was too sparse).

**Success Criteria:**
- No single memory type dominates the structured section budget
- `active-context` always appears (not crowded out by accumulated `architecture` entries)
- Total [MEMORY] block stays under ~8K tokens on mature projects

---

### PHASE 6: Extraction Prompt Updates

**Goal**: Update extraction prompts to actively produce `active-context` and `architecture-pattern` memories, and improve density of existing types.  
**Duration**: 2–3 hours  
**Dependencies**: Phases 1 and 2 complete  
**Status**: PENDING

**NOTE**: Phases 1 and 2 each add a type definition to `EXTRACTION_SYSTEM`. This phase focuses on **quality refinements** to the full prompt — making existing types richer, adding examples, and tuning guidance.

**Deliverables:**
- [ ] `plugin/src/prompts.ts` — Add examples to `active-context` type definition (added in Phase 1): show a sample 3–6 sentence snapshot with file paths, system state, and next steps.
- [ ] `plugin/src/prompts.ts` — Add examples to `architecture-pattern` type definition (added in Phase 2): show a sample "how to add X" recipe with numbered steps.
- [ ] `plugin/src/prompts.ts` — Refine `tech-context` guidance (currently line 42–44): add "Include the actual command to run, port number, or file path — not just a description. E.g., 'Backend runs on port 8000, start with `uvicorn src.main:app --reload`' not 'Backend uses FastAPI'."
- [ ] `plugin/src/prompts.ts` — Refine `architecture` guidance (currently line 41): add "Capture the 'why' behind design decisions. E.g., 'Uses cookie-based auth (HttpOnly, 1yr) because it survives page refreshes without JS token management' not just 'Uses cookie-based auth'."
- [ ] `plugin/src/prompts.ts` — Add global instruction: "When extracting, prefer actionable over descriptive. A fact that tells the agent HOW to do something is more valuable than a fact that tells the agent something EXISTS."

**Success Criteria:**
- New coding sessions produce `active-context` memories automatically
- `architecture-pattern` memories appear for established patterns
- `tech-context` memories include actionable details (commands, ports, paths)
- Extraction quality measured via benchmark run (see Metrics)

**Implementation Notes:**
- The extraction prompt is currently ~650 tokens. Adding 2 type definitions (~100 tokens each) and examples (~150 tokens) brings it to ~1,000 tokens. This is well within the `MAX_CONTENT_CHARS = 8,000` input limit (`config.ts:192`) and `LLM_MAX_TOKENS = 2,000` output limit (`config.ts:198`).
- `INIT_EXTRACTION_SYSTEM` (line 78) does NOT need `active-context` or `architecture-pattern` — these only make sense in conversation context, not static file analysis.

---

### PHASE 7: Tests and Evaluation

**Goal**: Validate the richer block doesn't break existing behavior and demonstrably improves context quality across all three evaluation tiers.  
**Duration**: 3–4 hours  
**Dependencies**: All phases 1–6 complete  
**Status**: PENDING

**Deliverables:**

Unit tests (formatting/rendering — NOT covered by benchmark):
- [ ] `testing/unit/` — `active-context` aging: insert 3 `active-context` memories, verify only the latest survives after aging
- [ ] `testing/unit/` — `architecture-pattern` rendering: verify items render with `> ` prefix in the `## Architecture` section
- [ ] `testing/unit/` — `displaySimilarityThreshold` filtering: verify memories below 0.60 are excluded from `## Relevant to Current Task`
- [ ] `testing/unit/` — `## Recent Sessions`: verify up to 3 items shown, with 2nd truncated at 600 chars and 3rd at 300 chars
- [ ] `testing/unit/` — `## Active Context`: verify 2,000-char render cap is applied
- [ ] `testing/integration/` — Full `[MEMORY]` block render: assemble a block with all new section types populated, verify structure and ordering

Tier 1 — Regression gate (extraction/retrieval):
- [ ] Run `bun run benchmark` (standard retrieval mode)
- [ ] Compare per-category scores against Phase 0 baseline
- [ ] **Gate:** no category regression > 2%

Tier 2 — Block quality (presentation):
- [ ] Run `bun run benchmark --mode block-quality`
- [ ] Compare per-category scores against Phase 0 baseline
- [ ] **Gate:** `session-continuity`, `knowledge-update`, and `cross-session-synthesis` scores must improve or hold steady
- [ ] **Measure:** gap between Tier 1 and Tier 2 scores should shrink vs. baseline gap

Build verification:
- [ ] `bunx tsc --noEmit` passes with no TypeScript errors
- [ ] `bun run build:plugin` succeeds

**Success Criteria:**
- All new unit tests pass
- No existing unit or integration tests broken
- Tier 1: no category regression > 2%
- Tier 2: block-quality scores improve in active-context-related categories
- Tier 2: gap between retrieval and block-quality scores shrinks
- TypeScript build clean

---

## Edge Cases & Decisions

### High Priority

| Edge Case | Decision | Implementation |
|-----------|----------|----------------|
| No `active-context` memories exist yet | Render nothing — section is omitted, same as other empty sections | `byType["active-context"]` is undefined → section skipped |
| `active-context` extraction fires on conversational turn | Acceptable — the extraction LLM's prompt says "only extract when active implementation work"; it will return `[]` for chat turns. The singleton aging rule means even if one slips through, the next real `active-context` replaces it. | No code guard needed — prompt + aging handles it |
| User manually adds a very long `active-context` via memory tool | Truncate render to 2,000 chars in the section | Apply `content.slice(0, 2000)` in `context.ts` before appending |
| Project with many `architecture` memories crowds out `active-context` | Per-type soft caps (Phase 5) prevent this | `architecture` capped at 12, `active-context` always rendered first |

### Medium Priority

| Edge Case | Proposed Approach | Deferral Risk |
|-----------|------------------|---------------|
| `displaySimilarityThreshold` set too high by user (e.g., 0.95) | No memories appear in Relevant section — silent | Acceptable; user-configured, documented |
| Session-summary condensation truncates important info | Render latest in full — only 2nd and 3rd are truncated | Low; latest is always complete |
| `architecture-pattern` memories never get extracted (prompt quality issue) | Monitor in Phase 7 benchmark; iterate on prompt if needed | Medium; benchmark will surface this |

### Low Priority

| Edge Case | Why Acceptable |
|-----------|----------------|
| `## Recent Sessions` shows duplicate content if summaries overlap | Session summaries are auto-generated at fixed intervals; some overlap is expected and not harmful |
| `architecture-pattern` prefix `>` renders differently in different terminals | It's a minor visual cue, not structural |

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `active-context` aging: singleton vs. rolling window | Singleton (only latest survives, like `progress`) | Active context is "what am I doing right now" — older states are irrelevant noise once superseded |
| `displaySimilarityThreshold` as a separate config key vs. raising `similarityThreshold` | Separate key | `similarityThreshold` controls retrieval depth (LanceDB query), which should stay at 0.45 for accuracy. Display is a separate concern. |
| `## Recent Sessions` condensation: LLM call vs. string truncation | String truncation | LLM call adds 200–500ms per render and costs tokens. Truncation with ellipsis is good enough for 2nd/3rd entries. |
| `active-context` extraction: dedicated trigger vs. existing pipeline | Use existing extraction pipeline (no auto-save.ts changes) | Investigation (Finding 1) proved tool-call detection is not possible in auto-save.ts — the `cachedMessages` array only contains text parts. The extraction LLM already reads the full conversation and decides what types to emit. Adding the type to the prompt is sufficient; the LLM skips it on conversational turns. Simpler, fewer code changes, leverages existing intelligence. |
| `architecture-pattern` as sub-type vs. new type | Sub-type rendered alongside `architecture` | Users shouldn't have to know the difference. It's still architecture — just a "how to" variant. |
| Raise `maxStructuredMemories` 30 → 50 | Yes | With `active-context` and `architecture-pattern` added, the 30-item budget gets crowded. 50 is still well within LanceDB scan budget. |
| Per-type soft caps in JS vs. per-type LanceDB queries | JS soft caps | LanceDB doesn't support parameterized ORDER BY + LIMIT per type. JS grouping already happens; slice is trivial. |
| Evaluation: how to prove improvement | Three-tier evaluation with Phase 0 baseline | Tier 1 (DevMemBench retrieval) tests extraction/search but not presentation. Tier 2 (block-quality mode) tests the actual `[MEMORY]` block the agent sees. Tier 3 (dogfooding) tests real-world session continuity. Building Tier 2 first (Phase 0) ensures we have a before/after measurement for the presentation layer, which is the primary thing we're changing. |
| Tier 2 semantic section: static vs. per-question query | Per-question query | The `[MEMORY]` block's "Relevant to Current Task" section changes every turn via per-turn semantic refresh (`index.ts:874–895`). Using each question as the query simulates this — the block changes per question, which is realistic. A static block would undercount the system's actual capability. |

---

## Metrics

| Metric | How Measured | Baseline | Target |
|--------|-------------|----------|--------|
| **Presentation** | | | |
| [MEMORY] block token size | Count tokens in assembled block | ~1,200 tokens structured; ~1,500–2,000 total (measured: 4,808 bytes) | ~5,000–8,000 tokens |
| `## Active Context` present after coding session | Manual check | 0% (section never exists) | 100% |
| `## Recent Sessions` entries shown | Count in block | 1 | ≤ 3 |
| Semantic results shown at ≥ 0.60 similarity | Count in block | Mixed (0.45+ including noise) | All ≥ 0.60 |
| **Tier 1 — Retrieval (DevMemBench standard)** | | | |
| Overall accuracy | `bun run benchmark` | Phase 0 baseline (TBD) | No regression |
| `session-continuity` accuracy | 25 questions | Phase 0 baseline (TBD) | No regression |
| `knowledge-update` accuracy | 25 questions | Phase 0 baseline (TBD) | No regression |
| **Tier 2 — Block Quality (NEW)** | | | |
| Overall block-quality accuracy | `bun run benchmark --mode block-quality` | Phase 0 baseline (TBD) | Improvement |
| `session-continuity` block-quality | 25 questions | Phase 0 baseline (TBD) | Improvement (primary target) |
| `knowledge-update` block-quality | 25 questions | Phase 0 baseline (TBD) | Improvement |
| `cross-session-synthesis` block-quality | 25 questions | Phase 0 baseline (TBD) | Improvement |
| Tier 1 → Tier 2 gap (overall) | Tier 1 accuracy minus Tier 2 accuracy | Phase 0 baseline (TBD) | Gap shrinks |
| **Extraction** | | | |
| `active-context` extraction hit rate | Count memories after 5-turn session | 0 | ≥ 1 per session |
| `architecture-pattern` extraction hit rate | Count memories after pattern-establishing session | 0 | ≥ 1 when patterns are established |
| **Build** | | | |
| TypeScript build | `bunx tsc --noEmit` | Pass | Pass |
| Unit tests | `bun test` | Pass | Pass |

---

## Rollback Plan

**Detection signals:**
- [MEMORY] block injects empty or garbled content
- TypeScript build fails
- `active-context` aging deletes memories it shouldn't
- Benchmark regression > 2% in any existing category

**Immediate rollback:**
```bash
git revert <commit-hash>
```

**Graceful degradation (config toggle):**
```typescript
// plugin-config.ts
ENABLE_ACTIVE_CONTEXT: boolean = true   // disable to skip active-context section
ENABLE_RECENT_SESSIONS: boolean = true  // disable to revert to single Last Session
displaySimilarityThreshold: number = 0.45  // revert to old threshold
```

Each phase is independently committable — rollback one phase without reverting others.

**Recovery steps:**
1. Disable via config flag or `git revert` the specific phase commit
2. Verify [MEMORY] block renders correctly after revert
3. Run `bun test` to confirm no test regressions
4. Fix in a sub-branch, re-validate, re-merge

---

## Confidence Check

### Post-Investigation Scores (Updated 2026-03-31)

| Area | Before | After | Notes |
|------|--------|-------|-------|
| `store.ts` aging pattern | 9/10 | **10/10** | `ageProgress` at lines 236–248 is a direct copy template. `applyAgingRules` at lines 226–234 shows exactly where to add the new case. |
| `context.ts` section rendering | 9/10 | **10/10** | `STRUCTURED_SECTIONS` array (line 37) and `formatContextForPrompt` (line 47) are clean, well-understood. Adding a section is a 1-line array append. |
| `prompts.ts` extraction guidance | 8/10 | **9/10** | Finding 2 confirmed the prompt pattern is proven (10 types, each with 2–4 lines of guidance). Adding 2 types follows the identical pattern. Benchmark in Phase 7 validates quality. |
| `auto-save.ts` extraction trigger | 8/10 | **10/10** | Finding 1 resolved this completely: **no changes to auto-save.ts needed**. The existing pipeline already sends full conversation text to the extraction LLM. Adding the type to `prompts.ts` is sufficient. |
| `plugin-config.ts` new config keys | 9/10 | **9/10** | Trivial to add, validated by TypeScript. `displaySimilarityThreshold` follows existing `similarityThreshold` pattern exactly. |
| TypeScript compatibility | 9/10 | **10/10** | No new dependencies, no new types needed. Pure logic changes to existing functions. |
| Per-type soft caps (LanceDB interaction) | 6/10 | **9/10** | Finding 4 confirmed: zero-vector fetch scans up to 10K rows regardless of `limit`. The `limit` only controls the JS `.slice()`. Raising 30→50 has zero performance impact. JS-side caps after grouping work correctly. |
| Benchmark coverage | 7/10 | **10/10** | Finding 5 confirmed: `session-continuity` (25 questions) directly tests active context recall. 75/200 total questions (37.5%) test active context dimensions. Phase 7 gate is strong. |
| Token size estimate | 7/10 | **10/10** | Finding 3 measured precisely: current block is ~4,808 bytes / ~1,200 tokens. Target of ~5,000–8,000 tokens is realistic. |

**Overall: 9.7/10 — High confidence. All uncertainties resolved.**

The only area at 9 (not 10) is prompt quality — extraction prompts need real-world iteration. This is inherent to LLM prompt engineering and is gated by Phase 7 benchmark validation.
