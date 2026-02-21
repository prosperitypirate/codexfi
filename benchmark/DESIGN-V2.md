# DevMemBench v2 — Design Document

## Goals

1. **Retrieval quality metrics** — the single biggest gap vs Supermemory MemoryBench. Without
   Hit@K, Precision@K, MRR, and NDCG we can't tell *why* an answer fails — is it a retrieval
   problem (right memory never surfaced) or a reasoning problem (memory surfaced, answer wrong)?
   This is the instrumentation needed for the self-improvement loop.

2. **Scale to 200 questions** — 5 questions per category has 20pp per wrong answer, making
   changes hard to evaluate statistically. 25 per category drops that to 4pp, giving real signal.

3. **Latency breakdown** — add min/max/mean/median/p95/p99 per phase so we can see if
   optimisations actually help throughput.

4. **Keep the live browser dashboard** — all new metrics streamed via SSE as they are computed;
   no separate step required.

---

## Branch

```
feat/devmembench-v2
```

---

## What Is NOT Changing

- Pipeline architecture (ingest → search → answer → evaluate → report → cleanup)
- Shared memory store per run (not per-question isolation — too expensive at 200q, and shared
  store is actually more realistic for real plugin use)
- Backend API surface (`POST /memories`, `POST /memories/search`, `DELETE /memories/{id}`)
- Checkpoint/resume mechanism
- Live dashboard server (server.ts unchanged)
- Provider adapter (opencode-memory.ts unchanged)

---

## 1. Dataset Expansion: 10 → 25 Sessions

### New Sessions

All new sessions are for the same fictional `ecommerce-api` project (or the `dashboard-app`
introduced in S10), keeping facts internally consistent with existing sessions.

| ID  | Date    | Project        | Topic                                                |
|-----|---------|----------------|------------------------------------------------------|
| S11 | Jan 19  | ecommerce-api  | Product catalog CRUD (FastAPI router, filtering, soft delete, Pydantic schemas) |
| S12 | Jan 21  | ecommerce-api  | Shopping cart (Redis hash `cart:{user_id}`, 7-day TTL, 4 endpoints) |
| S13 | Jan 23  | ecommerce-api  | Order system (JSONB snapshot, status lifecycle, inventory deduction) |
| S14 | Jan 24  | ecommerce-api  | Background tasks — order email via `asyncio.create_task` + SendGrid |
| S15 | Jan 26  | ecommerce-api  | Testing setup — pytest-asyncio, fakeredis, factory_boy, 80% target |
| S16 | Jan 27  | ecommerce-api  | Performance — EXPLAIN ANALYZE, 2.3s→45ms with category + (category,price) indexes |
| S17 | Jan 29  | ecommerce-api  | Rate limiting — slowapi, 100/10 rpm, Redis backend, X-RateLimit-* headers |
| S18 | Feb 2   | ecommerce-api  | Logging — structlog, UUID request_id middleware, LOG_LEVEL env var |
| S19 | Feb 3   | ecommerce-api  | API versioning — /api/v1/ prefix, Deprecation header, v2 pagination plan |
| S20 | Feb 4   | ecommerce-api  | Deployment — multi-stage Docker 1.2GB→340MB, nginx, GET /health |
| S21 | Feb 6   | dashboard-app  | Charts — Recharts (Area/Bar/Pie), 5-min refresh, analytics endpoints |
| S22 | Feb 7   | dashboard-app  | Data fetching — SWR dedupingInterval:30s, Server Components, API proxy |
| S23 | Feb 8   | dashboard-app  | Timezone bug — UTC→local Date() shift; fixed with date-fns-tz `formatChartDate()` |
| S24 | Feb 9   | both           | More preferences — named exports, Zod, log-before-rethrow, functional components, @faker-js/faker |
| S25 | Feb 10  | both           | Final status — ecommerce-api complete; dashboard pending NextAuth.js |

### Key Facts That Must Survive Extraction

Each session must contain these verbatim-enough facts (the LLM extractor will compress them
into memories — these are what questions test):

**S11:** `GET /products` (category/min_price/max_price/search params), `GET /products/{id}`,
admin-only POST/PUT/DELETE, soft delete via `is_active=False`, schemas: ProductCreate /
ProductUpdate / ProductResponse.

**S12:** Redis hash key `cart:{user_id}`, 7-day TTL, POST/PUT/DELETE/GET cart endpoints, stock
check on add.

**S13:** Order model fields: id, user_id, items (JSONB), total (Decimal), status
(pending→paid→shipped→delivered, cancellable at any stage), created_at. POST /orders reads
cart → validates stock → creates record → deducts stock_quantity → clears cart.

**S14:** `asyncio.create_task(send_order_confirmation(...))` fire-and-forget. SendGrid API.
`SENDGRID_API_KEY` env var. Email failure is logged but does not block the order response.

**S15:** pytest + pytest-asyncio. Fixtures: test_db, test_client, auth_headers. fakeredis for
Redis mocking. factory_boy for data. `tests/` directory, one file per module. 80% coverage target.

**S16:** EXPLAIN ANALYZE showed sequential scan. Added `idx_products_category` (single) and
`idx_products_category_price` (composite). Query: 2.3s → 45ms.

**S17:** slowapi. 100 req/min per IP (general), 10 req/min per IP (auth endpoints). Redis as
rate limit storage backend. Headers: X-RateLimit-Limit, X-RateLimit-Remaining,
X-RateLimit-Reset. 429 + Retry-After on exceed.

**S18:** structlog. UUID request_id per request via middleware (uses Python contextvars, async-safe).
Log fields: request_id, user_id, endpoint, duration_ms, status_code.
`structlog.exception()` for tracebacks. `LOG_LEVEL` env var (default INFO). JSON in prod.

**S19:** `/api/v1/` prefix on all routes. Old unversioned routes kept with `Deprecation: true`
header. 30-day window (removal March 5). v2 planned: pagination changes
`{items:[], total:N}` → `{data:[], pagination:{total,page,per_page,pages}}`.

**S20:** Multi-stage Dockerfile: builder (all deps) → runtime (prod artifacts only). 1.2GB → 340MB.
`GET /health` → `{"status":"ok","version":"1.0.0"}`. nginx `proxy_pass` to uvicorn port 8000,
SSL at nginx. Zero-downtime: rolling restart via `docker compose --no-deps up -d app`.

**S21:** Recharts. AreaChart (revenue over time), BarChart (orders by category), PieChart (payment
status). 5-min setInterval refresh. Analytics endpoints: `/api/v1/analytics/revenue`,
`/api/v1/analytics/orders-by-category`, `/api/v1/analytics/payment-status`. Next.js API routes
proxy to ecommerce-api (hides backend URL, handles CORS).

**S22:** SWR, `dedupingInterval: 30000`. Next.js Server Components for initial render.
API routes in `app/api/`. `revalidateOnFocus: false` for analytics.

**S23:** Bug: UTC timestamps from PostgreSQL → `new Date(timestamp)` in JS shifts to local
time → wrong chart date grouping. Fix: `date-fns-tz` library. `formatChartDate(ts, tz)` uses
`utcToZonedTime()` + `format()`. Timezone from
`Intl.DateTimeFormat().resolvedOptions().timeZone`.

**S24:** Named exports for React components (not default). Zod for TypeScript validation.
Log before re-throw, never swallow errors. Functional components only, no class components.
`@faker-js/faker` for TypeScript test data.

**S25:** ecommerce-api: auth, product catalog, cart, orders, Stripe, email (SendGrid),
rate limiting (slowapi), logging (structlog), API versioning (/api/v1/), deployment
(340MB Docker + nginx + health check) — all complete.
dashboard-app: charts, SWR data fetching complete. Pending: NextAuth.js auth, admin views.
Critical path to launch: NextAuth.js + load testing.

---

## 2. Dataset Expansion: 40 → 200 Questions

**8 categories × 25 questions each = 200 total.**

Existing Q01–Q40 are kept as-is, except **Q40** must change: it was "What rate limiting
strategy does the API use?" (abstention, groundTruth: "Not mentioned") but S17 now answers it.
Q40 becomes: "What is the developer's preferred IDE or code editor?" (still abstention).

### Question Distribution

```
Category               Existing   New   Total
──────────────────────────────────────────────
tech-stack             Q01–Q05    +20   Q01–Q05, Q41–Q60
architecture           Q06–Q10    +20   Q06–Q10, Q61–Q80
session-continuity     Q11–Q15    +20   Q11–Q15, Q81–Q100
preference             Q16–Q20    +20   Q16–Q20, Q101–Q120
error-solution         Q21–Q25    +20   Q21–Q25, Q121–Q140
knowledge-update       Q26–Q30    +20   Q26–Q30, Q141–Q160
cross-session-synthesis Q31–Q35   +20   Q31–Q35, Q161–Q180
abstention             Q36–Q40    +20   Q36–Q40, Q181–Q200
```

### New Question Coverage (representative sample per category)

**tech-stack (Q41–Q60)** — covers facts introduced in new sessions:
- Tortoise ORM (current), slowapi, structlog, SendGrid, fakeredis, factory_boy,
  @faker-js/faker, date-fns-tz, Recharts, SWR, multi-stage Dockerfile,
  asyncio.create_task, pytest-asyncio, Zod (TS), product filtering query params,
  JSONB order items, Redis hash cart format, GET /health endpoint, Next.js Server Components.

**architecture (Q61–Q80):**
- Cart endpoints + Redis key structure, order status lifecycle, fire-and-forget email flow,
  rate limit values + headers, admin-only product endpoints, soft delete pattern,
  request_id middleware mechanics, API versioning approach, JSONB rationale,
  inventory deduction flow, analytics proxy pattern, SWR dedup strategy,
  nginx config, structlog contextvars, v2 pagination plan, stock validation points,
  uvicorn multi-worker note, dashboard chart types, aerich init command.

**session-continuity (Q81–Q100):**
- One question per new session (S11–S25): "what was session X about?"
- Plus: which session introduced SendGrid, which session added structlog,
  which session was most recent, which session preceded the Stripe fix, etc.

**preference (Q101–Q120):**
- Named exports, Zod, log-before-rethrow, functional components only,
  @faker-js/faker, 80% coverage target, fakeredis, soft-delete approach,
  one-test-file-per-module, EXPLAIN ANALYZE usage, structlog preference,
  separate Pydantic schemas (Create/Update/Response), LOG_LEVEL via env var,
  date-fns-tz for timestamps, asyncio over Celery for non-critical tasks,
  explicit Redis pool config, Deprecation header + 30-day window.

**error-solution (Q121–Q140):**
- Slow query: cause (missing index), diagnosis (EXPLAIN ANALYZE), fix (indexes), improvement (2.3s→45ms).
- Timezone bug: cause (UTC→Date() local shift), fix (date-fns-tz + formatChartDate).
- Dashboard duplicate calls: cause (multiple components, same data), fix (SWR dedupingInterval).
- Docker bloat: cause (single-stage), fix (multi-stage), before/after (1.2GB→340MB).
- Redis rate limit cross-process: why in-memory breaks with multiple workers.
- Aerich init: exact command, what it generates.
- asyncio.create_task safety concern (GC question) and answer.
- fakeredis TTL behavior and limitation.

**knowledge-update (Q141–Q160):**
- Complete env var list now vs original (added STRIPE_WEBHOOK_SECRET, SENDGRID_API_KEY, LOG_LEVEL).
- Current Docker image size vs original.
- Stripe webhook status (broken → fixed).
- Timezone bug status (broken → fixed).
- SQLAlchemy → Tortoise ORM replacement.
- Redis dual usage (cache only → cache + rate limiting).
- Alembic commands → Aerich commands.
- Original ORM/migration tool vs current.
- alembic/ directory (deleted).
- run_in_executor (eliminated with Tortoise ORM).
- API route prefix (none → /api/v1/).
- Product query performance (2.3s → 45ms).
- Dashboard auth status (not started → in progress, pending NextAuth.js).
- Feature completeness Jan 25 vs Feb 10.
- structlog added when and why.
- Test coverage target: when established and what value.

**cross-session-synthesis (Q161–Q180):**
- Full tech stack of both projects combined.
- All env vars required (complete list).
- All Redis usage patterns.
- All bugs fixed (Redis pool, Stripe bytes, slow query, timezone).
- Full order lifecycle (create → Stripe → webhook → paid → shipped → delivered).
- Full deployment stack (Docker → nginx → uvicorn → PostgreSQL + Redis).
- Testing infrastructure (pytest + asyncio + fakeredis + factory_boy + coverage).
- All developer preferences (concise, no comments, type hints, named exports, Zod, log-rethrow, functional, bun, coverage, structlog, EXPLAIN ANALYZE).
- Admin vs customer endpoint split.
- All Pydantic schemas across models.
- All external service integrations (Redis, Stripe, SendGrid) + purpose.
- Cross-project consistent patterns (bun, PostgreSQL, Tailwind+shadcn, Zod, structlog).
- Complete feature status both projects.

**abstention (Q181–Q200):**
Things never mentioned across all 25 sessions:
- Developer's IDE/code editor
- CI/CD platform (GitHub Actions, CircleCI, etc.)
- Cloud provider (AWS, GCP, Azure)
- PostgreSQL version number
- Redis version number
- Developer's company or employer name
- Domain name or production URL
- Monthly infrastructure cost
- Browser support matrix for dashboard
- Git branching strategy
- Database backup strategy
- Monitoring/alerting service (Datadog, PagerDuty)
- Developer's GitHub username
- Developer's Twitter/X handle
- Development machine OS (macOS, Linux)
- Load balancer config (beyond nginx proxy)
- Kubernetes or orchestration beyond Docker Compose
- GraphQL usage (it's REST only)
- CORS configuration details
- CDN for static assets

---

## 3. Retrieval Metrics (New: `pipeline/retrieval-eval.ts`)

### Design

During the **evaluate** phase, every question gets a second LLM call run **in parallel** with
the answer judge. It scores each of the top-8 search results as relevant (1) or irrelevant (0)
by inspecting the memory text + chunk against the question and ground truth.

```
Per question: Promise.all([judge(answer), retrievalMetrics(searchResults)])
```

No extra wall-clock time vs the current evaluate phase.

### Metrics Computed

| Metric         | Formula | What it tells you |
|----------------|---------|-------------------|
| **Hit@8**      | `relevantRetrieved > 0 ? 1 : 0` | Did *any* relevant memory surface? |
| **Precision@8**| `relevantRetrieved / 8` | What fraction of retrieved results are useful? |
| **F1@8**       | `2*P*Hit / (P+Hit)` | Harmonic balance of the two above |
| **MRR**        | `1 / rank_of_first_relevant` | How high is the first useful result? |
| **NDCG@8**     | Discounted cumulative gain / ideal | Ranking quality with position weighting |

Note: true Recall (fraction of *all* relevant memories retrieved) is not computable without
knowing how many relevant memories exist in the store, so we don't report it. Hit@8 is the
practical proxy.

### LLM Prompt

Single batch call — evaluates all 8 results in one prompt:

```
Given this question and its expected answer, mark each retrieved memory as
relevant (1) or irrelevant (0).

Question: {question}
Expected answer: {groundTruth}

Results:
[1] Memory: {memory}
    Chunk: {chunk_excerpt}
...

Return JSON: [{"id":1,"relevant":1}, {"id":2,"relevant":0}, ...]
```

### What This Enables (the Self-Improvement Loop)

```
Low Precision@8 → too much noise → raise displayThreshold or improve extraction prompts
Low Hit@8       → right memories not surfacing → lower threshold or tune search
Low MRR         → right memory found but ranked low → reranking, recency weight tuning
```

Compare threshold=0.3 vs threshold=0.5 runs:
- If Precision@8 improves and Hit@8 stays stable → raising threshold is a win
- If Hit@8 drops → raising threshold is filtering out real memories too

This is a direct answer to Issue #29.

---

## 4. Latency Breakdown

### New `LatencyStats` Interface

```typescript
interface LatencyStats {
  min: number; max: number; mean: number;
  median: number; p95: number; p99: number;
  count: number;
}
```

Computed in `report.ts` for: search phase (per question), answer phase (per question),
evaluate phase (per question). Reported overall and per category.

### Report Output

```
LATENCY (ms)              min    mean  median    p95    p99
  search:                  83     142     124    289    401
  answer:                 412    1203    1087   2341   3102
  evaluate:               201     687     612   1401   1892

BY CATEGORY:
  tech-stack     precision=31%  hit=80%  mrr=0.61  search_p50=121ms
  session-cont.  precision=18%  hit=64%  mrr=0.42  search_p50=189ms
```

---

## 5. File Change Plan

### New Files

```
benchmark/src/pipeline/retrieval-eval.ts   — LLM relevance judge + metric calculation
```

### Modified Files

```
benchmark/src/types.ts
  + RetrievalMetrics interface
  + LatencyStats interface
  + retrievalMetrics?: RetrievalMetrics on EvaluationResult
  + latency field on BenchmarkReport

benchmark/src/pipeline/evaluate.ts
  + import calculateRetrievalMetrics
  + Promise.all([judge(answer), calculateRetrievalMetrics(...)])
  + store retrievalMetrics on evaluation result

benchmark/src/pipeline/report.ts
  + calculateLatencyStats() helper
  + aggregate + print retrieval metrics section
  + aggregate + print latency section
  + include both in report.json

benchmark/src/live/emitter.ts
  + retrievalMetrics?: {...} on evaluate_question event
  + retrieval_summary event emitted after evaluate phase

benchmark/src/live/page.ts
  + Retrieval panel in sidebar (Hit@8, Precision@8, MRR, NDCG — live rolling average)
  + Evaluate rows show precision inline: "✓ Q041 [tech] | P=3/8 MRR=1.0"

benchmark/ui/index.html
  + Retrieval Quality section in report view
  + Latency section in report view

benchmark/src/index.ts
  + Print retrieval summary in final terminal output

benchmark/src/dataset/sessions.json
  — Expand from 10 to 25 sessions (S01–S25 per session table above)

benchmark/src/dataset/questions.json
  — Expand from 40 to 200 questions (Q01–Q200 per question plan above)
  — Update Q40: change to different abstention question
```

---

## 6. UI Changes (Live Dashboard)

### Sidebar additions

**Retrieval Quality panel** (new, below Score):
```
RETRIEVAL QUALITY (K=8)
  Hit@8     ████████████████░░░  80%
  Precision ██████░░░░░░░░░░░░░  31%
  MRR       0.512
  NDCG      0.489
```

Updated live as each question's evaluate_question event arrives with retrieval metrics.

### Feed row change

Evaluate rows currently:
```
✓ Q041 [tech]  The answer correctly identifies FastAPI            35/40
```

After change:
```
✓ Q041 [tech]  The answer correctly identifies FastAPI            35/200
                P=5/8 · MRR=1.00
```

### Static report UI (ui/index.html)

New sections added to the report view:
- **Retrieval Quality** card: Hit@8, Precision@8, F1@8, MRR, NDCG overall + per category
- **Latency** table: min/mean/median/p95/p99 per phase per category

---

## 7. Self-Improvement Loop — How to Use

```
1. Run: bun run bench run
   → Get overall accuracy + retrieval metrics as baseline

2. Identify weakness pattern:
   - Low Precision@8 in a category → retrieval is noisy for those queries
   - Low Hit@8 in a category → retrieval is missing relevant memories entirely
   - Low accuracy + high Hit@8 → answer generation problem, not retrieval

3. Make a backend change (threshold, extraction prompt, search params)

4. Run again with same questions: bun run bench run -r new-run-id
   → Compare Precision@8 before/after to confirm retrieval improvement

5. Confirm accuracy improvement is correlated with retrieval improvement
   → Validates the change actually helps vs random LLM variance

6. Commit the backend change, open PR
```

Threshold experiment example:
```bash
# Baseline at threshold=0.3
bun run bench run -r threshold-03

# Change config.ts: similarityThreshold = 0.5
# Rebuild plugin
bun run bench run -r threshold-05

# Compare: precision@8 (should rise), hit@8 (watch for drop), accuracy
```

---

## 8. Implementation Sequence

1. `git checkout -b feat/devmembench-v2`
2. Write `retrieval-eval.ts`
3. Update `types.ts`
4. Update `evaluate.ts`
5. Update `report.ts`
6. Update `emitter.ts`
7. Update `live/page.ts`
8. Update `ui/index.html`
9. Update `index.ts` (terminal summary)
10. Write expanded `sessions.json` (S01–S25, ~25 sessions × 4–6 messages)
11. Write expanded `questions.json` (Q01–Q200, with accurate groundTruths and haystackSessionIds)
12. Smoke test: `bun run bench run --limit 10` to verify pipeline still runs clean
13. Full run: `bun run bench run`
14. Update README.md with v2 results

---

## 9. Open Questions / Decisions Needed

**Q: Run retrieval evaluation for every question or only failed ones?**
Recommendation: every question. Precision on *correct* answers is also meaningful — a correct
answer with only 1/8 relevant results is fragile (got lucky); a correct answer with 6/8 relevant
results is robust.

**Q: Should retrieval eval count toward benchmark cost?**
It roughly doubles evaluate phase LLM calls (200 extra calls). At claude-sonnet rates (~$0.003/call)
that's ~$0.60 extra per full run. Acceptable.

**Q: Should retrieval metrics gate a pass/fail threshold?**
Not yet. Report them as informational metrics. A future version could use Precision@8 < 30% as
a warning flag per category.

**Q: How many sessions per question in haystackSessionIds for new questions?**
- Single-fact questions: 1 session
- Questions that span known update events: 2 sessions (old + new)
- Synthesis questions: 3–5 sessions
- Abstention questions: empty array `[]`

**Q: What haystackSessionIds do abstention questions reference?**
Empty array `[]` — the information was never stored.
