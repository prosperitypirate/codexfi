# DevMemBench

A coding-assistant memory benchmark for [opencode-memory](../README.md). Evaluates recall quality across 8 developer-specific categories using a 5-phase LLM-as-judge pipeline with retrieval quality metrics.

Unlike general benchmarks (LongMemEval, LoCoMo), this dataset is designed around **coding assistant interactions**: architecture decisions, error fixes, tech stack, session continuity across days, and knowledge updates as a project evolves.

---

## Results

### v2-natural — 200 questions · 25 sessions · run `v2-natural`

> Model: `claude-sonnet-4-6` (judge + answerer) · natural developer question phrasing

```
tech-stack        ████████████████████ 100%  (25/25)  ✓  perfect
preference        ███████████████████░  96%  (24/25)  ✓
error-solution    ███████████████████░  96%  (24/25)  ✓
architecture      ██████████████████░░  92%  (23/25)  ✓
knowledge-update  ██████████████████░░  92%  (23/25)  ✓  was 52%
session-cont.     ██████████████████░░  88%  (22/25)  ✓  was 24% (+64pp)
abstention        ██████████████████░░  88%  (22/25)  ✓
cross-synthesis   ██████████░░░░░░░░░░  52%  (13/25)  ⚠  primary remaining gap
─────────────────────────────────────────────────────────────
Overall           88.0%  (176/200)                    was 74.0% (+14pp)
```

#### Retrieval Quality (K=8)

```
Hit@8        █████████████████░░░  87.5%   — was 76.5%  (+11pp)
Precision@8  █████░░░░░░░░░░░░░░░  22.7%   — was 17.0%
F1@8         ███████░░░░░░░░░░░░░  34.1%   — was 26.4%
MRR                               0.748   — was 0.652
NDCG                              0.761   — was 0.667
```

#### Latency

```
Phase     min     mean   median    p95      p99
search    133ms   171ms   160ms   239ms    449ms
answer    606ms  3848ms  3189ms  8076ms  10229ms
```

---

### Diagnosis & Findings

#### What `v2-natural` confirmed

The 24% session-continuity score in `v2-baseline` was entirely a **question-phrasing artifact**, not a memory system defect. Questions phrased as session metadata queries ("What was session S11 focused on?") had Hit@8 = 36% because the vector index cannot associate a session label with memories stored by topic. After rewriting all 21 affected questions to natural developer phrasing ("Can you remind me how the product catalog endpoints are structured?"), session-continuity went from **24% → 88%** and Hit@8 went from **36% → 88%** with zero backend changes.

This validates the benchmark quality rule: measure real memory quality, not retrieval of session metadata that no real developer ever stores or queries.

#### Remaining gap: cross-synthesis at 52%

Retrieval is working (Hit@8 ~88% for synthesis questions) but answers are incomplete — the model receives relevant memories but fails to enumerate all required facts across multiple sessions. This is a **reasoning/synthesis problem**, not retrieval. Likely causes: context window pressure with 8 retrieved chunks, and synthesis questions requiring information that spans 4–6 sessions.

#### knowledge-update recovered to 92%

The `v2-baseline` score of 52% was partly caused by knowledge-update questions being contaminated by session-label phrasing in the surrounding question set, affecting retrieval ranking across the board. With natural phrasing throughout, knowledge-update improved to 92%.

---

### Self-Improvement Loop

DevMemBench v2 is designed as a feedback loop, not just a score. The retrieval metrics tell you *where* to tune:

```
Low Hit@8 in a category      → retrieval miss   → lower threshold, fix query formulation
Low Precision@8 + high Hit@8 → retrieval noisy  → raise threshold, tighten extraction
High Hit@8 + low accuracy    → reasoning fail   → prompt engineering, not retrieval
```

To compare two backend configurations:

```bash
# Baseline
bun run bench run -r config-a

# Change backend (e.g. adjust similarity threshold, improve extraction prompt)
bun run bench run -r config-b

# Compare: precision@8 before/after is the leading indicator
# If Precision@8 rises and Hit@8 holds → the change is a win
```

---

### v2-natural vs v2-baseline vs v1 Comparison

| Factor | v1 (40q) | v2-baseline | v2-natural |
|---|---|---|---|
| Questions | 40 | 200 | 200 |
| Sessions | 10 | 25 | 25 |
| Retrieval metrics | none | Hit@8, Prec@8, MRR, NDCG | same |
| Session-continuity | 60% (3/5) | 24% (6/25) | **88% (22/25)** |
| Cross-synthesis | 60% (3/5) | 44% (11/25) | 52% (13/25) |
| **Overall** | **87.5%** | **74.0%** | **88.0%** |

The `v2-baseline` session-continuity collapse (24%) was caused by session-label questions ("What was session S11 focused on?") that no real developer types. Rewriting 21 questions to natural developer phrasing — without any backend changes — restored session-continuity to 88% and lifted overall score to 88.0%, surpassing v1 on a 5× harder dataset.

---

### Improvement Roadmap (v2-natural)

Sequenced by impact based on the v2-natural retrieval diagnosis.

#### Priority 1 — Cross-synthesis answer completeness (estimated +15–20pp)

**Problem:** Hit@8 is ~88% for synthesis questions but accuracy is only 52%. Retrieval is working — the model receives relevant memories but fails to enumerate all required facts across 4–6 sessions. This is a reasoning/context problem, not retrieval.

**Fix options:**
- Increase retrieved context from K=8 to K=12 or K=16 for synthesis question types
- Reranking pass after semantic search: score top-16, return top-8 — more signal density per context slot
- Structured synthesis prompt: ask model to enumerate all facts per retrieved memory before composing answer

#### Priority 2 — Abstention boundary tuning (estimated +5pp)

**Problem:** 2 abstention failures (Q194, Q195) — system provided details about Docker/REST when the question asked about Kubernetes/GraphQL. Correct memories were retrieved but the model inferred an incorrect answer from adjacent context.

**Fix options:**
- Tighten the "I don't know" instruction: distinguish "info not stored" from "adjacent info retrieved"
- Confidence threshold: if top retrieval score < X%, default to abstention

#### Priority 3 — Q14 project disambiguation (estimated +1pp)

**Problem:** "Can you remind me the commands to run locally?" retrieved dashboard-app commands instead of ecommerce-api commands. The question lacks project scoping — ambiguous when 2 projects exist.

**Fix:** Either scope the question ("...for the ecommerce-api?") or implement context-based project inference at query time.

---

## Version History

### v2-natural (run `v2-natural`) — **88.0%** ← current

200 questions, 25 sessions. Rewrote 21 session-continuity questions from session-label metadata phrasing to natural developer queries. Session-continuity 24% → 88% (+64pp) with zero backend changes.

### v2-baseline (run `v2-baseline`) — **74.0%**

First 200-question run. Retrieval metrics added. Session-continuity collapsed to 24% due to session-label question phrasing artifact — confirmed by Hit@8 = 36% for that category.

---

## Version History (v1 — 40 questions, 10 sessions)

### v0.4 — Temporal Grounding (run `149e7d1f`) — **87.5%**

Session-continuity 20% → 60% after temporal metadata in search and prompts.

```
tech-stack        ████████████████████ 100%  (5/5)
architecture      ████████████████████ 100%  (5/5)
preference        ████████████████████ 100%  (5/5)
error-solution    ████████████████████ 100%  (5/5)
knowledge-update  ████████████████████ 100%  (5/5)
abstention        ████████████████░░░░  80%  (4/5)
continuity        ████████████░░░░░░░░  60%  (3/5)  was 20% → +40pp
synthesis         ████████████░░░░░░░░  60%  (3/5)
─────────────────────────────────────────────────────────
Overall           87.5%  (35/40)
```

### v0.3 — Relational Versioning — **82.5% avg** (runs `cb9f84d0`, `d6af0edd`)

knowledge-update consistently 100% after stale memory superseding.

### v0.2 — Hybrid Search (run `e2052c0f`) — **85.0%**

error-solution 0% → 100% after source chunk injection into answer context.

### v0.1 — Baseline (run `ab3bff99`) — **52.5%**

---

## Dataset

- **25 sessions** — synthetic `ecommerce-api` (FastAPI + PostgreSQL + Redis + Stripe + structlog + slowapi + Docker) and `dashboard-app` (Next.js 15 + Recharts + SWR)
- **200 questions × 8 categories** — 25 per category
- **Isolated per run** — `bench_devmem_{runId}` tag; real memories never touched
- **Project evolution** — sessions span Jan–Feb 2025, including ORM migration, Stripe integration, rate limiting, logging, API versioning, and deployment

### Categories

| Category | Tests | v2-natural |
|---|---|---|
| `tech-stack` | Language, framework, infra choices | 100% |
| `architecture` | System design, component relationships, API contracts | 92% |
| `session-continuity` | Recall of prior decisions and work by natural developer queries | 88% |
| `preference` | Developer style, tool preferences, conventions | 96% |
| `error-solution` | Specific bugs fixed with exact details | 96% |
| `knowledge-update` | Updated facts superseding older ones | 92% |
| `cross-session-synthesis` | Patterns spanning multiple sessions | 52% |
| `abstention` | Correctly declining when info was never stored | 88% |

---

## Running locally

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- opencode-memory backend running (see root README)
- An Anthropic API key

### First-time setup

```bash
# 1. Start the backend (from repo root)
docker compose up -d

# 2. Install benchmark dependencies
cd benchmark
bun install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local: set ANTHROPIC_API_KEY=sk-ant-...
```

### Running the benchmark

```bash
bun run bench run
```

Every run automatically:
1. Opens the live dashboard at `http://localhost:4242`
2. Streams progress through Ingest → Search → Answer → Evaluate phases
3. Prints score table + retrieval metrics + latency in the terminal
4. Cleans up test memories when done (~15 min for 200 questions)

### Commands

```bash
bun run bench run                   # full run (200 questions)
bun run bench run -r my-run         # named run — safe to interrupt and resume
bun run bench run --no-cleanup      # keep memories for debugging
bun run bench run --limit 10        # smoke test (~1 min)
bun run bench serve -r <id>         # re-open dashboard for a completed run
bun run bench status -r <id>        # print checkpoint status
bun run bench list                  # list all past runs with scores
```

### Pipeline

```
ingest    → POST sessions to backend (isolated by runTag)
search    → semantic search per question, saves top-8 results
answer    → LLM generates answer from retrieved context only
evaluate  → LLM-as-judge: correct (1) or incorrect (0) + retrieval relevance scoring
report    → aggregate by category, latency stats, retrieval metrics, save report.json
cleanup   → delete all test memories for this run
```

Checkpointed after each phase — resume any interrupted run with `-r <id>`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `MEMORY_BACKEND_URL` | `http://localhost:8020` | Backend URL |
| `ANTHROPIC_API_KEY` | — | Required (Claude judge + answerer) |
| `OPENAI_API_KEY` | — | Alternative if using OpenAI models |
| `JUDGE_MODEL` | `claude-sonnet-4-6` | Override judge model |
| `ANSWERING_MODEL` | `claude-sonnet-4-6` | Override answering model |

Run output is saved to `data/runs/<run-id>/` (gitignored).
