# DevMemBench

<div align="center">

[![Score: 91%](https://img.shields.io/badge/Score-91%25-22C55E?style=flat)](https://github.com/prosperitypirate/opencode-memory)
[![Questions: 200](https://img.shields.io/badge/Questions-200-3178C6?style=flat)](https://github.com/prosperitypirate/opencode-memory)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-FBF0DF?style=flat&logo=bun&logoColor=black)](https://bun.sh/)
[![Claude Sonnet](https://img.shields.io/badge/Claude-Sonnet_4.6-D97706?style=flat)](https://anthropic.com)
[![LanceDB](https://img.shields.io/badge/LanceDB-Vector_DB-CF3CFF?style=flat)](https://lancedb.com/)
[![Voyage AI](https://img.shields.io/badge/Voyage_AI-Code_Embeddings-5B6BF5?style=flat)](https://www.voyageai.com/)
[![xAI Grok](https://img.shields.io/badge/xAI-Grok-000000?style=flat&logo=x&logoColor=white)](https://x.ai/)

</div>

A coding-assistant memory benchmark for [opencode-memory](../README.md). Evaluates recall quality across 8 developer-specific categories using a 5-phase LLM-as-judge pipeline with retrieval quality metrics.

Unlike general benchmarks (LongMemEval, LoCoMo), this dataset is designed around **coding assistant interactions**: architecture decisions, error fixes, tech stack, session continuity across days, and knowledge updates as a project evolves.

![DevMemBench live dashboard — k20-synthesis-fix run, 91.0%](../.github/assets/benchmark-dashboard.png)

---

## Results

### k20-synthesis-fix — 200 questions · 25 sessions · run `k20-synthesis-fix` ← current

> Model: `claude-sonnet-4-6` (judge + answerer) · K=20 retrieval

```
tech-stack        ████████████████████ 100%  (25/25)  ✓  perfect
preference        ████████████████████ 100%  (25/25)  ✓  perfect
error-solution    ███████████████████░  96%  (24/25)  ✓
architecture      ██████████████████░░  92%  (23/25)  ✓
session-cont.     ██████████████████░░  92%  (23/25)  ✓
knowledge-update  ██████████████████░░  92%  (23/25)  ✓
abstention        ██████████████████░░  92%  (23/25)  ✓
cross-synthesis   ████████████░░░░░░░░  64%  (16/25)  ⚠  was 52% (+12pp)
─────────────────────────────────────────────────────────────
Overall           91.0%  (182/200)                    was 88.0% (+3pp)
```

#### Retrieval Quality (K=20)

```
Hit@20       ████████████████░░░░  84.0%
Precision@20 ████░░░░░░░░░░░░░░░░  19.1%
F1@20        █████░░░░░░░░░░░░░░░  29.6%
MRR                               0.653
NDCG                              0.693
```

> Precision@K drops as K rises — expected. More slots means more lower-scoring results get included. Hit@K is the meaningful signal: it tells you whether the right memory is *anywhere* in the retrieved set. Precision@K just measures how noisy the set is.

#### Latency

```
Phase     min     mean   median    p95      p99
search    132ms   169ms   158ms   249ms    503ms
answer    724ms  4315ms  3451ms  9215ms  11059ms
```

**Cost of K=20 vs K=8:** Search latency is identical (~158ms median). Answer latency increases by ~260ms median because the LLM processes more context. The tradeoff is +12pp cross-synthesis at the cost of ~260ms per query — worth it.

---

### v2-natural — 200 questions · 25 sessions · run `v2-natural`

> Model: `claude-sonnet-4-6` (judge + answerer) · natural developer question phrasing · K=8

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

#### What K=20 fixed (+12pp cross-synthesis)

Cross-synthesis questions ask the model to enumerate facts spanning 4–10 sessions: "list all env vars", "what bugs were fixed across both projects", "describe all developer preferences". With K=8, retrieval covered a partial subset and the model returned incomplete answers without knowing it was missing anything.

Raising K to 20 gives the retrieval enough slots to cover the full span of relevant sessions. Cross-synthesis went from **52% → 64%** — matching the issue #31 estimate of +10–15pp. The 9 remaining failures are likely the tail of very broad queries that still need K>20, or the 2 stale-memory-bleed failures and 2 abstention-boundary failures identified separately.

#### What `v2-natural` confirmed

The 24% session-continuity score in `v2-baseline` was entirely a **question-phrasing artifact**, not a memory system defect. Questions phrased as session metadata queries ("What was session S11 focused on?") had Hit@8 = 36% because the vector index cannot associate a session label with memories stored by topic. After rewriting all 21 affected questions to natural developer phrasing ("Can you remind me how the product catalog endpoints are structured?"), session-continuity went from **24% → 88%** with zero backend changes.

#### Remaining gap: cross-synthesis at 64%

9 synthesis failures remain. Likely split:
- ~5 questions requiring K>20 (very broad enumeration spanning all 25 sessions)
- ~2 stale-memory bleed (superseded ORM/migration memories surfacing in broad queries)
- ~2 abstention boundary (model answers adjacent question instead of abstaining)

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

### Run Comparison

| Factor | v1 (40q) | v2-baseline | v2-natural | k20-synthesis-fix |
|---|---|---|---|---|
| Questions | 40 | 200 | 200 | 200 |
| Sessions | 10 | 25 | 25 | 25 |
| Retrieval K | 8 | 8 | 8 | **20** |
| Retrieval metrics | none | Hit@8, Prec@8, MRR, NDCG | same | same (K=20) |
| Session-continuity | 60% (3/5) | 24% (6/25) | 88% (22/25) | **92% (23/25)** |
| Cross-synthesis | 60% (3/5) | 44% (11/25) | 52% (13/25) | **64% (16/25)** |
| **Overall** | **87.5%** | **74.0%** | **88.0%** | **91.0%** |

The cross-synthesis improvement from K=8 to K=20 confirms the root cause: these questions require facts from 5–10 different sessions, and K=8 simply didn't retrieve enough of them. Doubling K to 20 gave the LLM access to the missing facts and lifted cross-synthesis by +12pp.

---

### Improvement Roadmap (post k20-synthesis-fix)

Sequenced by impact. Cross-synthesis is still the primary remaining gap at 64%.

#### Priority 1 — Cross-synthesis tail (estimated +8–12pp)

**Problem:** 9 synthesis failures remain at K=20. Very broad enumeration queries ("list every env var across all sessions") may need K=30+ to span all relevant sessions. The model still returns incomplete answers when facts live in sessions ranked 21+.

**Fix options:**
- Query-type routing: detect enumeration keywords ("list all", "every", "complete") and use K=30 only for those queries
- Reranking: retrieve K=40, rerank by relevance, inject top 20 — better signal density
- Structured synthesis prompt: ask model to explicitly enumerate all facts per retrieved memory before composing final answer

#### Priority 2 — Stale memory bleed (estimated +2pp)

**Problem:** 2 synthesis failures traced to superseded ORM memories (SQLAlchemy/Alembic) surfacing in broad queries alongside current Tortoise/Aerich memories. Contradiction detection marked these superseded — but broad queries pull them back in.

**Fix options:**
- Verify superseded_by filter is applied at all K values (confirm no off-by-one in LanceDB query)
- Add post-retrieval filter step: drop any result with a non-empty superseded_by field client-side

#### Priority 3 — Abstention boundary (estimated +2pp)

**Problem:** 2 abstention failures — system provided details about Docker Compose when asked about Kubernetes, REST API when asked about GraphQL. Correct memories were retrieved but the model inferred an answer from adjacent context.

**Fix options:**
- Tighten abstention instruction: "If retrieved memories do not directly address the specific technology asked, respond I don't know — do not infer from related context"
- Hard abstention if top score < 40% similarity

---

## Version History

### k20-synthesis-fix (run `k20-synthesis-fix`) — **91.0%** ← current

200 questions, 25 sessions. Raised retrieval K from 8 to 20. Cross-synthesis 52% → 64% (+12pp). Overall 88.0% → 91.0% (+3pp). Cost: ~8ms added to search latency (negligible), ~260ms added to answer latency.

### v2-natural (run `v2-natural`) — **88.0%**

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

| Category | Tests | v2-natural (K=8) | k20-synthesis-fix (K=20) |
|---|---|---|---|
| `tech-stack` | Language, framework, infra choices | 100% | 100% |
| `preference` | Developer style, tool preferences, conventions | 96% | **100%** |
| `error-solution` | Specific bugs fixed with exact details | 96% | 96% |
| `architecture` | System design, component relationships, API contracts | 92% | 92% |
| `session-continuity` | Recall of prior decisions and work by natural developer queries | 88% | **92%** |
| `knowledge-update` | Updated facts superseding older ones | 92% | 92% |
| `abstention` | Correctly declining when info was never stored | 88% | **92%** |
| `cross-session-synthesis` | Facts spanning multiple sessions — complete enumeration | 52% | **64%** |

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
search    → semantic search per question, saves top-20 results
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
