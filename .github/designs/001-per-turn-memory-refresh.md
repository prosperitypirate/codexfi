# Per-Turn Memory Refresh — Design Document

**Feature**: Automatic per-turn semantic memory refresh in system prompt  
**Issue**: #34 (agent UX: mid-session memory retrieval)  
**Branch**: `feature/mid-session-retrieval`  
**Status**: DESIGN COMPLETE — READY FOR IMPLEMENTATION  
**Created**: February 22, 2026  
**Estimated Duration**: 4-6 hours across 5 phases  

---

## EXECUTIVE SUMMARY

### The Problem

Today, the `[MEMORY]` block is injected once on turn 1 and never refreshed. It stale within 2-3 turns as the conversation shifts topics. After compaction (long sessions), the entire `[MEMORY]` block is lost because it's a synthetic user message part.

The agent has zero incentive to search mid-session because:
1. It doesn't know what memories exist that it hasn't seen
2. Even if it calls `memory search`, it's unreliable (~0% adoption rate in practice)
3. The overhead (extra API call, token cost) falls on the user to decide

### The Solution

Move the `[MEMORY]` block from a synthetic message part (turn 1 only) to the **system prompt** (every LLM call). Then:

1. **Turn 1**: 4 parallel API calls populate session cache (same as today)
2. **Every LLM call**: `experimental.chat.system.transform` hook rebuilds `[MEMORY]` from cache → injects into system prompt
3. **Turns 2+**: 1 semantic search call refreshes "Relevant to Current Task" section with current-turn context
4. **After compaction**: System prompt is never compacted → `[MEMORY]` survives forever
5. **Zero token accumulation**: System prompt is rebuilt each turn, not appended

### Why This Works

| Property | Before | After |
|----------|--------|-------|
| Injection point | Synthetic message part (turn 1 only) | System prompt (every call) |
| Frequency | Once per session | Every LLM call |
| Survival | Lost on compaction | Never lost |
| Token cost | 3K permanent in history | 3K rebuilt each turn (zero accumulation) |
| Freshness | Stale by turn 3-5 | Fresh every turn |
| Latency | ~1-2s on turn 1 | +300ms per turn 2+ (invisible) |

---

## CURRENT STATE — CODE REFERENCES

### How [MEMORY] Works Today

**`plugin/src/index.ts:227-378` — `chat.message` hook**

```typescript
"chat.message": async (input, output) => {
  const isFirstMessage = !injectedSessions.has(input.sessionID);  // line 268
  
  if (isFirstMessage) {
    injectedSessions.add(input.sessionID);  // line 271
    
    // 4 parallel API calls
    const [profileResult, userMemoriesResult, projectMemoriesListResult, projectSearchResult] 
      = await Promise.all([...]);  // lines 273-280
    
    // Fetch and partition memories
    const byType: Record<string, StructuredMemory[]> = {};
    for (const m of allProjectMemories) { ... }  // lines 310-322
    
    // Format and inject as synthetic part
    const memoryContext = formatContextForPrompt(...);  // line 348
    output.parts.unshift(contextPart);  // line 365 — prepend to message
  }
}
```

**Current behavior:**
- `injectedSessions` Set gates injection to turn 1 only (line 268)
- 4 API calls fire in parallel on turn 1, blocked by 30s timeout
- Results are NOT cached — they disappear after injection
- `formatContextForPrompt` builds the `[MEMORY]` block text
- Synthetic part is prepended to user message (line 365)
- Turns 2+: Nothing happens (no memory refresh)

### The Compaction Problem

**`plugin/src/services/compaction.ts:275-293` — Compaction context injection**

When context usage hits 80%, OpenCode triggers `session.summarize()`. The compaction process:
1. Summarizes old turns to save tokens
2. Removes old messages from history
3. **The synthetic `[MEMORY]` part in message 1 is compacted away** — lost forever
4. `injectCompactionContext` tries to inject memories into the compaction prompt (line 275)
5. But this is lossy — the structured `[MEMORY]` block is gone

Result: Long sessions lose full project context after compaction.

### The System Prompt Opportunity

**`plugin/node_modules/@opencode-ai/plugin/dist/index.d.ts:195-200` — Unused hook**

```typescript
"experimental.chat.system.transform"?: (input: {
    sessionID?: string;
    model: Model;
}, output: {
    system: string[];  // ← array of system prompt strings
}) => Promise<void>;
```

Key properties:
- Fires **before every LLM call** (not just turn 1)
- System prompt is sent separately from messages
- **Never compacted** — it's not part of message history
- Can be rebuilt/refreshed per turn at no token cost (it's rebuilt each call anyway)
- We can `output.system.push("[MEMORY]..." )` to append

---

## PRIOR ART & LANDSCAPE

### Memory System Approaches Compared

| System | When Injected | Mechanism | Survives Compaction | Agent Autonomy |
|--------|---------------|-----------|---------------------|----------------|
| **Letta/MemGPT** | Per-interaction | Agent calls `archival_memory_search` | N/A (no compaction) | High (self-decides) |
| **Mem0, Zep** | Session start | Caller injects context | No | Low (automatic) |
| **Cursor, Copilot** | None | No cross-session memory | N/A | N/A |
| **Cline + memory bank** | Session start | Reads markdown file | No | Low (automatic) |
| **opencode-memory (v1)** | Turn 1 only | [MEMORY] synthetic part | No (lost on compaction) | Low (keyword trigger) |
| **opencode-memory (v2 — ours)** | Every LLM call | System prompt + refresh | Yes | Low (automatic, always fresh) |

### What Makes Our Approach Unique

1. **Automatic + Fresh**: Not relying on agent autonomy (Letta's weakness) or one-time injection (Mem0's weakness)
2. **Compaction-Proof**: Uses system prompt instead of message history
3. **Zero Token Growth**: Rebuilt fresh each turn, no accumulation
4. **Effortless**: Agent doesn't need to decide — relevant context always there

### The "Can't Know What You Don't Know" Problem

No system solves this perfectly. The problem: How does an agent know to search for memories it hasn't seen?

- **Letta**: Hope the agent decides to search (unreliable, ~0% mid-session adoption)
- **Mem0**: Accepts one-time injection; no mid-session refresh
- **Our approach**: Automatically refresh based on what the agent is asking about right now

Our answer: **Don't rely on the agent to decide. Use the current message to drive retrieval automatically.**

---

## ARCHITECTURE & DATA FLOW

### System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpenCode Session                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Turn 1: User sends message                                     │
│   ├─ chat.message hook fires                                     │
│   │  ├─ 4 parallel API calls → session cache                     │
│   │  └─ (NO injection yet)                                       │
│   │                                                              │
│   ├─ system.transform hook fires                                 │
│   │  ├─ Read cache                                               │
│   │  ├─ formatContextForPrompt()                                 │
│   │  └─ Push "[MEMORY]..." to system prompt                      │
│   │                                                              │
│   └─ LLM call                                                    │
│      └─ Sees system prompt with [MEMORY]                         │
│                                                              │
│   Turn 5: User sends message (different topic)                   │
│   ├─ chat.message hook fires                                     │
│   │  ├─ 1 semantic search call (project scope)                   │
│   │  └─ cache.semanticResults = fresh results for turn 5         │
│   │                                                              │
│   ├─ system.transform hook fires                                 │
│   │  ├─ Read cache (structured sections unchanged)               │
│   │  ├─ Read cache (semanticResults = FRESH turn-5 results)      │
│   │  ├─ formatContextForPrompt()                                 │
│   │  └─ Push "[MEMORY]..." with refreshed "Relevant to Task"     │
│   │                                                              │
│   └─ LLM call                                                    │
│      └─ Sees [MEMORY] with turn-5-relevant memories              │
│                                                              │
│   After Compaction: Conversation summarized, old messages gone   │
│   ├─ Turn 20+: system.transform STILL fires                      │
│   └─ LLM call sees [MEMORY] with fresh context (not lost!)       │
│                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Data Structures

**Session Memory Cache** — Per-session, cleared on session.deleted:

```typescript
interface SessionMemoryCache {
  // From turn 1, never refreshed
  structuredSections: Record<string, StructuredMemory[]>;
  profile: ProfileResult | null;
  
  // Refreshed on every turn (turns 2+)
  semanticResults: MemoriesResponseMinimal;
  
  // Track what we've already injected (dedup)
  injectedMemoryIds: Set<string>;
  
  // Timestamp for debugging
  initialized: boolean;
  lastRefreshAt: number;
}

const sessionCaches = new Map<string, SessionMemoryCache>();
```

### Flow Diagrams

**Turn 1 Flow:**

```
User message
    │
    ▼
chat.message hook
    │
    ├─ isFirstMessage = true
    │
    ├─ 4 parallel API calls (200-300ms total)
    │  ├─ getProfile(user)
    │  ├─ searchMemories(userMessage, user, recency=0.1)
    │  ├─ listMemories(project)
    │  └─ searchMemories(userMessage, project, recency=0.15)
    │
    ├─ Store in sessionCaches[sessionID]
    │  ├─ .structuredSections
    │  ├─ .profile
    │  ├─ .semanticResults
    │  └─ .initialized = true
    │
    └─ Return (no injection here)
         │
         ▼
    system.transform hook
         │
         ├─ sessionCaches[sessionID]?
         ├─ formatContextForPrompt(cache)
         ├─ output.system.push("[MEMORY]...")
         │
         └─ LLM call → sees [MEMORY] in system prompt
```

**Turns 2+ Flow:**

```
User message (turn 5, new topic)
    │
    ▼
chat.message hook
    │
    ├─ isFirstMessage = false
    │
    ├─ Else branch (NEW)
    │  │
    │  ├─ 1 semantic search call (100-300ms)
    │  │  └─ searchMemories(userMessage, project, recency=0.15)
    │  │
    │  └─ Update cache
    │     └─ sessionCaches[sessionID].semanticResults = fresh results
    │
    └─ Return
         │
         ▼
    system.transform hook
         │
         ├─ sessionCaches[sessionID]?
         ├─ formatContextForPrompt(cache) ← uses FRESH semanticResults
         ├─ output.system.push("[MEMORY]...")
         │
         └─ LLM call → sees [MEMORY] with turn-5-relevant content
```

---

## IMPLEMENTATION PHASES

### PHASE 1: Tool Description Enhancement

**Goal**: Update memory tool description to guide agent towards proactive mid-session search  
**Duration**: 15 minutes  
**Dependencies**: None  
**Status**: ⏳ PENDING

**Deliverables:**
- [ ] `plugin/src/index.ts:382-383` — Update memory tool description (1 change)

**Changes Needed:**

Replace:
```typescript
description:
  "Manage and query the persistent memory system (self-hosted). Use 'search' to find relevant memories, 'add' to store new knowledge, 'profile' to view user memories, 'list' to see recent memories, 'forget' to remove a memory.",
```

With:
```typescript
description:
  "Persistent memory system (self-hosted). Use 'search' to find relevant memories, 'add' to store new knowledge, 'profile' to view user memories, 'list' to see recent memories, 'forget' to remove a memory. PROACTIVE USAGE: Search mid-session when you detect a task switch, encounter unfamiliar references, or need historical context not in the [MEMORY] block. Example: memory({ mode: 'search', query: 'PR conventions and commit workflow' })",
```

**Success Criteria:**
- Tool description updated
- Plugin builds without errors (`bun run build`)
- Existing E2E tests still pass

**Implementation:**
1. Edit `plugin/src/index.ts` line 382-383
2. Run `bun run build` in plugin/
3. Run `bun run test` in testing/ (should all pass)

---

### PHASE 2: Session Cache Infrastructure

**Goal**: Add session-scoped cache and refactor chat.message to populate it  
**Duration**: 1-1.5 hours  
**Dependencies**: Phase 1  
**Status**: ⏳ PENDING

**Deliverables:**
- [ ] `plugin/src/index.ts` — Add SessionMemoryCache interface (top of file)
- [ ] `plugin/src/index.ts` — Add sessionCaches Map (module scope, line ~171)
- [ ] `plugin/src/index.ts:268-374` — Refactor chat.message hook to use cache
- [ ] `plugin/src/index.ts:587-656` — Add session cleanup on session.deleted event

**Key Changes:**

```typescript
// Top of file (after imports)
interface SessionMemoryCache {
  structuredSections: Record<string, StructuredMemory[]>;
  profile: ProfileResult | null;
  semanticResults: MemoriesResponseMinimal;
  injectedMemoryIds: Set<string>;
  initialized: boolean;
  lastRefreshAt: number;
}

// Module scope (replace current injectedSessions Set)
const sessionCaches = new Map<string, SessionMemoryCache>();

// In chat.message hook (line 268+)
const cache = sessionCaches.get(input.sessionID);
const isFirstMessage = !cache?.initialized;

if (isFirstMessage) {
  // 4 parallel API calls (same as today)
  const [profileResult, ...] = await Promise.all([...]);
  
  // Store in cache instead of injecting
  sessionCaches.set(input.sessionID, {
    structuredSections: byType,
    profile: profileResult.success ? profileResult : null,
    semanticResults: { results: [] },  // empty, will be refreshed on turns 2+
    injectedMemoryIds: new Set(),
    initialized: true,
    lastRefreshAt: Date.now(),
  });
}

// In event hook (message.updated branch)
if (event.type === "session.deleted") {
  const sessionID = props?.info?.sessionID;
  if (sessionID) {
    sessionCaches.delete(sessionID);  // cleanup
  }
}
```

**Success Criteria:**
- Cache populated on turn 1
- Cache persists across turns
- Cache cleaned up on session.deleted
- No [MEMORY] injection yet (we'll do that in Phase 3)
- Existing E2E tests still pass

**Test Command:**
```bash
cd plugin && bun run build && cd ../testing && bun run test
```

---

### PHASE 3: System Transform Hook Implementation

**Goal**: Implement system.transform hook to inject [MEMORY] from cache into system prompt  
**Duration**: 1-1.5 hours  
**Dependencies**: Phase 2  
**Status**: ⏳ PENDING

**Deliverables:**
- [ ] `plugin/src/index.ts` — Add "experimental.chat.system.transform" hook (after chat.message)
- [ ] `plugin/src/index.ts` — Ensure output.system is handled correctly

**Implementation:**

```typescript
"experimental.chat.system.transform": async (input, output) => {
  if (!isConfigured()) return;

  const cache = sessionCaches.get(input.sessionID);
  if (!cache?.initialized) return;

  try {
    const memoryContext = formatContextForPrompt(
      cache.profile,
      { results: [] },  // user profile handled separately in formatContextForPrompt
      cache.semanticResults,
      cache.structuredSections
    );

    if (memoryContext) {
      output.system.push(memoryContext);
      log("system.transform: [MEMORY] injected", {
        length: memoryContext.length,
        sessionID: input.sessionID,
      });
    }
  } catch (error) {
    log("system.transform: ERROR", { error: String(error) });
  }
},
```

**Key Points:**
- Hook fires before every LLM call
- Reads from cache (no new API calls)
- Uses existing `formatContextForPrompt` function (no changes to context.ts)
- Appends to `output.system` array (can have multiple items)

**Success Criteria:**
- system.transform hook is registered
- [MEMORY] appears in system prompt (verify via logging)
- Plugin builds without errors
- Existing E2E tests still pass
- Turn 1 still works as before

**Test Command:**
```bash
cd plugin && bun run build && cd ../testing && bun run test
```

---

### PHASE 4: Per-Turn Semantic Refresh

**Goal**: Add semantic search on turns 2+ to refresh "Relevant to Current Task" section  
**Duration**: 1-1.5 hours  
**Dependencies**: Phase 3  
**Status**: ⏳ PENDING

**Deliverables:**
- [ ] `plugin/src/index.ts:268-378` — Add else branch to chat.message for turns 2+

**Implementation:**

```typescript
if (isFirstMessage) {
  // Phase 2 & 3 code (unchanged)
  ...
} else {
  // Turn 2+: Lightweight per-turn refresh
  const cache = sessionCaches.get(input.sessionID);
  if (cache?.initialized) {
    try {
      // 1 semantic search call (project scope only)
      const freshResults = await memoryClient.searchMemories(
        userMessage,
        tags.project,
        0.15  // recency weight
      );

      // Update cache with fresh results
      if (freshResults.success) {
        cache.semanticResults = { results: freshResults.results || [] };
        cache.lastRefreshAt = Date.now();

        log("chat.message: semantic refresh", {
          resultCount: freshResults.results?.length || 0,
          sessionID: input.sessionID,
        });
      }
    } catch (error) {
      log("chat.message: semantic refresh failed", { error: String(error) });
      // Continue anyway — cache still has old results
    }
  }
}
```

**Key Points:**
- Only runs on turns 2+
- Single semantic search call (~300ms latency)
- Updates cache.semanticResults (used by system.transform on next LLM call)
- Graceful fallback if search fails
- No breaking changes

**Success Criteria:**
- Semantic search runs on turn 2+ (verify via logging)
- Cache.semanticResults updated with fresh results
- No increased latency on turn 1
- Existing E2E tests still pass
- Per-turn latency +300ms is acceptable

**Test Command:**
```bash
cd plugin && bun run build && cd ../testing && bun run test
```

---

### PHASE 5: E2E Scenario & Validation

**Goal**: Create E2E scenario 11 to test mid-session memory refresh  
**Duration**: 1 hour  
**Dependencies**: Phases 1-4  
**Status**: ⏳ PENDING

**Deliverables:**
- [ ] `testing/src/scenarios/11-mid-session-retrieval.ts` — New scenario (100+ lines)
- [ ] `testing/src/runner.ts` — Register scenario 11

**Scenario Design:**

```typescript
// Session 1: Seed 10+ memories on diverse topics
// Turn 1: "Our auth uses JWT tokens in httpOnly cookies. Deployment is Kubernetes with Helm on GCP."
// → Auto-save creates 2-3 memories

// Session 2, Turn 1: "How is auth handled?"
// → [MEMORY] block contains JWT/cookies memories (from semantic search on "auth")
// → Agent answers correctly about httpOnly cookies
// ✅ ASSERTION: Response contains "httpOnly" or "secure"

// Session 2, Turn 2: "Now help me set up the deployment pipeline"
// → WITHOUT per-turn refresh: [MEMORY] would still focus on auth (stale)
// → WITH per-turn refresh: Semantic search on "deployment pipeline" surfaces K8s/Helm/GCP memories
// → Agent answers with Kubernetes/Helm details
// ✅ ASSERTION: Response contains "Kubernetes" or "Helm" or "GCP"

// Session 2, Turn 3: "What about database?"
// → Semantic refresh on "database" surfaces any DB-related memories
// ✅ ASSERTION: If DB memories exist, they're referenced

// Turn 1 [MEMORY]: Auth-focused
// Turn 2 [MEMORY]: Deployment-focused (refreshed)
// Turn 3 [MEMORY]: DB-focused (refreshed)
```

**Implementation:**

```typescript
export async function scenario11_midSessionRetrieval(): Promise<ScenarioResult> {
  const testDir = createTestDir("mid-session-retrieval");
  
  // Session 1: Seed memories
  const session1_result = await runOpencode(
    "Our auth uses JWT tokens in httpOnly cookies. Deployment is Kubernetes with Helm on GCP.",
    testDir
  );
  
  await Bun.sleep(5000); // Wait for auto-save
  
  // Session 2, Turn 1: Ask about auth
  const session2_turn1 = await runOpencode(
    "How is auth handled?",
    testDir
  );
  
  // Verify turn 1 recalls auth details
  const hasAuth = /httpOnly|secure|JWT|cookie/i.test(session2_turn1.text);
  
  // Session 2, Turn 2: Switch topic to deployment
  const session2_turn2 = await runOpencode(
    "Now help me set up the deployment pipeline",
    testDir
  );
  
  // Verify turn 2 recalls deployment details (freshly refreshed)
  const hasDeployment = /Kubernetes|Helm|GCP|kubectl|helm/i.test(session2_turn2.text);
  
  const assertions = [
    { label: "Turn 1 recalls auth details", pass: hasAuth },
    { label: "Turn 2 recalls deployment details (per-turn refresh)", pass: hasDeployment },
  ];
  
  await cleanupTestDirs([testDir]);
  
  return {
    id: "11",
    name: "Mid-Session Memory Retrieval",
    status: assertions.every(a => a.pass) ? "PASS" : "FAIL",
    assertions,
    testDirs: [testDir],
  };
}
```

**Register in runner.ts:**

```typescript
scenarios.push(scenario11_midSessionRetrieval);
```

**Success Criteria:**
- Scenario 11 passes (both assertions)
- Existing scenarios 1-10 still pass
- Full benchmark runs without regression
- No benchmark category drops >2%

**Test Commands:**
```bash
cd testing && bun run test:scenario 11
cd testing && bun run test                    # All scenarios
cd benchmark && bun run bench run             # Full benchmark
```

---

## METRICS & MEASUREMENT

### Before/After Validation

| Metric | Target | How Verified |
|--------|--------|--------------|
| Scenario 11 mid-session retrieval | 100% pass | `bun run test:scenario 11` |
| Scenarios 1-10 regression | 0 failures | `bun run test` |
| Full benchmark score | ≥92% (no drop >2% per category) | `bun run bench run` |
| Per-turn latency | +300ms on turns 2+ | Logging: `lastRefreshAt` timestamps |
| Token accumulation | 3K flat | Count [MEMORY] blocks in trace |
| Compaction survival | [MEMORY] still present post-compaction | Manual test or E2E if compaction scenario available |
| Semantic search quality | Hit@10 ≥ turn-1 quality | Implicit in scenario 11 pass |

### Rollback Indicators

Red flags that trigger rollback discussion:
- Scenario 11 consistently fails
- Any existing scenario (1-10) fails
- Benchmark drops >2% in any category
- Agent complaints about noisy context (manual dogfooding)
- Backend API errors or timeouts on search volume

---

## EDGE CASES & DECISIONS

### Resolved Edge Cases

| Edge Case | Decision | Why |
|-----------|----------|-----|
| Hook execution order | chat.message fires first, then system.transform | Verified in SDK type order |
| Empty semantic results | Graceful fallback to empty results array | formatContextForPrompt handles it |
| Compaction destroys [MEMORY] | Move to system prompt (never compacted) | System prompt is persistent |
| Cache eviction | Clean up on session.deleted event | Prevents memory leak |
| Search latency | 300ms acceptable, invisible vs LLM | LLM calls take 5-30 seconds |
| Similar queries on consecutive turns | Search every turn (freshness > dedup) | Simplicity + relevance prioritized |

### Outstanding Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Per-turn search gate | None — always search | Simplicity over micro-optimization |
| Similarity threshold per-turn | 0.55 (vs 0.45 turn 1) | Higher bar = less noise |
| Max semantic results | Top 3 | Keep token cost ~400 per turn |
| User prefs refresh | No — only once at turn 1 | User prefs don't change mid-session |
| Search scope turns 2+ | Project-only | User prefs already covered at turn 1 |

---

## ROLLBACK PLAN

### If Issues Detected

**Immediate Indicators:**
- Scenario 11 fails consistently
- Any existing E2E test fails
- Benchmark drops >2% in any category
- Latency spikes (search timeouts)

**Rollback Steps:**

```bash
# Option 1: Full revert
git revert <commit-hash>
git push origin main

# Option 2: Feature flag (if in production)
# Set ENABLE_PER_TURN_REFRESH = false in plugin/src/config.ts
```

**Investigation:**
- Review logs from failed scenario
- Check backend search latency
- Verify benchmark results per category
- Run isolated hook tests

**Recovery:**
1. Identify root cause
2. Create fix in new branch
3. Re-test scenario 11
4. Re-run full benchmark
5. Dogfood before re-deploying

---

## IMPLEMENTATION CHECKLIST

### Pre-Implementation

- [ ] Framework and design doc reviewed
- [ ] Confidence check completed (9/10+ across all areas)
- [ ] Existing E2E tests passing (scenarios 1-10)
- [ ] Benchmark baseline recorded
- [ ] Branch created: `feature/mid-session-retrieval`

### Phase 1: Tool Description

- [ ] `plugin/src/index.ts:382-383` updated
- [ ] `bun run build` succeeds
- [ ] `bun run test` passes (scenarios 1-10)
- [ ] Commit: "feat(memory): update tool description for proactive search"

### Phase 2: Session Cache

- [ ] SessionMemoryCache interface added
- [ ] sessionCaches Map created
- [ ] chat.message refactored to populate cache on turn 1
- [ ] session.deleted event cleaned up
- [ ] `bun run build` succeeds
- [ ] `bun run test` passes
- [ ] Commit: "feat(memory): add session-scoped cache infrastructure"

### Phase 3: System Transform Hook

- [ ] system.transform hook implemented
- [ ] [MEMORY] injected into system prompt (verify via logging)
- [ ] `bun run build` succeeds
- [ ] `bun run test` passes
- [ ] Commit: "feat(memory): inject [MEMORY] via system.transform hook"

### Phase 4: Per-Turn Refresh

- [ ] Semantic search added to turns 2+ (else branch)
- [ ] Cache.semanticResults updated per turn
- [ ] Latency logging added
- [ ] `bun run build` succeeds
- [ ] `bun run test` passes
- [ ] Commit: "feat(memory): auto-refresh "Relevant to Current Task" per turn"

### Phase 5: E2E Scenario & Validation

- [ ] Scenario 11 implemented and passing
- [ ] Scenarios 1-10 still passing
- [ ] Full benchmark run, ≥92% overall, no category drops >2%
- [ ] Manual dogfooding with real topic switches
- [ ] Commit: "test(memory): scenario 11 mid-session retrieval validation"
- [ ] PR created and merged

---

## CURRENT SESSION CONTEXT — SAVED FOR CONTINUITY

### Research Completed

- Hook system architecture: `chat.message` (line 227), `system.transform` (SDK line 195)
- Current injection mechanism: Synthetic message part on turn 1 (line 356-365)
- Compaction problem: Synthetic parts removed in session.summarize
- Semantic search latency: ~300ms per call (Voyage AI embedding + LanceDB)
- Session-scoped state: injectedSessions Set (line 171)

### Design Decisions Made

1. **System prompt over message parts**: Survives compaction, zero accumulation
2. **Session cache pattern**: Per-sessionID cache, cleared on session.deleted
3. **Per-turn search**: Always search (no heuristic gating) for simplicity
4. **Similarity threshold**: 0.55 for turns 2+ (vs 0.45 turn 1) to reduce noise
5. **No TDD**: Build fast, validate via E2E and benchmarking

### Code References

- `plugin/src/index.ts` — All implementation happens here
- `plugin/src/services/context.ts:44-138` — formatContextForPrompt (no changes)
- `plugin/src/config.ts` — Configuration (may add ENABLE_PER_TURN_REFRESH)
- `testing/src/scenarios/11-mid-session-retrieval.ts` — New E2E test

### Next Session Protocol

1. Read this design doc completely
2. Start Phase 1 (15 minutes — tool description)
3. Progress through phases 2-5 (~4-5 hours total)
4. After each phase: run `bun run test` and verify passing
5. After phase 5: run full benchmark, validate regression threshold
6. Update memory system with progress and learnings

---

## SUCCESS CRITERIA — FINAL CHECKLIST

### Implementation Success

- [ ] All 5 phases completed as designed
- [ ] No regressions: E2E scenarios 1-10 all pass
- [ ] No benchmark regression: ≥92% overall, no category drops >2%
- [ ] Per-turn refresh working: Scenario 11 passes
- [ ] Compaction survival: [MEMORY] present after compaction (if tested)
- [ ] Latency acceptable: +300ms per turn invisible vs LLM response time
- [ ] Code quality: No console errors, clean logs, maintainable structure

### Deployment Success

- [ ] Feature branch merged to main
- [ ] Design doc updated with actual implementation progress
- [ ] Memory system updated with feature completion and learnings
- [ ] No critical issues reported in dogfooding
- [ ] Benchmark baseline updated for future comparisons

---

**Status**: DESIGN COMPLETE — READY FOR IMPLEMENTATION

This design document captures all research, decisions, and implementation phases needed to build the per-turn memory refresh feature. Session continuity is preserved; next session can begin implementation immediately without re-research.
