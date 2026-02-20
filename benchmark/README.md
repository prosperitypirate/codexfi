# DevMemBench

A coding-assistant memory benchmark for [opencode-memory](../README.md). Evaluates recall quality across 8 developer-specific categories using a 5-phase LLM-as-judge pipeline.

Unlike general benchmarks (LongMemEval, LoCoMo), this dataset is designed around **coding assistant interactions**: architecture decisions, error fixes, tech stack, session continuity across days, and knowledge updates as a project evolves.

---

## Baseline Results — Run `ab3bff99`

> Model: `claude-sonnet-4-6` (judge + answerer) · Backend: opencode-memory v0.1 · 40 questions · 10 sessions

### Overall: 52.5% (21/40)

```
preference        ████████████████████ 100%  (5/5)  ✓
tech-stack        ████████████████░░░░  80%  (4/5)  ✓
architecture      ████████████████░░░░  80%  (4/5)  ✓
abstention        ████████████████░░░░  80%  (4/5)  ✓
knowledge-update  ████████░░░░░░░░░░░░  40%  (2/5)  ⚠
session-cont.     ████░░░░░░░░░░░░░░░░  20%  (1/5)  ✗
cross-synthesis   ████░░░░░░░░░░░░░░░░  20%  (1/5)  ✗
error-solution    ░░░░░░░░░░░░░░░░░░░░   0%  (0/5)  ✗
```

---

## Root Cause Analysis

The 4 failing categories share 3 concrete root causes, each of which maps directly to a Supermemory architectural technique.

### 1. Memory summaries lose technical specifics → `error-solution` 0%

The backend LLM extracts a short atomic fact per message. Specific values (exact error messages, config numbers, function names) are compressed into prose and lost:

```
Session said:   max_connections=50, socket_connect_timeout=5, socket_timeout=5
Memory stored:  "Always check Redis connection pool settings first for timeout spikes"
```

The search found the right memory (score 55–73%) but the answering model had no access to the actual values, so it either hedged ("I don't know the specific settings") or hallucinated plausible numbers.

**Supermemory's fix:** Hybrid search — semantic search on atomic memories to locate the right result, then inject the **original source chunk** (raw conversation text) into the answer context. The LLM reads the precise code/config from the chunk, not from the compressed memory summary.

---

### 2. Stale memories are never superseded → `knowledge-update` 40%, `cross-session-synthesis` 20%

The project migrated from SQLAlchemy → Tortoise ORM across sessions. Both memories coexist in the store with equal weight:

```
S01 (Jan 15):  "Use SQLAlchemy ORM and Alembic for migrations"   ← stale
S05 (Jan 20):  "Switched to Tortoise ORM and Aerich"             ← current
```

When asked "what ORM is used?", the LLM received both and guessed wrong (SQLAlchemy). Q31 and Q32 both failed this way — they explicitly asked about the current state but got the old state.

**Supermemory's fix:** Relational versioning — when ingesting a memory that contradicts an existing one, create an `updates` relationship. Old memories are excluded from search results or ranked lower. This creates a version chain instead of a flat pile of facts.

---

### 3. Search recall fails for recency queries → `session-continuity` 20%

Q11 ("What was the most recent session focused on?") and Q12/Q14 returned 0 results. The queries used natural-language recency framing ("most recent", "last time we worked on X") that didn't match any stored memory text semantically.

The backend has no concept of time in retrieval — every memory is searched by cosine similarity alone, with no temporal weighting or metadata filtering.

**Supermemory's fix:** Dual-layer timestamps — `documentDate` (when the conversation happened) and `eventDate` (when the described event occurred). Retrieval can filter or boost by recency. Their answering prompt also explicitly instructs the LLM to use temporal context when reasoning about "recent" queries.

---

## Comparison with Supermemory

Supermemory published [LongMemEval_s](https://supermemory.ai/research) results (general conversational memory, 500 questions):

| System | Overall |
|---|---|
| Full-context GPT-4o | 60.2% |
| Zep (GPT-4o) | 71.2% |
| **Supermemory (GPT-4o)** | **81.6%** |
| Supermemory (Gemini 2.5 Pro) | 85.2% |

Our 52.5% is on a different dataset (coding context, different categories), so these are not directly comparable. What is comparable is **why** they score higher:

| Supermemory technique | Their result uplift | Our gap |
|---|---|---|
| Hybrid search (memory → source chunk) | +22.9% on temporal-reasoning | error-solution 0% |
| Relational versioning (`updates` link) | +6.2% on knowledge-update | knowledge-update 40%, synthesis 20% |
| Temporal grounding (documentDate + eventDate) | +22.9% on temporal-reasoning | session-continuity 20% |
| Contextual memory extraction | Reduces ambiguity across all categories | architecture 1 miss, abstention 1 miss |

The 3 improvements below directly address each technique.

---

## Improvement Roadmap

These are sequenced by estimated impact. Each is a separate backend PR.

### Priority 1 — Hybrid search: store and return source chunks

**Impact estimate: error-solution 0% → ~60%, session-continuity partial improvement**

Currently: `POST /memories/search` returns only the extracted memory string.

Fix: Store the original conversation text alongside each memory. When returning search results, include both:
```json
{
  "memory": "Always check Redis connection pool settings first...",
  "chunk":  "user: we're getting connection timeouts in prod\nassistant: ... set max_connections=50, socket_connect_timeout=5, socket_timeout=5 ...",
  "score":  0.69
}
```
The benchmark answering prompt already has a `chunk` field in the search result type — it just comes back empty. No benchmark changes needed; only the backend `/memories/search` response needs updating.

### Priority 2 — Relational versioning: supersede stale memories

**Impact estimate: knowledge-update 40% → ~80%, cross-session-synthesis 20% → ~60%**

Currently: every extracted memory is stored independently.

Fix: During ingestion, after extracting a new memory, run a similarity search against existing memories for the same `user_id`. If a new memory semantically contradicts an existing one (same entity, different value), mark the old memory with a `superseded_by` pointer and exclude it from future search results.

Implementation options (simplest first):
- Add a `superseded_by` field to the LanceDB schema; filter it out in search
- Use an LLM to determine contradiction during ingestion ("does this new memory update or contradict any of these existing memories?")

### Priority 3 — Temporal metadata in search and prompts

**Impact estimate: session-continuity 20% → ~60%, knowledge-update secondary improvement**

Currently: `metadata.date` is stored but never used in retrieval or in the answering context.

Fix (two parts):
1. Include `date` in search result output so the benchmark answering prompt can reason about it
2. Add a recency boost in the search API (optional `sort_by_recency` parameter or a hybrid score `0.8 * semantic + 0.2 * recency`)

---

## Dataset

- **10 sessions** — synthetic `ecommerce-api` project (FastAPI + PostgreSQL + Redis + Stripe)
- **40 questions × 8 categories** — 5 per category
- **Isolated per run** — `bench_devmem_{runId}` tag; real memories never touched
- **Project evolution** — sessions span Jan–Feb 2025, including ORM migration (SQLAlchemy → Tortoise ORM) and Stripe integration, testing whether stale knowledge is overwritten

### Categories

| Category | Tests |
|---|---|
| `tech-stack` | Language, framework, infra choices |
| `architecture` | System design, component relationships, API contracts |
| `session-continuity` | What happened in the most recent/previous session |
| `preference` | Developer style, tool preferences, conventions |
| `error-solution` | Specific bugs fixed with exact details |
| `knowledge-update` | Updated facts superseding older ones |
| `cross-session-synthesis` | Patterns spanning multiple sessions |
| `abstention` | Correctly declining when info was never stored |

---

## Setup

**Requirements:** [Bun](https://bun.sh) ≥ 1.0, opencode-memory backend running, Anthropic or OpenAI API key.

```bash
cd benchmark
bun install
cp .env.example .env.local
# fill in MEMORY_BACKEND_URL and ANTHROPIC_API_KEY
```

## Usage

```bash
bun run bench run                   # full pipeline (~5 min)
bun run bench run -r my-run         # named run (resumes if interrupted)
bun run bench run --no-cleanup      # keep memories for debugging
bun run bench run --limit 10        # quick smoke test (10 questions)
bun run bench status -r <id>        # check progress
bun run bench serve -r <id>         # dashboard at http://localhost:4242
bun run bench list                  # list all runs
```

## Pipeline

```
ingest    → POST sessions to backend (isolated by runTag)
search    → semantic search per question, save top-8 results
answer    → LLM generates answer from search results only
evaluate  → LLM-as-judge: correct (1) or incorrect (0) vs ground truth
report    → aggregate by category, print table, save report.json
```

Checkpointed after each phase — safe to interrupt and resume with `-r`.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MEMORY_BACKEND_URL` | `http://localhost:8020` | Backend URL |
| `ANTHROPIC_API_KEY` | — | Required if using Anthropic |
| `OPENAI_API_KEY` | — | Required if using OpenAI |
| `JUDGE_MODEL` | `claude-sonnet-4-6` | Override judge |
| `ANSWERING_MODEL` | `claude-sonnet-4-6` | Override answerer |

Output goes to `data/runs/<run-id>/` (gitignored).
