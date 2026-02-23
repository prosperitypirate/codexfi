# Feature Design Framework — opencode-memory

**Purpose**: Comprehensive methodology for designing and implementing major features in opencode-memory following proven phased development approaches.

**Status**: Master Template — Use for all significant feature development  
**Version**: 1.0 (Adapted from general framework, opencode-memory-specific)  
**Created**: February 22, 2026

---

## DIAGRAM STANDARDS

### Mermaid Dark Theme Configuration

All design documents should include visual diagrams with consistent dark theme styling:

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 
  'primaryColor': '#3b82f6', 
  'primaryTextColor': '#ffffff', 
  'primaryBorderColor': '#60a5fa', 
  'lineColor': '#60a5fa', 
  'secondaryColor': '#1e293b', 
  'tertiaryColor': '#334155', 
  'background': '#0f172a', 
  'mainBkg': '#1e293b', 
  'nodeBorder': '#60a5fa', 
  'clusterBkg': '#1e293b',
  'titleColor': '#f8fafc'
}}}%%
```

### Required Diagram Types

| Diagram Type | Purpose | When to Include |
|-------------|---------|-----------------|
| **Architecture Flowchart** | System component overview | All features |
| **Sequence Diagram** | End-to-end data flow | All features with multiple components |
| **State Diagram** | Status transitions | Features with status/workflow states |
| **Data Flow Diagram** | Memory, API, and cache interactions | Memory system features |
| **Simplified Flow** | Quick visual reference | Per major flow (success, error, etc.) |

### Color Standards (Dark Theme)

| Purpose | Hex Code | Usage |
|---------|----------|-------|
| Primary (borders, lines) | `#60a5fa` | Flow lines, primary boxes |
| Success (complete) | `#10b981` | Completed phases, pass states |
| Error (warning, failed) | `#ef4444` | Error states, failures |
| Warning (caution) | `#f59e0b` | Latency concerns, trade-offs |
| Info (neutral) | `#3b82f6` | Neutral information |
| Purple (processing) | `#8b5cf6` | Async operations, hooks |
| Background | `#0f172a` | Diagram background |
| Node fill | `#1e293b` | Component boxes |

### ASCII Fallback Requirement

Always include ASCII fallback diagrams for non-Mermaid viewers:

```
┌─────────────┐     ─────▶     ┌─────────────┐
│  Component  │                │  Component  │
└─────────────┘     ◀─────     └─────────────┘
```

---

## PROJECT ARCHITECTURE

### opencode-memory System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                  opencode-memory Architecture                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                            │
│  │ OpenCode CLI │                                            │
│  │  (agent,     │                                            │
│  │  sessions)   │                                            │
│  └───────┬──────┘                                            │
│          │                                                    │
│  ┌───────▼──────────────────────────────────────┐            │
│  │  Plugin System (@opencode-ai/plugin)         │            │
│  ├────────────────────────────────────────────┤            │
│  │  • Hooks (chat.message, system.transform) │            │
│  │  • Memory tool (add, search, list, etc)   │            │
│  │  • Auto-save engine                       │            │
│  │  • Compaction integration                 │            │
│  └───────┬──────────────────────────────────────┘            │
│          │ HTTP (localhost:8020)                             │
│  ┌───────▼──────────────────────────────────────┐            │
│  │  Backend Memory Server (Python/FastAPI)      │            │
│  ├────────────────────────────────────────────┤            │
│  │  • Memory ingestion & extraction           │            │
│  │  • Vector search (Voyage AI embeddings)    │            │
│  │  • LanceDB storage                         │            │
│  │  • Memory aging/superseded logic           │            │
│  └───────┬──────────────────────────────────────┘            │
│          │                                                    │
│  ┌───────▼──────────┬──────────────┐                        │
│  │    LanceDB       │  Voyage AI   │                        │
│  │   (local VDB)    │  (embedding)  │                        │
│  └──────────────────┴──────────────┘                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## FILES CHECKLIST

### Files to Review/Update for New Features

When adding memory system features, consider updates to:

**Plugin (TypeScript/Bun):**
- [ ] `plugin/src/index.ts` — Core hooks, memory injection, session management
- [ ] `plugin/src/services/context.ts` — [MEMORY] block formatting
- [ ] `plugin/src/services/client.ts` — Backend HTTP API client
- [ ] `plugin/src/services/auto-save.ts` — Auto-save extraction logic
- [ ] `plugin/src/services/compaction.ts` — Compaction context injection
- [ ] `plugin/src/config.ts` — Configuration constants

**Backend (Python/FastAPI):**
- [ ] `backend/server.py` — Main server, routes, endpoints
- [ ] `backend/search.ts` — Semantic search implementation
- [ ] `backend/store.py` — LanceDB interactions
- [ ] `backend/extract.py` — Memory extraction via LLM

**Testing (E2E):**
- [ ] `testing/src/runner.ts` — Test orchestration
- [ ] `testing/src/scenarios/` — E2E scenarios
- [ ] `testing/src/opencode.ts` — CLI wrapper
- [ ] `testing/src/memory-api.ts` — Backend API client for tests

**Benchmarking:**
- [ ] `benchmark/src/index.ts` — Benchmark orchestration
- [ ] `benchmark/src/pipeline/` — 5-phase pipeline
- [ ] `benchmark/src/providers/opencode-memory.ts` — Query routing
- [ ] `benchmark/src/dataset/` — Questions and sessions

**Configuration:**
- [ ] `.env.example` — Memory server URL, API keys, thresholds
- [ ] `plugin/package.json` — Plugin dependencies
- [ ] `backend/requirements.txt` — Python dependencies

---

## CONFIDENCE CHECK PROTOCOL

### Pre-Implementation Confidence Assessment

Before starting Phase 1, rate confidence 0-10 on each area:

| Area | Score | Action if < 8 |
|------|-------|--------------|
| Plugin hook system behavior (@opencode-ai/plugin) | _/10 | Review plugin SDK types, hook execution order |
| Backend API patterns (FastAPI, LanceDB queries) | _/10 | Study server.py routes, search.ts implementation |
| Memory formatting and injection | _/10 | Review context.ts formatContextForPrompt |
| E2E testing infrastructure | _/10 | Study testing/src/scenarios patterns |
| Benchmark regression measurement | _/10 | Review benchmark/src/pipeline structure |

**Overall Confidence Target: 9/10 minimum before implementation**

### Confidence Improvement Actions

```markdown
**If Plugin Hooks < 8:**
- Review plugin/src/index.ts for existing hook examples
- Study @opencode-ai/plugin SDK types in node_modules
- Verify hook execution order (messages.transform vs chat.message)

**If Backend API < 8:**
- Read backend/server.py for route patterns
- Study backend/search.ts for vector search implementation
- Review backend/store.py for database interactions

**If Memory Formatting < 8:**
- Study plugin/src/services/context.ts (formatContextForPrompt function)
- Review existing [MEMORY] block structure in README.md

**If E2E Testing < 8:**
- Study testing/src/scenarios/ for pattern examples
- Review testing/src/opencode.ts CLI wrapper behavior
- Understand waitForMemories polling logic

**If Benchmark < 8:**
- Review benchmark/DESIGN-V2.md for 5-phase structure
- Study benchmark/src/providers/opencode-memory.ts routing
```

---

## FRAMEWORK OVERVIEW

This framework codifies proven development methodology into a repeatable process:

1. **Discovery Phase**: Structured questioning to understand requirements
2. **Analysis Phase**: Comprehensive study of existing codebase and prior art
3. **Design Phase**: Detailed implementation planning with specific deliverables
4. **Validation Phase**: Cross-checking design against codebase, SDK behavior, benchmarks
5. **Documentation Phase**: Creating implementation-ready design document
6. **Implementation Phase**: Building according to design (no TDD requirement — build fast)

---

## PHASE 1: DISCOVERY — STRUCTURED REQUIREMENTS GATHERING

### Universal Discovery Questions (12-15 questions)

**Core Feature Understanding:**
1. **What problem does this feature solve?** (Business value and user pain points)
2. **Who is the primary user?** (End users, developers, automated systems, agents)
3. **What is the expected user flow/agent behavior?** (Step-by-step interaction sequence)
4. **What are the success metrics?** (How do we measure if this feature works)

**Technical Architecture:**
5. **Is this primarily plugin, backend, or full-stack?** (Determines implementation approach)
6. **Does this integrate with existing systems?** (Hooks, backends, DB, testing)
7. **What are the performance requirements?** (Latency budgets, token budgets, throughput)
8. **What are the data requirements?** (New memory types, API calls, caching)

**Memory System Specifics:**
9. **How should memories be retrieved?** (Semantic search, enumeration, synthesis)
10. **What's the injection point?** (System prompt, message parts, tool descriptions)
11. **How should this survive compaction?** (Compaction hook integration needed?)

**Implementation Strategy:**
12. **What is the priority and timeline?** (Urgent, standard development cycle, future)
13. **Are there blocking constraints?** (SDK limitations, API rate limits, token budgets)
14. **What testing is required?** (E2E scenarios, benchmark regression, manual dogfooding)
15. **What's the rollback strategy?** (Feature flags, config toggles, branch revert)

### Adaptive Follow-up Questions by Feature Type

**If Plugin Hook Feature:**
- Which hooks are involved? (chat.message, system.transform, event, tool)
- Does hook execution order matter?
- How is state maintained across messages/sessions?
- How does this interact with compaction?

**If Backend/Search Feature:**
- What query patterns are needed?
- How does this affect search latency and accuracy?
- Are new memory types or metadata needed?
- How does this scale to larger memory banks?

**If Memory Formatting Feature:**
- What's the [MEMORY] block structure?
- How are different memory types prioritized?
- What's the token budget per section?
- How should this handle empty or sparse memories?

**If Integration Feature:**
- What systems interact (plugin ↔ backend ↔ testing ↔ benchmark)?
- What's the exact data contract?
- Error handling for each system?
- How do we validate integration across systems?

---

## PHASE 2: ANALYSIS — COMPREHENSIVE CODEBASE STUDY

### Systematic Analysis Methodology

**Step 1: High-Level Architecture Review**
- Review `.github/designs/FEATURE-DESIGN-FRAMEWORK.md` (this document)
- Study `README.md` for current system status
- Check `plugin/README.md` for plugin-specific docs

**Step 2: Plugin Analysis (TypeScript/Bun)**
- Study `plugin/src/index.ts` for hook patterns and execution order
- Review `plugin/src/services/context.ts` for memory formatting
- Check `plugin/src/services/client.ts` for backend API calls
- Analyze `plugin/src/config.ts` for configuration patterns

**Step 3: Backend Analysis (Python/FastAPI)**
- Study `backend/server.py` for endpoint patterns
- Review `backend/search.ts` for vector search implementation
- Check `backend/store.py` for LanceDB interactions
- Analyze extraction and aging logic

**Step 4: Testing Infrastructure Analysis**
- Study `testing/src/scenarios/` for E2E test patterns
- Review `testing/src/memory-api.ts` for backend API assertions
- Check `testing/src/runner.ts` for test orchestration
- Analyze polling and cleanup patterns

**Step 5: Benchmark Analysis**
- Study `benchmark/src/pipeline/` for 5-phase structure
- Review `benchmark/src/providers/opencode-memory.ts` for query routing
- Check `benchmark/DESIGN-V2.md` for benchmark design
- Analyze scoring and regression detection

### File Analysis Documentation Template

For each relevant file studied:
```markdown
**File**: `path/to/file`
**Purpose**: Brief description of file's role
**Key Patterns**: Notable patterns, functions, classes
**Integration Points**: How this file connects to others
**Modification Impact**: What changes here would affect
**Dependencies**: What this file depends on
**Dependents**: What depends on this file
```

### Integration Impact Assessment

**Plugin Integration:**
- What hooks need to fire?
- Session state management needed?
- Compaction interaction required?

**Backend Integration:**
- What new endpoints/routes needed?
- Database schema changes required?
- Search logic modifications?

**Testing Integration:**
- What E2E scenario patterns to follow?
- What assertions against backend needed?
- Memory cleanup and isolation?

**Benchmark Integration:**
- Does this affect query routing?
- New scoring criteria?
- Regression detection strategy?

---

## PHASE 3: DESIGN — DETAILED IMPLEMENTATION PLANNING

### Standardized Phase Structure

**Phase Determination Methodology:**
1. **Plugin Phase**: If new hooks, state management, or injection logic needed
2. **Backend Phase**: If new endpoints, search logic, or storage changes needed
3. **Integration Phase**: If multiple systems interact (plugin ↔ backend)
4. **Testing Phase**: If E2E scenarios or benchmark validation needed
5. **Rollout Phase**: If configuration, feature flags, or staged deployment needed

### Phase Planning Template

```markdown
### PHASE X: [PHASE NAME]
**Goal**: Clear, measurable objective
**Duration**: Realistic time estimate
**Dependencies**: What must be complete before this phase
**Status**: ⏳ PENDING | 🚧 IN PROGRESS | ✅ COMPLETE

**Deliverables:**
- [ ] `file/path.ts` — Purpose (X changes)
- [ ] `file/path.py` — Purpose (new file)
- [ ] `file/path.md` — Documentation (update)

**Success Criteria:**
- Agent/plugin behavior observable change
- No benchmark regression
- E2E scenario passes
- Latency/token budget met

**Implementation Notes:**
- Key technical decisions
- Integration patterns to follow
- Error handling approach
```

### Phase Completion Template

```markdown
## PHASE X ACTUAL IMPLEMENTATION (COMPLETED)

**Implemented**: [Date]
**Duration**: X hours (within/over estimate)
**Result**: SUCCESS - All criteria met

### Steps Taken
1. [Specific step]
2. [Specific step]

### Files Created/Modified
- [File path with actual changes]

### Success Criteria Met
✅ [Specific achievement]

### Key Learnings
- [Pattern discovered]
- [Issue resolved]

**Phase X Status: ✅ COMPLETE**
```

---

## PRIOR ART & LANDSCAPE

### Existing Memory System Approaches

| System | Session Start | Mid-Session | Survives Compaction | Token Cost | Agent Autonomy |
|--------|---------------|-------------|---------------------|------------|----------------|
| **Letta/MemGPT** | Agent self-retrieves | Agent decides to search (unreliable) | N/A | Varies | High |
| **Mem0, Zep** | Caller injects context | No mid-session refresh | No | Accumulates | Low |
| **Cursor, Copilot** | No cross-session memory | No | No | N/A | N/A |
| **Cline + markdown bank** | Reads markdown at start | No refresh | No | Full file in context | Low |
| **opencode-memory (today)** | [MEMORY] block turn 1 | No (agent rarely self-searches) | No — lost on compaction | 3K permanent in history | Low |
| **opencode-memory (proposed)** | [MEMORY] via system prompt | Auto-refreshed every turn | Yes — system prompt never compacted | 3K flat, zero accumulation | Low (automatic) |

### Key Insight: Automatic vs Manual Retrieval

The "can't know what you don't know" problem is fundamental. No system has solved it perfectly:
- **Letta approach**: Hope the agent decides to search (unreliable, ~0% mid-session rate)
- **Our approach**: Automatically surface relevant memories based on current message (reliable, always fresh)

Our unique advantage: **Zero agent overhead — relevance happens automatically via system-level architectural choice.**

---

## METRICS & MEASUREMENT

### Before/After Success Metrics

| Metric | How Measured | Target |
|--------|--------------|--------|
| **Session-start [MEMORY] freshness** | Agent accuracy on turn 1 queries | Maintain ≥92% |
| **Mid-session [MEMORY] freshness** | E2E scenario 11 pass rate | 100% |
| **Token accumulation** | Sum of all [MEMORY] blocks across turns | 3K flat (zero accumulation) |
| **Per-turn latency** | `Date.now()` delta in hooks | +300ms per turn (invisible next to LLM) |
| **Compaction survival** | E2E test with forced compaction | [MEMORY] still injected post-compaction |
| **Benchmark regression** | Full 200-question benchmark | No drop below 92% |
| **Semantic search quality** | Hit@10, MRR, NDCG on mid-session queries | Match turn-1 quality |
| **False positive rate** | Injections with no novel content | <5% |

### Benchmark Regression Strategy

- Run full 200-question benchmark before starting
- Record baseline score per category
- After each phase, re-run benchmark
- Flag any category drop >2%
- If regression, diagnose and fix before next phase

---

## EDGE CASES

### High Priority — Must Resolve

| Edge Case | Decision | Implementation |
|-----------|----------|----------------|
| Hook execution order uncertain | Verify via logging: chat.message, then system.transform, then LLM | Add console.log timestamps in both hooks |
| Compaction removes [MEMORY] synthetic part | Move [MEMORY] to system prompt instead | Use experimental.chat.system.transform |
| Cache eviction / memory leak on long sessions | Per-session cache, cleaned on session.deleted event | Add cleanup in event hook |
| Empty semantic results on turn 2+ | Gracefully skip injection, reuse turn-1 results | formatContextForPrompt returns "" if no content |

### Medium Priority

| Edge Case | Decision | Implementation |
|-----------|----------|----------------|
| Sub-agent (Task tool) loses session context | Sub-agents get tool description nudge | Enhance memory tool description |
| Very large [MEMORY] blocks exceed token budget | Truncate "Relevant to Current Task" section | Add MAX_SEMANTIC_ITEMS config |
| Embedding latency on slow networks | 300ms search timeout, fall back to cache | Add timeout with fallback |
| Similar queries on consecutive turns | Search every turn anyway (freshness > deduplication) | Accept minor API call overhead |

### Low Priority

| Edge Case | Decision | Implementation |
|-----------|----------|----------------|
| [MEMORY] block rendered in agent response | Agent doesn't repeat it (it's in system prompt, not visible) | N/A — system prompt hidden from agent |
| Similarity scores drift across sessions | Consistent embeddings from Voyage AI | Acceptable variance |
| Memory deletion mid-session | Agent continues with stale [MEMORY] | Acceptable for rare edge case |

---

## DECISION LOG

| Decision | Choice | Date | Rationale |
|----------|--------|------|-----------|
| Injection mechanism | System prompt via system.transform hook | Feb 22 | Survives compaction, zero token accumulation, refreshed every turn |
| Per-turn search | Always search (no gating heuristic) | Feb 22 | Simplicity over optimization; latency (300ms) negligible vs LLM |
| Search scope | Project-only (turn 2+) | Feb 22 | User prefs already in session-start block |
| Similarity threshold | 0.55 (vs 0.45 for turn 1) | Feb 22 | Higher bar reduces per-turn noise |
| Max semantic items | Top 3 results | Feb 22 | Keeps token cost under 400 per turn |
| Deduplication | Track injected IDs in session cache | Feb 22 | Avoid repeating content, but refresh "Relevant to Current Task" |
| Tool description nudge | Yes — add proactive search guidance | Feb 22 | Zero-cost experiment before per-turn logic |
| Skip Phase 1 TDD | Build fast, iterate based on real behavior | Feb 22 | Faster validation, empirical testing via E2E and dogfooding |

---

## ROLLBACK PLAN

### If Per-Turn Injection Causes Issues

**Detection Indicators:**
- Benchmark drops >2% in any category
- E2E test 11 consistently fails
- Agent complains about noisy context (manual dogfooding)
- Latency spikes (search timeouts)
- Backend API errors on search volume

**Immediate Rollback:**
```bash
git revert <commit-hash>
git push origin main
```

**Graceful Degradation (Config-Based):**
Add toggle in `plugin/src/config.ts`:
```typescript
ENABLE_PER_TURN_REFRESH: boolean = true  // Set to false to disable
```

**Feature Flag:**
Disable in early rollout:
```typescript
if (!CONFIG.ENABLE_PER_TURN_REFRESH) {
  return;  // Skip per-turn search entirely
}
```

### Recovery Steps

1. Revert or disable feature
2. Investigate root cause (log analysis, benchmark regression)
3. Fix in new branch
4. Re-run E2E scenario 11
5. Re-run full benchmark
6. Redeploy

---

## SESSION CONTINUITY

### Design Document as Continuity Artifact

This design document serves as the complete record of research, decisions, and implementation plan. If context is lost:

1. **Read this document** — it contains everything needed to resume
2. **File references** — all code locations include line numbers
3. **Phase structure** — clear deliverables and success criteria per phase
4. **Test commands** — exact commands to validate each phase
5. **Decision log** — rationale for every architectural choice

### Memory System Integration

If the current session ends, use the `memory` tool to save progress:

```typescript
memory({
  mode: "add",
  type: "progress",
  scope: "project",
  content: "Per-turn memory refresh (001) — Phase X complete. [Summary of what's done]"
})

memory({
  mode: "add", 
  type: "architecture",
  scope: "project",
  content: "Per-turn refresh uses system.transform hook to inject [MEMORY] via system prompt (not message parts). Session cache in plugin/src/index.ts:XXX. Survives compaction, zero token accumulation."
})
```

### Next Session Protocol

1. Design document is already written — start Phase 1 implementation immediately
2. No need to re-research or re-analyze
3. Reference file paths and line numbers from the document
4. Update document with actual implementation progress
5. After each phase, append "PHASE X ACTUAL IMPLEMENTATION" section

---

## BEST PRACTICES FOR FEATURE DESIGN

### Discovery Phase
- Ask "why" before "how"
- Validate metrics can be measured before/after
- Identify integration points early
- Document edge cases systematically

### Analysis Phase
- Study at least 3 existing examples in codebase
- Verify hook execution order experimentally
- Document findings with file paths and line numbers
- Check for breaking changes to existing behavior

### Design Phase
- Be specific about deliverables (exact file paths)
- Include configuration changes needed
- Plan for rollback from the start
- Document all assumptions

### Validation Phase
- Cross-check against real code, not memory
- Verify benchmark baseline before starting
- Test hook interactions in isolation first
- Plan E2E scenarios before implementation

### Implementation Phase
- Follow the phase structure exactly
- After each phase, run tests and update document
- Commit with clear messages referencing the design doc
- Document unexpected issues or learnings

---

## FRAMEWORK USAGE GUIDE

### For New Feature Development

1. **Discovery**: Use Phase 1 questions to gather requirements
2. **Analysis**: Study existing code systematically
3. **Design**: Create comprehensive design document (like 001-per-turn-memory-refresh.md)
4. **Validation**: Cross-check design against codebase
5. **Implementation**: Follow phase structure, build fast (no TDD required)
6. **Completion**: Update memory bank with lessons learned

### Quality Standards

- Every major feature follows this framework
- No shortcuts on Discovery or Analysis phases
- Design document is implementation-ready before coding
- Memory system updated after each phase
- Lessons learned captured for framework improvement

### Framework Evolution

This framework should be updated with:
- New patterns discovered during implementation
- Better methodologies from successful projects
- Plugin SDK improvements or limitations discovered
- Tool improvements or new technologies

---

**Status**: FEATURE DESIGN FRAMEWORK COMPLETE — READY FOR USE

This framework codifies proven development methodology for opencode-memory features.
