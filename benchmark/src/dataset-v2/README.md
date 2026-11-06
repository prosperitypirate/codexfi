# DevMemBench v2 — long-horizon

A harder, larger companion to the v1 dataset (`../dataset/`). v1 is 25 sessions,
~28k chars: the whole corpus fits in one prompt and in a curated Memory Bank, so it
cannot show whether automatic memory adds value. v2 is ~15x larger and spans three
months of evolving work, so naive full-context stuffing gets expensive and a
token-budgeted Memory Bank (6 files, ~67k-token ceiling, older sessions condensed
by rolling-window aging) cannot keep every exact value, early gotcha or
superseded-vs-current distinction.

## Files

| File | Contents |
|---|---|
| `sessions.json` | 40 `UnifiedSession`s (same schema as v1). `metadata` = `{date, project, title}` |
| `questions.json` | 240 `UnifiedQuestion`s (same schema as v1) plus `evidenceFactIds: string[]` (gold facts). Abstention questions also carry `absentTerms: string[]` (the terms that were string-checked) |
| `facts.json` | Ground-truth fact ledger: `{factId, sessionId, project, category, statement, keyValues, supersedes?, supersededBy?, verified}` |
| `plan.json` | Planner output: project specs, developer persona, session outline, planned update chains |
| `stats.json` | Machine-generated stats for this build |

## Stats

| | v2 | v1 |
|---|---|---|
| Sessions | 40 (18 ledgerline, 17 fieldnote, 5 both) | 25 |
| Date range | 2026-03-02 → 2026-05-29 | ~4 weeks |
| Messages | 1,158 (22–34 per session, mean 29) | 104 |
| Characters | 425,392 (7.0k–15.4k per session) | ~28k |
| Est. tokens (chars/4) | ~106k | ~7k |
| Messages containing code blocks | 489 | — |
| Facts in ledger | 256 (254 verified) | — |
| Facts later superseded | 71 (28%) | — |
| Update chains | 50 (33 of length 2, 13 of length 3, 4 of length 4); 47 span ≥10 sessions, longest spans 35 | — |
| Questions | 240 (30 per category) | 200 (25 per category) |

Facts by category: config 71, architecture 62, error-solution 40, tech-stack 35,
progress 34, preference 14. By project: ledgerline 108, fieldnote 108,
personal/cross-project 40.

Questions per category (all 30): tech-stack, architecture, session-continuity,
preference, error-solution, knowledge-update, cross-session-synthesis, abstention.

Haystack sizes (non-abstention): 1 session ×78, 2 ×75, 3 ×31, 4 ×17, 5 ×6, 6 ×1,
7 ×2. All 30 knowledge-update questions span ≥2 sessions; all 30 synthesis
questions span 3–7. 112 of 210 non-abstention questions need evidence from the
first third of the timeline (S01–S13), which is the part rolling-window aging condenses first.

### The two projects

- **ledgerline** — multi-tenant usage-based billing backend: Node/TypeScript,
  Fastify, Prisma→Drizzle, Postgres (Render→Neon), BullMQ/Upstash→pg-boss, Stripe,
  Puppeteer PDF invoices, Render→Fly.io.
- **fieldnote** — offline-first field-inspection app: Expo/React Native with
  expo-sqlite (a WatermelonDB trial that was reverted), FastAPI sync server,
  S3→R2 photo uploads, field-level LWW conflict resolution, push notifications.
- **Developer preferences** (commit style, answer formatting, editor/terminal/
  runtime manager, test style, etc.) appear casually across both projects, and
  several of them change over time.

## Generation method

Fully scripted, in `benchmark/scripts/generate-dataset-v2.ts` (Bun), with the
prompts inline. Every LLM call goes through the `claude` CLI in headless mode on a
subscription (`-p --output-format json --tools "" --no-session-persistence
--setting-sources "" --strict-mcp-config --disable-slash-commands --system-prompt …`),
run from a scratch cwd with `CODEXFI_DISABLE=1`, at most 4 calls in parallel. Every
output is cached on disk under `<scratch>/cache/<step>.<sha(prompt)>.txt`. A rerun
over a warm cache makes 0 LLM calls and reproduces these JSON files byte-for-byte.

1. **Plan** (opus): projects, persona, a 40-session outline (date, project, title,
   summary, message count) and ~50 planned update chains.
2. **Fact ledger** (opus): 4 sequential batches of 10 sessions. Each batch sees all
   earlier facts, so it can set `supersedes` to a factId that is still current.
   `supersededBy` is derived from `supersedes`. Each fact lists 1–3 `keyValues` that
   must appear verbatim in the session.
3. **Sessions** (sonnet): each session is written from its assigned facts, the
   outline summaries of prior sessions, and the "current state" facts as of that
   session. The prompt asks for realistic Claude Code work (pasted errors, diffs,
   command output, tangents, false starts) and for facts to be spread out, with
   preferences buried mid-session.
4. **Verify**: per session, an LLM checker labels each assigned fact
   expressed/partial/missing/contradicted, and a case-insensitive check confirms
   every `keyValue` appears verbatim. Failing sessions are regenerated with the
   failures as feedback (max 3 attempts; the best attempt is kept).
5. **Questions** (opus): generated from the verified ledger (not from free reading
   of the transcripts), 40 candidates per category. `haystackSessionIds` is computed
   from `evidenceFactIds`. For knowledge-update, the evidence is expanded to the whole
   supersession chain, and groundTruth gives the current value.
6. **Validate**: every non-abstention candidate is answered by sonnet reading ONLY
   its haystack sessions, and a judge compares the answer to groundTruth. Failures
   get one repair pass (fix question/groundTruth to what the transcripts support, or
   drop), then are re-answered and re-judged; anything still failing is dropped. The
   first 30 passing questions per category are kept. Session IDs in question text
   are then rewritten to session dates, because memory systems never see IDs.
7. **Abstention check**: every `absentTerm` must not appear (case-insensitive
   substring) anywhere in the 40 sessions.

Regenerate (resumes from cache):

```bash
cd benchmark && bun run scripts/generate-dataset-v2.ts [--scratch <dir>]
```

## Verification results

| Check | Result |
|---|---|
| Fact expression (LLM + verbatim keyValues) | 254/256 facts pass (99.2%); 38/40 sessions fully verified; 19 sessions needed ≥1 regeneration |
| Question validation, round 1 | 277/289 non-abstention candidates recovered from haystack only (95.8%) |
| Repair round | 12/12 failures repaired and re-validated |
| Abstention string check | 40/40 candidates pass (30 kept) |

The two unverified facts (`verified: false`) are F185 (S29: terminal moved to
Ghostty + starship) and F245 (S39: fieldnote client back to pnpm). The checker
rated both "partial": the content is present but some framing differs. Questions
are generated only from verified facts, but these two still appear as links in
supersession chains.

## Known limitations

- **Synthetic.** All sessions, facts and questions come from one model family
  (Claude), which is also the likely answerer/judge, so there may be shared
  stylistic bias. Dialogues are realistic but tidier than real logs.
- **Message counts.** 13 sessions slightly exceed the 30-message target (max 34).
  Five sessions end on a user sign-off, and one (S33) has two consecutive user
  messages.
- **Extra, unledgered detail.** Sessions contain many concrete details beyond the
  ledger (realistic noise). Questions only target ledger facts, but a few transcript
  details could make a groundTruth look incomplete to a strict judge.
- **Validation ≠ difficulty.** Validation shows each question is answerable from its
  haystack sessions; it does not measure how hard retrieval is. 12 questions were
  rewritten by the repair pass, which may make them slightly easier to match.
- **Abstention checks are lexical.** A term passes if its exact string is absent; a
  paraphrase or a related concept could still appear (for example, the Supavisor
  question is about connection pooling, which the sessions do discuss under other names). Abstention questions often embed a false premise ("when we added X …").
- **Session-continuity framing.** Questions refer to sessions by date and topic
  ("the April 13 ledgerline session"), so systems that drop session dates are
  penalised. That is intentional, but worth knowing.
- **Token estimate** is chars/4, not a tokenizer count; code-heavy text usually
  tokenizes denser.
