# Feature Design Framework

**Purpose**: Repeatable methodology for designing and implementing major features across all areas of the project — plugin, backend, frontend, testing, benchmarking, infrastructure, or any combination.

**Version**: 2.0  
**Created**: February 22, 2026  
**Updated**: February 22, 2026

---

## When to Use This Framework

Use this framework for any change that:
- Touches multiple files or components
- Introduces a new user-facing behavior
- Changes data flow, storage, or API contracts
- Requires E2E or benchmark validation
- Could cause regressions if done wrong

Skip it for trivial fixes, typos, or single-file config changes.

---

## Design Document Template

Every feature gets a numbered design doc in `.github/designs/`:

```
.github/designs/
  FEATURE-DESIGN-FRAMEWORK.md   ← this file (process)
  001-per-turn-memory-refresh.md ← example feature doc
  002-<feature-name>.md          ← next feature
```

A design doc should contain at minimum:
1. **Executive Summary** — problem, solution, why it works
2. **Current State** — code references showing how things work today
3. **Architecture** — data flow, component interactions, diagrams
4. **Implementation Phases** — ordered, each with deliverables and success criteria
5. **Edge Cases & Decisions** — resolved and outstanding
6. **Metrics** — how to measure before/after
7. **Rollback Plan** — how to undo if things go wrong

---

## Framework Phases

### Phase 1: Discovery

Structured requirements gathering. Ask these before writing any code:

**Core:**
1. What problem does this solve? (User pain, system limitation)
2. Who is affected? (End users, agents, developers, automated systems)
3. What does the ideal behavior look like? (Step-by-step)
4. How do we know it works? (Measurable success criteria)

**Technical:**
5. Which components are involved? (Plugin, backend, frontend, infra)
6. Does this integrate with existing systems? (Hooks, APIs, DB, UI)
7. What are the performance constraints? (Latency, tokens, throughput, bundle size)
8. What data changes are needed? (New types, schemas, API contracts)

**Implementation:**
9. What's the priority and timeline?
10. Are there blocking constraints? (SDK limitations, API limits, dependencies)
11. What testing is required? (E2E, benchmark, unit, manual)
12. What's the rollback strategy? (Feature flag, revert, config toggle)

**Adaptive follow-ups by area:**

| Area | Additional Questions |
|------|---------------------|
| Plugin | Which hooks? Execution order? Session state? Compaction interaction? |
| Backend | New endpoints? Schema changes? Search logic? Scaling? |
| Frontend | New routes/pages? State management? Responsive? Accessibility? |
| Testing | Which scenarios? Assertion patterns? Cleanup/isolation? |
| Benchmark | Scoring criteria? Regression threshold? New categories? |

---

### Phase 2: Analysis

Study the codebase systematically before designing.

**For each relevant file:**
```
File: path/to/file
Purpose: What it does
Key Patterns: Notable functions, classes, hooks
Integration Points: What it connects to
Modification Impact: What breaks if this changes
```

**Integration impact assessment:**
- Which components talk to each other?
- What's the data contract between them?
- Where are the error boundaries?
- What existing tests cover this area?

---

### Phase 3: Design

Break the feature into ordered phases. Each phase should be independently committable and testable.

**Phase template:**

```markdown
### PHASE X: [Name]

**Goal**: Clear, measurable objective
**Duration**: Realistic estimate
**Dependencies**: What must be complete first
**Status**: PENDING | IN PROGRESS | DONE

**Deliverables:**
- [ ] `file/path` — description of change
- [ ] `file/path` — description of change

**Success Criteria:**
- Observable behavior change
- No regressions
- Tests pass
- Performance budget met

**Implementation Notes:**
- Key decisions
- Patterns to follow
- Error handling approach
```

**Phase completion record:**

```markdown
### PHASE X — COMPLETED

**Date**: [date]
**Duration**: X hours
**Commit**: [hash]

**What was done:**
1. [Step]
2. [Step]

**Files changed:**
- [path] — [what changed]

**Learnings:**
- [Anything unexpected]
```

---

### Phase 4: Validation

Before merging:
- [ ] All phase success criteria met
- [ ] No E2E scenario regressions
- [ ] No benchmark regressions (if applicable)
- [ ] Manual dogfooding (if user-facing)
- [ ] Design doc updated with completion status

---

## Confidence Check

Before starting implementation, rate confidence 0-10 on each area the feature touches. If any area scores below 8, do more research before coding.

Example:

| Area | Score | If < 8 |
|------|-------|--------|
| Component A behavior | _/10 | Read source, trace execution |
| Component B API | _/10 | Study endpoints, test manually |
| Integration pattern | _/10 | Review existing examples |
| Testing approach | _/10 | Study similar scenarios |

**Target: 9/10 minimum across all areas before starting.**

---

## Edge Cases

Document edge cases in three tiers:

| Priority | Template |
|----------|----------|
| **High** — must resolve before implementation | `Edge case → Decision → Implementation approach` |
| **Medium** — should resolve, can defer | `Edge case → Proposed approach → Deferral risk` |
| **Low** — acceptable to leave unresolved | `Edge case → Why it's acceptable` |

---

## Decision Log

Track every non-obvious decision in the design doc:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| [What was decided] | [What was chosen] | [Why this over alternatives] |

This is the most valuable section for future maintainers. Be explicit about trade-offs.

---

## Metrics & Measurement

Define before/after metrics for every feature:

| Metric | How Measured | Baseline | Target |
|--------|-------------|----------|--------|
| [What to measure] | [Tool or method] | [Current value] | [Goal] |

Common metrics by area:

| Area | Typical Metrics |
|------|----------------|
| Plugin | Hook latency, token cost, injection correctness |
| Backend | API latency, search accuracy (Hit@K, MRR), memory count |
| Frontend | Load time, interaction latency, bundle size |
| Testing | Scenario pass rate, assertion coverage |
| Benchmark | Overall score, per-category score, regression threshold |

---

## Rollback Plan

Every design doc must include a rollback plan:

**Detection** — what signals indicate a problem:
- Test failures
- Benchmark regression (>2% in any category)
- User-reported issues
- Latency spikes or errors

**Immediate rollback:**
```bash
git revert <commit-hash>
```

**Graceful degradation** — prefer config-based disable over full revert:
```typescript
// Add a toggle in the relevant config file
ENABLE_<FEATURE>: boolean = true
```

**Recovery steps:**
1. Disable or revert
2. Investigate root cause
3. Fix in new branch
4. Re-validate (tests, benchmark, dogfooding)
5. Re-deploy

---

## Diagram Standards

Design docs should include diagrams for complex flows.

**ASCII diagrams** (always include — works everywhere):
```
┌─────────────┐     ─────▶     ┌─────────────┐
│  Component  │                │  Component  │
└─────────────┘     ◀─────     └─────────────┘
```

**Mermaid diagrams** (optional — for richer visuals):

Use dark theme config:
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

| Diagram Type | When to Include |
|-------------|-----------------|
| Architecture flowchart | All features |
| Sequence diagram | Multi-component features |
| State diagram | Features with status/workflow transitions |
| Data flow diagram | Features involving storage or caching |

---

## Session Continuity

Design docs serve as continuity artifacts. If context is lost mid-implementation:

1. **Read the design doc** — it has everything needed to resume
2. **Check phase status** — see which phases are DONE vs PENDING
3. **File references** — all code locations include paths (and line numbers where relevant)
4. **Decision log** — rationale for every choice already made
5. **Test commands** — exact commands to validate each phase

---

## Best Practices

**Discovery:**
- Ask "why" before "how"
- Validate that success metrics are measurable
- Identify integration points early
- Document edge cases as you find them

**Analysis:**
- Study at least 2-3 existing examples in the codebase
- Verify assumptions experimentally (don't trust memory)
- Document findings with file paths
- Check for breaking changes to existing behavior

**Design:**
- Be specific about deliverables (exact file paths, not "update the config")
- Plan for rollback from the start
- Keep phases independently committable
- Document all assumptions explicitly

**Implementation:**
- Follow the phase structure — don't skip ahead
- After each phase: run tests, update the design doc
- Commit with clear messages referencing the design doc
- Document unexpected issues or learnings immediately

**Completion:**
- Update design doc with final status
- Save key learnings to project memory
- Run full validation suite before merging
- Clean up any temporary scaffolding
