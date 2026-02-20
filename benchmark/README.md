# DevMemBench

Coding assistant memory benchmark for [opencode-memory](../README.md). Evaluates memory recall quality across 8 developer-specific categories using an LLM-as-judge pipeline.

## Categories

| Category | What it tests |
|---|---|
| `tech-stack` | Recalls technology choices (language, framework, infra) |
| `architecture` | Recalls system design and component relationships |
| `session-continuity` | Recalls decisions from previous sessions |
| `preference` | Recalls developer style preferences and conventions |
| `error-solution` | Recalls bugs fixed and their solutions |
| `knowledge-update` | Correctly applies updated facts, overriding older ones |
| `cross-session-synthesis` | Synthesizes patterns across multiple unrelated sessions |
| `abstention` | Correctly says "I don't know" when info was never stored |

## Dataset

- 10 synthetic coding sessions about a fictional `ecommerce-api` project (FastAPI + PostgreSQL + Redis + Stripe)
- 40 questions × 8 categories (5 per category)
- Isolated per run via `bench_devmem_{runId}` tags — does not touch real memories

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- opencode-memory backend running (default: `http://localhost:8020`)
- An Anthropic or OpenAI API key (for the LLM judge)

## Setup

```bash
cd benchmark
bun install
cp .env.example .env.local
# Fill in MEMORY_BACKEND_URL and ANTHROPIC_API_KEY (or OPENAI_API_KEY)
```

## Usage

```bash
# Full pipeline: ingest → search → answer → evaluate → report
bun run bench run

# Named run (can resume if interrupted)
bun run bench run -r my-run-v1

# Keep memories in backend after run (for debugging)
bun run bench run --no-cleanup

# Run only first N questions (quick smoke test)
bun run bench run --limit 10

# Check progress of a run
bun run bench status -r my-run-v1

# View results dashboard in browser (http://localhost:4242)
bun run bench serve -r my-run-v1

# List all completed/partial runs
bun run bench list
```

## Pipeline

```
ingest    POST sessions to backend (isolated by runTag)
  ↓
search    Semantic search per question, results saved to checkpoint
  ↓
answer    LLM generates answer from search results
  ↓
evaluate  LLM-as-judge scores answer vs ground truth (0 or 1)
  ↓
report    Aggregate scores by category, save report.json, print table
```

Runs are checkpointed after each phase. If interrupted, resume with the same `-r` flag.

## Results dashboard

```bash
bun run bench serve -r <run-id>
```

Opens a static dashboard at `http://localhost:4242` with:
- Radar chart — scores by category
- Filterable table — per-question results, retrieved memories, judge reasoning

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MEMORY_BACKEND_URL` | `http://localhost:8020` | Backend URL |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key (fallback) |
| `JUDGE_MODEL` | `anthropic/claude-opus-4-5` | Override judge model |
| `ANSWERING_MODEL` | `anthropic/claude-haiku-4-5` | Override answering model |

## Output

Results are saved to `data/runs/<run-id>/`:
- `checkpoint.json` — run state and per-question results
- `report.json` — aggregated scores for the dashboard
