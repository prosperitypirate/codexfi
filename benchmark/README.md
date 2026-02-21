# DevMemBench

A coding-assistant memory benchmark for [opencode-memory](../README.md). Evaluates recall quality across 8 developer-specific categories using a 5-phase LLM-as-judge pipeline with retrieval quality metrics.

Unlike general benchmarks (LongMemEval, LoCoMo), this dataset is designed around **coding assistant interactions**: architecture decisions, error fixes, tech stack, session continuity across days, and knowledge updates as a project evolves.

---

## Results

### v2 Baseline — 200 questions · 25 sessions · run `v2-baseline`

> Model: `claude-sonnet-4-6` (judge + answerer) · retrieval metrics now included

```
preference        ████████████████████ 100%  (25/25)  ✓  perfect
tech-stack        ████████████████████  96%  (24/25)  ✓
architecture      ████████████████████  96%  (24/25)  ✓
abstention        ██████████████████░░  92%  (23/25)  ✓
error-solution    █████████████████░░░  88%  (22/25)  ✓
knowledge-update  ██████████░░░░░░░░░░  52%  (13/25)  ⚠  regression vs v1
cross-synthesis   █████████░░░░░░░░░░░  44%  (11/25)  ⚠  regression vs v1
session-cont.     █████░░░░░░░░░░░░░░░  24%   (6/25)  ✗  retrieval miss
─────────────────────────────────────────────────────────────
Overall           74.0%  (148/200)
```

#### Retrieval Quality (K=8)

```
Hit@8        ███████████████░░░░░  76.5%   — did any relevant memory surface?
Precision@8  ████░░░░░░░░░░░░░░░░  17.0%   — fraction of retrieved results that are useful
F1@8         █████░░░░░░░░░░░░░░░  26.4%
MRR                               0.652   — rank of first relevant result
NDCG                              0.667   — ranking quality with position weighting
```

#### Retrieval by Category

| Category | Hit@8 | Prec@8 | MRR | NDCG | Accuracy |
|---|---|---|---|---|---|
| tech-stack | 100% | 20% | 0.91 | 0.91 | 96% |
| architecture | 88% | 19% | 0.86 | 0.84 | 96% |
| preference | 100% | 14% | 0.89 | 0.91 | 100% |
| error-solution | 92% | 15% | 0.88 | 0.88 | 88% |
| knowledge-update | 88% | 21% | 0.67 | 0.71 | 52% |
| cross-synthesis | 96% | 39% | 0.76 | 0.78 | 44% |
| **session-continuity** | **36%** | **8%** | **0.16** | **0.22** | **24%** |
| abstention | 12% | 2% | 0.09 | 0.10 | 92% |

#### Latency

```
Phase     min     mean   median    p95     p99
search    124ms   175ms   159ms   250ms   523ms
answer    662ms  3585ms  2758ms  7981ms  10441ms
```

---

### Baseline Diagnosis

The retrieval table separates retrieval failures from reasoning failures for the first time:

**session-continuity: 24% accuracy, Hit@8 = 36%**
The primary failure is retrieval, not reasoning. Questions like "What was session S11 focused on?" return Hit@8 = 36% — 64% of questions surface zero relevant memories. The vector index has no way to associate a question phrased around a session label ("S11", "S14") with memories that were stored by topic ("product catalog", "testing setup"). This is an indexing and query formulation problem.

**cross-session-synthesis: 44% accuracy, Hit@8 = 96%, Prec@8 = 39%**
Retrieval is working (96% Hit@8), but Precision is only 39% — the model gets a mix of relevant and irrelevant results and struggles to synthesize across them accurately. This is a reasoning/context problem, not retrieval.

**knowledge-update: 52% accuracy, Hit@8 = 88%**
Retrieval is finding the right memories, but some questions about temporal changes (e.g. "what ORM is currently used?") still surface older conflicting memories alongside newer ones. The superseding mechanism helps but doesn't catch all cases at the 200-question scale.

**Abstention at 92% with Hit@8 = 12%**
Working as designed — the system correctly says "I don't know" even when retrieval returns near-zero results for questions about information that was never stored.

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

### v2 vs v1 Comparison

The overall score dropped from 87.5% → 74.0% because the dataset is meaningfully harder:

| Factor | v1 (40q) | v2 (200q) |
|---|---|---|
| Questions per category | 5 | 25 |
| Score per wrong answer | 20pp | 4pp |
| Sessions | 10 | 25 |
| Retrieval metrics | none | Hit@8, Prec@8, MRR, NDCG |
| Session-continuity | 60% (3/5) | 24% (6/25) — harder questions |
| Cross-synthesis | 60% (3/5) | 44% (11/25) — more complex synthesis |

The v1 session-continuity questions asked about broadly-described sessions. The v2 questions ask specifically "what was session S11 about?" by label — which is a much harder retrieval problem since memories are stored by topic, not session ID.

---

### Improvement Roadmap (v2)

Sequenced by impact based on the retrieval diagnosis above.

#### Priority 1 — Session-label indexing for session-continuity (estimated +15–20pp)

**Problem:** Hit@8 = 36% for session-continuity. Questions reference sessions by ID (S11–S25) but memories are stored by topic. The vector index has no path from "session S14" to the memories about "asyncio.create_task and SendGrid email".

**Fix options:**
- Tag each memory with its source session ID at ingest time and support metadata filtering in search
- Add session summary memories explicitly (one memory per session: "S14 covered: fire-and-forget email with asyncio.create_task + SendGrid")
- Accept `session_id` as a search filter parameter in `POST /memories/search`

#### Priority 2 — Reduce retrieval noise for cross-synthesis (estimated +10pp)

**Problem:** Prec@8 = 39% for cross-synthesis — more than half the retrieved results are irrelevant. The model hallucinates or conflates unrelated facts.

**Fix options:**
- Reranking pass after semantic search: score the top-16 by relevance to the question, return top-8
- Raise `similarityThreshold` for multi-session synthesis queries

#### Priority 3 — Knowledge-update precision (estimated +5–10pp)

**Problem:** Hit@8 = 88% but accuracy only 52%. Old and new memories are both surfacing. Superseding catches direct contradictions but not temporal updates across long chains.

**Fix options:**
- Extend superseding to multi-hop: if A supersedes B, and C supersedes A, B should also be excluded
- Add `valid_as_of` date field and filter by recency when `knowledge-update` category is detected

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

| Category | Tests | v2 Score |
|---|---|---|
| `tech-stack` | Language, framework, infra choices | 96% |
| `architecture` | System design, component relationships, API contracts | 96% |
| `session-continuity` | What happened in a specific session by date or label | 24% |
| `preference` | Developer style, tool preferences, conventions | 100% |
| `error-solution` | Specific bugs fixed with exact details | 88% |
| `knowledge-update` | Updated facts superseding older ones | 52% |
| `cross-session-synthesis` | Patterns spanning multiple sessions | 44% |
| `abstention` | Correctly declining when info was never stored | 92% |

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
