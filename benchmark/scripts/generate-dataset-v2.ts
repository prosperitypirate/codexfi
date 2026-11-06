#!/usr/bin/env bun
/**
 * DevMemBench v2 — long-horizon dataset generator.
 *
 * Pipeline (every LLM output is cached on disk, keyed by step name + prompt hash,
 * so reruns resume and produce identical output):
 *   1. plan       — projects, developer persona, 40-session outline, planned update chains (opus)
 *   2. facts      — ground-truth fact ledger, generated in sequential session batches so later
 *                   facts can supersede earlier ones by factId (opus)
 *   3. sessions   — each session written by sonnet from its assigned facts + prior context
 *   4. verify     — per session: LLM fact-expression check + verbatim keyValue string checks;
 *                   failing sessions are regenerated with feedback (max 2 retries)
 *   5. questions  — generated from the verified ledger (not from free reading), 8 categories
 *   6. validate   — each non-abstention question is answered by an LLM that sees ONLY its
 *                   haystack sessions; a judge compares to groundTruth; failures get one
 *                   repair pass, then are re-validated or dropped
 *   7. abstention — every key term of every abstention question must be absent from ALL sessions
 *
 * LLM calls go through the `claude` CLI in headless mode (subscription auth, no API key),
 * run from a scratch cwd with tools disabled, no settings sources, no session persistence,
 * and CODEXFI_DISABLE=1 so no memory hooks fire.
 *
 * Usage:  bun run scripts/generate-dataset-v2.ts [--scratch <dir>]
 */
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ── Paths ─────────────────────────────────────────────────────────────────────

const argScratch = process.argv.indexOf("--scratch");
const SCRATCH = resolve(
  argScratch > -1
    ? process.argv[argScratch + 1]!
    : process.env.DSGEN_SCRATCH ?? join(tmpdir(), "codexfi-dsgen"),
);
const CACHE = join(SCRATCH, "cache");
const OUT = resolve(import.meta.dir, "../src/dataset-v2");
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const CONCURRENCY = 4;
const N_SESSIONS = 40;
const FACT_BATCH = 10; // sessions per fact-ledger batch
const Q_PER_CATEGORY = 30;
const Q_OVERGEN = 40; // generate extra per category, keep first 30 that validate

const CATEGORIES = [
  "tech-stack",
  "architecture",
  "session-continuity",
  "preference",
  "error-solution",
  "knowledge-update",
  "cross-session-synthesis",
  "abstention",
] as const;
type Category = (typeof CATEGORIES)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Msg { role: "user" | "assistant"; content: string }
interface Session { sessionId: string; metadata: { date: string; project: string; title?: string }; messages: Msg[] }
interface OutlineSession { sessionId: string; date: string; project: string; title: string; summary: string; messageCount: number }
interface Plan {
  projects: { name: string; description: string; initialStack: string }[];
  developer: string;
  sessions: OutlineSession[];
  updateChains: { topic: string; project: string; steps: { sessionId: string; value: string }[] }[];
}
interface Fact {
  factId: string;
  sessionId: string;
  project: string;
  category: string;
  statement: string;
  keyValues: string[];
  supersedes?: string;
  supersededBy?: string;
  verified?: boolean;
}
interface Question {
  questionId: string;
  questionType: Category;
  question: string;
  groundTruth: string;
  haystackSessionIds: string[];
  evidenceFactIds: string[];
  absentTerms?: string[];
}

// ── LLM via claude CLI ────────────────────────────────────────────────────────

let active = 0;
const waiters: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>((r) => waiters.push(r)); // slot handed over directly
  else active++;
  try {
    return await fn();
  } finally {
    const next = waiters.shift();
    if (next) next(); // keep `active` unchanged: the slot passes to the waiter
    else active--;
  }
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);
let calls = 0;
let cacheHits = 0;

async function llm(
  name: string,
  system: string,
  prompt: string,
  opts: { model?: "sonnet" | "opus" | "haiku"; effort?: "low" | "medium" | "high" } = {},
): Promise<string> {
  const model = opts.model ?? "sonnet";
  const key = `${name}.${sha(model + "\n" + (opts.effort ?? "") + "\n" + system + "\n" + prompt)}.txt`;
  const file = join(CACHE, key);
  if (existsSync(file)) {
    cacheHits++;
    return readFileSync(file, "utf8");
  }
  return slot(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const args = [
        "claude", "-p",
        "--model", model,
        "--output-format", "json",
        "--tools", "",
        "--no-session-persistence",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--system-prompt", system,
      ];
      if (opts.effort) args.push("--effort", opts.effort);
      const t0 = Date.now();
      const proc = Bun.spawn(args, {
        cwd: SCRATCH,
        env: { ...process.env, CODEXFI_DISABLE: "1" },
        stdin: new TextEncoder().encode(prompt),
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      await proc.exited;
      calls++;
      try {
        const j = JSON.parse(out);
        if (j.is_error || typeof j.result !== "string" || !j.result.trim()) throw new Error(`error result: ${out.slice(0, 300)}`);
        writeFileSync(file, j.result);
        log(`  llm ${name} (${model}) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        return j.result as string;
      } catch (e) {
        log(`  llm ${name} attempt ${attempt + 1} failed: ${String(e).slice(0, 200)} ${err.slice(0, 200)}`);
        await Bun.sleep(5000 * (attempt + 1));
      }
    }
    throw new Error(`LLM call ${name} failed after retries`);
  });
}

function parseJson<T>(text: string): T {
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  let body = fence ? fence[1]! : text;
  if (!fence) {
    const a = Math.min(...["{", "["].map((c) => (body.indexOf(c) === -1 ? Infinity : body.indexOf(c))));
    const b = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    body = body.slice(a, b + 1);
  }
  return JSON.parse(body) as T;
}

async function llmJson<T>(name: string, system: string, prompt: string, opts: Parameters<typeof llm>[3] = {}): Promise<T> {
  let text = await llm(name, system, prompt, opts);
  try {
    return parseJson<T>(text);
  } catch {
    // one re-ask with a nonce so the cache key differs
    text = await llm(name + "-retry", system, prompt + "\n\n(Return ONLY valid JSON. No commentary.)", opts);
    return parseJson<T>(text);
  }
}

const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

// ── Step 1: plan ──────────────────────────────────────────────────────────────

const SYS_PLANNER =
  "You are a meticulous benchmark designer. You produce long, internally consistent, realistic synthetic data plans. Output only what is asked, as valid JSON.";

const PLAN_PROMPT = `Design the backbone of a long-horizon memory benchmark: a fictional solo developer working with an AI coding assistant (Claude Code) over ~3 months on two software projects.

PROJECTS (fill in concrete, realistic specifics — exact versions, library names, service names):
1. "ledgerline" — a multi-tenant usage-based billing & invoicing backend in TypeScript (Node.js), PostgreSQL, a background job queue, Stripe integration, webhook ingestion, PDF invoice rendering, deployed to a cloud PaaS.
2. "fieldnote" — an offline-first mobile field-inspection app: React Native (Expo) client with on-device SQLite, a Python FastAPI sync server, photo uploads to object storage, conflict resolution for offline edits, push notifications.

REQUIREMENTS
- Exactly ${N_SESSIONS} sessions S01..S${N_SESSIONS}, in chronological order, dates between 2026-03-02 and 2026-05-29 (gaps of 0-5 days, some weekends skipped). About 18 ledgerline, 17 fieldnote, and 5 with project "both" (shared tooling: a shared CI template, a shared design-token/ESLint package, dev-machine setup, a common logging library, a cross-project incident).
- Each session has a title, a 3-5 sentence summary of what concretely happens (including tangents, failed attempts, decisions), and a messageCount between 12 and 30 (vary it; mean ~20).
- Projects must EVOLVE: plan ~45 updateChains — things whose value changes over time (library migrations, config value changes, reversed decisions, renamed env vars, version bumps, hosting move, changed limits/timeouts, changed preferences). Each chain has 2-3 steps at different sessions; at least 15 chains must span 10+ sessions; a few chains reverse a decision back. Steps give the concrete value at that point.
- The developer has personal preferences (editor, shell, commit message style, test style, naming, response formatting, package manager, how they like plans presented, things they hate) that come up casually across both projects; a few preferences change over time.
- Include sessions that end mid-task with a clear "next step", and later sessions that pick those up.

Return JSON:
{
  "projects": [{"name": "...", "description": "...", "initialStack": "..."}],
  "developer": "2-3 sentence persona (first name, timezone, working style)",
  "sessions": [{"sessionId": "S01", "date": "2026-03-02", "project": "ledgerline|fieldnote|both", "title": "...", "summary": "...", "messageCount": 18}],
  "updateChains": [{"topic": "...", "project": "ledgerline|fieldnote|personal", "steps": [{"sessionId": "S03", "value": "..."}]}]
}`;

// ── Step 2: facts ─────────────────────────────────────────────────────────────

function factsPrompt(plan: Plan, prior: Fact[], batch: OutlineSession[], startId: number) {
  const priorText = prior.length
    ? prior.map((f) => `${f.factId} [${f.sessionId}|${f.project}|${f.category}] ${f.statement}${f.supersededBy ? ` (SUPERSEDED by ${f.supersededBy})` : ""}`).join("\n")
    : "(none yet)";
  return `You are building the ground-truth FACT LEDGER for a memory benchmark. Below is the full plan, the facts already in the ledger, and the batch of sessions you must now write facts for.

PLAN:
${JSON.stringify(plan, null, 1)}

FACTS ALREADY IN LEDGER:
${priorText}

WRITE FACTS FOR SESSIONS: ${batch.map((s) => s.sessionId).join(", ")}
Produce 6-7 atomic facts per session (about ${batch.length * 6.3 | 0} total), numbered from F${String(startId).padStart(3, "0")} upward.

Each fact: {"factId": "F012", "sessionId": "S03", "project": "ledgerline|fieldnote|personal", "category": "tech-stack|architecture|config|error-solution|preference|progress", "statement": "...", "keyValues": ["..."], "supersedes": "F004"?}

RULES
- statement: one self-contained, specific, checkable sentence that names the project (or "the developer" for preferences). Prefer exact values: versions, ports, timeouts, limits, env var names, table/queue names, file paths, CLI flags, error strings, commands.
- keyValues: 1-3 SHORT exact strings (<= 60 chars each) that the session transcript must contain verbatim (e.g. "PGBOUNCER_POOL_SIZE=40", "ECONNRESET", "v3.4.1", "7 days"). Must be distinctive, not common words.
- Mix per session: tech-stack/config values, architecture decisions WITH the reason, error-solution facts (exact error message string in keyValues, root cause, and the fix — may be 2 facts: error+cause, then fix), progress facts ("By the end of S07 the X was done; the agreed next step was Y"), and preferences. Preferences should be casual, stated once (category "preference", project "personal" if cross-project).
- Follow the plan's updateChains: when a session's chain step changes a value, write a fact with "supersedes" pointing to the CURRENT (not already superseded) earlier fact on that topic, and a statement giving the new value and why (e.g. "ledgerline switched X from A to B because ..."). Overall about 25% of facts in later batches should supersede earlier facts. Never supersede a fact that is already superseded.
- Facts must be consistent with the plan's session summaries and with prior facts. No two current facts may contradict.
- project "both" sessions produce facts tagged with whichever project they concern, or "personal".

Return ONLY a JSON array of facts.`;
}

// ── Step 3: sessions ──────────────────────────────────────────────────────────

const SYS_WRITER =
  "You write realistic, long transcripts of a developer working with Claude Code (an AI coding assistant in the terminal). You follow formatting instructions exactly.";

function sessionPrompt(plan: Plan, s: OutlineSession, facts: Fact[], allFacts: Fact[], feedback?: string) {
  const idx = plan.sessions.findIndex((x) => x.sessionId === s.sessionId);
  const relevant = (p: string) => s.project === "both" || p === s.project || p === "personal" || p === "both";
  const priorSessions = plan.sessions.slice(0, idx).filter((x) => relevant(x.project) || s.project === "both");
  const before = new Set(plan.sessions.slice(0, idx).map((x) => x.sessionId));
  // current state as of the start of this session (facts introduced earlier and not yet superseded before now)
  const currentState = allFacts.filter((f) => {
    if (!before.has(f.sessionId) || !relevant(f.project)) return false;
    if (!f.supersededBy) return true;
    const sup = allFacts.find((x) => x.factId === f.supersededBy);
    return !sup || !before.has(sup.sessionId);
  });
  const factLines = facts.map((f) => {
    const old = f.supersedes ? allFacts.find((x) => x.factId === f.supersedes) : undefined;
    return `- ${f.factId} [${f.category}] ${f.statement}\n    MUST contain verbatim: ${f.keyValues.map((k) => JSON.stringify(k)).join(", ")}${old ? `\n    (this CHANGES an earlier fact from ${old.sessionId}: "${old.statement}" — make the change, the old value and the reason explicit)` : ""}`;
  });
  const persona = plan.developer;
  return `Write the full transcript of session ${s.sessionId} (${s.date}), project: ${s.project}.
Title: ${s.title}
What happens: ${s.summary}

DEVELOPER PERSONA: ${persona}
PROJECTS: ${plan.projects.map((p) => `${p.name}: ${p.description}`).join(" | ")}

EARLIER SESSIONS (for continuity; you may refer back naturally, e.g. "like we did last week"):
${priorSessions.map((x) => `${x.sessionId} ${x.date} [${x.project}] ${x.title}: ${x.summary}`).join("\n") || "(this is the first session)"}

CURRENT STATE BEFORE THIS SESSION (do not contradict; only restate a value if it is natural):
${currentState.map((f) => `- ${f.statement}`).join("\n") || "(nothing yet)"}

FACTS THIS SESSION MUST ESTABLISH (each one must be clearly stated or unambiguously shown in the dialogue, with the verbatim strings present):
${factLines.join("\n")}

STYLE
- Exactly about ${s.messageCount} messages, strictly alternating, starting with the user. Total length 10,000-15,000 characters.
- Realistic Claude Code work: the user types short, casual, sometimes terse messages (occasional typos, pasted terminal output, stack traces, \`git diff\` snippets, test output). The assistant explains, shows code blocks, shell commands and their output, proposes diffs, runs into dead ends.
- Include noise a curated summary would drop: a tangent or small talk, a false start that gets reverted, a minor detail. Do NOT front-load facts — spread them through the session; bury at least one fact (especially preferences) mid-session in an otherwise unrelated message.
- Use exact values from the facts verbatim. Do not invent alternative values for anything covered by the facts, and do not mention technologies or decisions that conflict with the current state.
- The session ends naturally (wrap-up, or stopping mid-task with a stated next step if the facts say so).
${feedback ? `\nA PREVIOUS DRAFT FAILED VERIFICATION. Fix these problems:\n${feedback}\n` : ""}
FORMAT: output ONLY the transcript. Start each message with a line containing exactly <<<USER>>> or <<<ASSISTANT>>>, followed by the message text. No other markup before the first marker.`;
}

function parseTranscript(text: string): Msg[] {
  const parts = text.split(/^<<<(USER|ASSISTANT)>>>\s*$/m);
  const msgs: Msg[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const content = (parts[i + 1] ?? "").trim();
    if (content) msgs.push({ role: parts[i] === "USER" ? "user" : "assistant", content });
  }
  return msgs;
}

// ── Step 4: verify ────────────────────────────────────────────────────────────

const SYS_CHECKER = "You are a strict data-quality checker. Output only valid JSON.";

function renderSession(s: Session) {
  return `### Session ${s.sessionId} — date ${s.metadata.date} — project: ${s.metadata.project}\n` +
    s.messages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n");
}

function verifyPrompt(s: Session, facts: Fact[]) {
  return `TRANSCRIPT:
${renderSession(s)}

FACTS TO CHECK:
${facts.map((f) => `${f.factId}: ${f.statement}`).join("\n")}

For each fact decide whether a reader of ONLY this transcript would learn that fact, with the same specific values (numbers, names, error strings, reasons). "expressed" = clearly stated or unambiguously shown; "partial" = topic present but a key value/reason missing or different; "missing" = absent; "contradicted" = transcript states something incompatible.
Return a JSON array: [{"factId": "F001", "verdict": "expressed|partial|missing|contradicted", "note": "short reason"}]`;
}

function stringCheck(s: Session, f: Fact): string[] {
  const text = norm(s.messages.map((m) => m.content).join("\n"));
  return f.keyValues.filter((k) => !text.includes(norm(k)));
}

// ── Step 5: questions ─────────────────────────────────────────────────────────

const CATEGORY_GUIDE: Record<Category, string> = {
  "tech-stack": "Recall of technology choices: languages, frameworks, libraries, databases, exact versions, tools. Prefer exact versions/library names and early-session or minor details a summary would drop.",
  architecture: "Recall of system design decisions AND their rationale: data flow, queues, sync strategy, auth, schema design, exact config values (ports, timeouts, limits, env var names).",
  "session-continuity": "Recall of what was done in a specific earlier session, or what the agreed next step was. Phrase naturally, e.g. 'Last time we worked on the PDF renderer, where did we leave off?' or 'What did we get done on <date> for fieldnote?' Use progress facts.",
  preference: "Recall of the developer's personal coding style, tooling, workflow and communication preferences — often stated casually once. If a preference changed, ask about the current one.",
  "error-solution": "Recall of a bug: the exact error message, root cause, and the fix. Ask e.g. 'We hit <exact error> in ledgerline — what caused it and how did we fix it?'. Ground truth includes cause and fix with exact values.",
  "knowledge-update": "Questions whose answer CHANGED over time. Ask for the CURRENT value without hinting it changed (e.g. 'What is fieldnote's current sync batch size?'). groundTruth = the latest value, optionally noting the earlier value(s). evidenceFactIds = the whole chain (old and new facts). Prefer chains spanning many sessions.",
  "cross-session-synthesis": "Questions that require combining facts from 3+ different sessions (e.g. 'List every env var we've added to ledgerline and its purpose', 'Which timeouts have we tuned across both projects and to what values?', 'What all went wrong with photo uploads over the project?'). Use CURRENT values for anything superseded.",
  abstention: "Questions about plausible-but-NEVER-mentioned things (a technology, config, decision, person, or event that sounds like it fits these projects but is not in the ledger and would not appear in the transcripts). groundTruth explains it was never discussed. Provide absentTerms: 1-3 distinctive key terms (e.g. 'Kafka', 'GraphQL', 'Sentry') that MUST NOT appear anywhere in the transcripts — pick specific named things, not common words. evidenceFactIds = [].",
};

function questionsPrompt(plan: Plan, facts: Fact[], cat: Category, n: number) {
  const ledger = facts
    .map((f) => `${f.factId} [${f.sessionId} ${plan.sessions.find((s) => s.sessionId === f.sessionId)?.date}|${f.project}|${f.category}] ${f.statement}${f.supersedes ? ` (UPDATES ${f.supersedes})` : ""}${f.supersededBy ? ` (SUPERSEDED by ${f.supersededBy})` : ""}`)
    .join("\n");
  return `Write benchmark questions for a coding-assistant memory benchmark, category "${cat}".

CATEGORY: ${CATEGORY_GUIDE[cat]}

PROJECTS: ${plan.projects.map((p) => `${p.name}: ${p.description}`).join(" | ")}
SESSIONS: ${plan.sessions.map((s) => `${s.sessionId} ${s.date} [${s.project}] ${s.title}`).join("; ")}

FACT LEDGER (ground truth; superseded facts are no longer current):
${ledger}

Write ${n} distinct questions. Rules:
- Base every non-abstention question strictly on ledger facts; cite them in evidenceFactIds. groundTruth must be fully supported by those facts, concise but complete, with exact values. For anything superseded, groundTruth uses the CURRENT value.
- Emphasize details a curated project summary would likely drop: exact values, early-session details, minor-but-important gotchas, superseded-vs-current values.
- Questions should sound like a developer asking their assistant. Name the project when ambiguous. Do not leak the answer in the question.
- Cover both projects and many different sessions; avoid near-duplicates.

Return a JSON array: [{"question": "...", "groundTruth": "...", "evidenceFactIds": ["F012"]${cat === "abstention" ? ', "absentTerms": ["..."]' : ""}}]`;
}

// ── Step 6: validate ──────────────────────────────────────────────────────────

const SYS_ANSWER =
  "You answer questions about a developer's past coding sessions using ONLY the transcripts provided. Be concise and specific. Where a value changed over time, give the most recent value. If the transcripts do not contain the answer, reply exactly: NOT FOUND.";

function answerPrompt(q: Question, sessions: Session[]) {
  return `${sessions.map(renderSession).join("\n\n")}\n\nQUESTION: ${q.question}`;
}

function judgePrompt(items: { q: Question; answer: string }[]) {
  return `Grade each answer against its ground truth. An answer is correct if it conveys the essential information of the ground truth (key values, names, cause/fix) without contradicting it; extra detail is fine; for "current value" questions the answer must give the current value. Partial answers that miss a key element of the ground truth are incorrect.

${items.map(({ q, answer }) => `ID: ${q.questionId}\nQUESTION: ${q.question}\nGROUND TRUTH: ${q.groundTruth}\nANSWER: ${answer}`).join("\n---\n")}

Return a JSON array: [{"questionId": "...", "correct": true|false, "reason": "short"}]`;
}

function repairPrompt(q: Question, answer: string, sessions: Session[], facts: Fact[]) {
  return `${sessions.map(renderSession).join("\n\n")}

A benchmark question about the transcripts above failed validation: an answerer reading only these transcripts did not match the ground truth.
QUESTION: ${q.question}
GROUND TRUTH: ${q.groundTruth}
EVIDENCE FACTS: ${facts.map((f) => f.statement).join(" | ")}
ANSWERER SAID: ${answer}

Decide:
- "fix": the transcripts DO support a clear answer but the question is ambiguous or the ground truth is slightly off/over-specified — rewrite the question and/or groundTruth so they match exactly what the transcripts support (current values for changed things).
- "drop": the transcripts do not support a clear unambiguous answer.
Return JSON: {"action": "fix|drop", "question": "...", "groundTruth": "...", "reason": "short"}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const tStart = Date.now();
  log(`scratch=${SCRATCH} out=${OUT}`);

  // 1. plan
  const plan = await llmJson<Plan>("plan", SYS_PLANNER, PLAN_PROMPT, { model: "opus" });
  if (plan.sessions.length !== N_SESSIONS) log(`WARN plan has ${plan.sessions.length} sessions`);
  plan.sessions.forEach((s) => (s.messageCount = Math.max(12, Math.min(30, s.messageCount || 20))));
  log(`plan: ${plan.sessions.length} sessions, ${plan.updateChains.length} chains`);

  // 2 + 3 + 4 interleaved: fact batches are sequential; session writing for a batch starts
  // as soon as its facts exist.
  const facts: Fact[] = [];
  const sessionJobs: Promise<void>[] = [];
  const sessions = new Map<string, Session>();
  const verifyLog: Record<string, { attempts: number; passed: string[]; failed: { factId: string; why: string }[] }> = {};

  const linkSupersession = () => {
    for (const f of facts) delete f.supersededBy;
    for (const f of facts) {
      if (!f.supersedes) continue;
      const old = facts.find((x) => x.factId === f.supersedes);
      if (!old || old.factId === f.factId) { delete f.supersedes; continue; }
      if (old.supersededBy) { log(`WARN ${old.factId} superseded twice (${old.supersededBy}, ${f.factId})`); }
      old.supersededBy = f.factId;
    }
  };

  async function writeAndVerify(s: OutlineSession) {
    const own = facts.filter((f) => f.sessionId === s.sessionId);
    let best: { session: Session; passed: string[]; failed: { factId: string; why: string }[] } | undefined;
    let feedback: string | undefined;
    let attempts = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      attempts++;
      const text = await llm(`session-${s.sessionId}-a${attempt}`, SYS_WRITER, sessionPrompt(plan, s, own, facts, feedback), { model: "sonnet" });
      const messages = parseTranscript(text);
      const session: Session = { sessionId: s.sessionId, metadata: { date: s.date, project: s.project, title: s.title }, messages };
      const failed: { factId: string; why: string }[] = [];
      if (messages.length < 12 || messages[0]?.role !== "user") failed.push({ factId: "*", why: `bad structure: ${messages.length} messages` });
      let verdicts: { factId: string; verdict: string; note: string }[] = [];
      if (messages.length >= 4) {
        verdicts = await llmJson(`verify-${s.sessionId}-a${attempt}`, SYS_CHECKER, verifyPrompt(session, own), { model: "sonnet", effort: "low" });
      }
      for (const f of own) {
        const v = verdicts.find((x) => x.factId === f.factId);
        const missing = stringCheck(session, f);
        if (!v || v.verdict !== "expressed") failed.push({ factId: f.factId, why: `LLM check: ${v?.verdict ?? "no verdict"} — ${v?.note ?? ""}` });
        else if (missing.length) failed.push({ factId: f.factId, why: `verbatim strings missing: ${missing.map((m) => JSON.stringify(m)).join(", ")}` });
      }
      const passed = own.map((f) => f.factId).filter((id) => !failed.some((x) => x.factId === id));
      if (!best || passed.length > best.passed.length || (best.failed.some((x) => x.factId === "*") && !failed.some((x) => x.factId === "*")))
        best = { session, passed, failed };
      if (!failed.length) break;
      feedback = failed
        .map((x) => {
          const f = own.find((y) => y.factId === x.factId);
          return `- ${x.factId}: ${x.why}${f ? ` (fact: ${f.statement}; verbatim: ${f.keyValues.join(" / ")})` : ""}`;
        })
        .join("\n");
    }
    sessions.set(s.sessionId, best!.session);
    verifyLog[s.sessionId] = { attempts, passed: best!.passed, failed: best!.failed };
    log(`session ${s.sessionId}: ${best!.session.messages.length} msgs, ${best!.passed.length}/${own.length} facts verified, ${attempts} attempt(s)`);
  }

  for (let b = 0; b < plan.sessions.length; b += FACT_BATCH) {
    const batch = plan.sessions.slice(b, b + FACT_BATCH);
    const got = await llmJson<Fact[]>(`facts-b${b / FACT_BATCH}`, SYS_PLANNER, factsPrompt(plan, facts, batch, facts.length + 1), { model: "opus" });
    const ids = new Set(batch.map((s) => s.sessionId));
    for (const f of got) {
      if (!ids.has(f.sessionId) || facts.some((x) => x.factId === f.factId)) { log(`WARN dropping fact ${f.factId} (${f.sessionId})`); continue; }
      f.keyValues = (f.keyValues ?? []).filter((k) => typeof k === "string" && k.trim());
      facts.push(f);
    }
    linkSupersession();
    log(`facts batch ${b / FACT_BATCH}: +${got.length} (total ${facts.length})`);
    for (const s of batch) sessionJobs.push(writeAndVerify(s));
  }
  await Promise.all(sessionJobs);

  // Mark verification on facts; supersession is relinked over the final ledger.
  for (const f of facts) f.verified = verifyLog[f.sessionId]?.passed.includes(f.factId) ?? false;
  linkSupersession();
  const orderedSessions = plan.sessions.map((s) => sessions.get(s.sessionId)!);
  const allText = norm(orderedSessions.flatMap((s) => s.messages.map((m) => m.content)).join("\n"));

  // 5. questions (from verified ledger only)
  const vfacts = facts.filter((f) => f.verified);
  const byId = new Map(facts.map((f) => [f.factId, f]));
  const chainOf = (id: string): string[] => {
    // full supersession chain containing id, oldest first
    let head = byId.get(id);
    while (head?.supersedes && byId.get(head.supersedes)) head = byId.get(head.supersedes);
    const out: string[] = [];
    for (let cur = head; cur; cur = cur.supersededBy ? byId.get(cur.supersededBy) : undefined) out.push(cur.factId);
    return out;
  };

  const rawQs = await Promise.all(
    CATEGORIES.map((cat) =>
      llmJson<Omit<Question, "questionId" | "questionType" | "haystackSessionIds">[]>(`questions-${cat}`, SYS_PLANNER, questionsPrompt(plan, vfacts, cat, Q_OVERGEN), { model: "opus" }),
    ),
  );

  const sessionOrder = new Map(plan.sessions.map((s, i) => [s.sessionId, i]));
  const candidates: Record<Category, Question[]> = Object.fromEntries(CATEGORIES.map((c) => [c, []])) as never;
  CATEGORIES.forEach((cat, ci) => {
    rawQs[ci]!.forEach((r, i) => {
      let ev = (r.evidenceFactIds ?? []).filter((id) => byId.has(id));
      if (cat === "knowledge-update") ev = [...new Set(ev.flatMap(chainOf))];
      if (cat !== "abstention" && !ev.length) return;
      const hay = [...new Set(ev.map((id) => byId.get(id)!.sessionId))].sort((a, b) => sessionOrder.get(a)! - sessionOrder.get(b)!);
      candidates[cat].push({
        questionId: `${cat}-${i}`,
        questionType: cat,
        question: r.question,
        groundTruth: r.groundTruth,
        haystackSessionIds: cat === "abstention" ? [] : hay,
        evidenceFactIds: ev,
        ...(cat === "abstention" ? { absentTerms: r.absentTerms ?? [] } : {}),
      });
    });
  });

  // 7. abstention string checks
  const abstLog: { question: string; ok: boolean; found: string[] }[] = [];
  candidates.abstention = candidates.abstention.filter((q) => {
    const terms = q.absentTerms ?? [];
    const found = terms.filter((t) => allText.includes(norm(t)));
    const ok = terms.length > 0 && found.length === 0;
    abstLog.push({ question: q.question, ok, found });
    return ok;
  });

  // 6. validation
  const sess = (ids: string[]) => ids.map((id) => sessions.get(id)!);
  const valLog: Record<string, { round1: boolean; repaired?: string; round2?: boolean; reason?: string }> = {};
  async function validate(qs: Question[], tag: string): Promise<Map<string, { ok: boolean; answer: string; reason: string }>> {
    const answers = await Promise.all(qs.map((q) => llm(`answer-${tag}-${q.questionId}`, SYS_ANSWER, answerPrompt(q, sess(q.haystackSessionIds)), { model: "sonnet", effort: "low" })));
    const res = new Map<string, { ok: boolean; answer: string; reason: string }>();
    const items = qs.map((q, i) => ({ q, answer: answers[i]!.trim() }));
    const chunks: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += 20) chunks.push(items.slice(i, i + 20));
    const verdicts = await Promise.all(chunks.map((c, i) => llmJson<{ questionId: string; correct: boolean; reason: string }[]>(`judge-${tag}-${i}-${sha(JSON.stringify(c))}`, SYS_CHECKER, judgePrompt(c), { model: "sonnet", effort: "low" })));
    const flat = verdicts.flat();
    for (const it of items) {
      const v = flat.find((x) => x.questionId === it.q.questionId);
      res.set(it.q.questionId, { ok: !!v?.correct, answer: it.answer, reason: v?.reason ?? "no verdict" });
    }
    return res;
  }

  const toValidate = CATEGORIES.filter((c) => c !== "abstention").flatMap((c) => candidates[c]);
  const r1 = await validate(toValidate, "r1");
  const failed = toValidate.filter((q) => !r1.get(q.questionId)!.ok);
  for (const q of toValidate) valLog[q.questionId] = { round1: r1.get(q.questionId)!.ok, reason: r1.get(q.questionId)!.reason };
  log(`validation round1: ${toValidate.length - failed.length}/${toValidate.length} passed`);

  const repaired: Question[] = [];
  await Promise.all(
    failed.map(async (q) => {
      const rep = await llmJson<{ action: string; question?: string; groundTruth?: string; reason?: string }>(
        `repair-${q.questionId}`, SYS_CHECKER,
        repairPrompt(q, r1.get(q.questionId)!.answer, sess(q.haystackSessionIds), q.evidenceFactIds.map((id) => byId.get(id)!)),
        { model: "sonnet" },
      );
      valLog[q.questionId]!.repaired = rep.action;
      if (rep.action === "fix" && rep.question && rep.groundTruth) repaired.push({ ...q, question: rep.question, groundTruth: rep.groundTruth });
    }),
  );
  // repairs complete in arbitrary order; restore generation order so judge batches (and their cache keys) are stable
  const pos = new Map(toValidate.map((q, i) => [q.questionId, i]));
  repaired.sort((a, b) => pos.get(a.questionId)! - pos.get(b.questionId)!);
  const r2 = await validate(repaired, "r2");
  for (const q of repaired) valLog[q.questionId]!.round2 = r2.get(q.questionId)!.ok;
  log(`validation round2: ${repaired.filter((q) => r2.get(q.questionId)!.ok).length}/${repaired.length} repaired passed`);

  const passedQ = new Map<string, Question>();
  for (const q of toValidate) if (r1.get(q.questionId)!.ok) passedQ.set(q.questionId, q);
  for (const q of repaired) if (r2.get(q.questionId)!.ok) passedQ.set(q.questionId, q);

  // final selection: first Q_PER_CATEGORY per category in generation order
  const final: Question[] = [];
  let n = 1;
  for (const cat of CATEGORIES) {
    const pool = cat === "abstention" ? candidates.abstention : candidates[cat].map((q) => passedQ.get(q.questionId)).filter(Boolean) as Question[];
    const seen = new Set<string>();
    const picked = pool.filter((q) => { const k = norm(q.question); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, Q_PER_CATEGORY);
    if (picked.length < Q_PER_CATEGORY) log(`WARN ${cat}: only ${picked.length} questions`);
    for (const q of picked) {
      const { absentTerms, ...rest } = q;
      // Memory systems never see session IDs, so refer to sessions by date in user-facing text.
      const dateOf = (id: string) => plan.sessions.find((s) => s.sessionId === id)?.date;
      const deId = (t: string) =>
        t
          // "(S19)" / "(S19, 2026-04-13)" -> " (2026-04-13)", or nothing if that date is already in the text
          .replace(/\s*\((?:session\s+)?(S\d{2})(?:[,\s]+\d{4}-\d{2}-\d{2})?\)/g, (m, id: string) => {
            const d = dateOf(id);
            return !d ? m : t.includes(d) ? "" : ` (${d})`;
          })
          // "S19 (2026-04-13)" / bare "S19" -> "the 2026-04-13 session"
          .replace(/(?:\bsession\s+)?\b(S\d{2})\b(?:\s*\(\d{4}-\d{2}-\d{2}\))?/g, (m, id: string) => {
            const d = dateOf(id);
            return d ? `the ${d} session` : m;
          })
          .replace(/\bthe the\b/g, "the");
      rest.question = deId(rest.question);
      rest.groundTruth = deId(rest.groundTruth);
      final.push({ ...rest, questionId: `Q${String(n++).padStart(3, "0")}`, ...(absentTerms ? { absentTerms } : {}) });
    }
  }

  // ── Write outputs ───────────────────────────────────────────────────────────
  const factsOut = facts.map(({ verified, ...f }) => ({ ...f, verified }));
  writeFileSync(join(OUT, "sessions.json"), JSON.stringify(orderedSessions, null, 2) + "\n");
  writeFileSync(join(OUT, "facts.json"), JSON.stringify(factsOut, null, 2) + "\n");
  writeFileSync(join(OUT, "questions.json"), JSON.stringify(final, null, 2) + "\n");
  writeFileSync(join(OUT, "plan.json"), JSON.stringify(plan, null, 2) + "\n");

  const chars = orderedSessions.reduce((a, s) => a + s.messages.reduce((b, m) => b + m.content.length, 0), 0);
  const stats = {
    sessions: orderedSessions.length,
    messages: orderedSessions.reduce((a, s) => a + s.messages.length, 0),
    chars,
    estTokens: Math.round(chars / 4),
    projects: Object.fromEntries([...new Set(orderedSessions.map((s) => s.metadata.project))].map((p) => [p, orderedSessions.filter((s) => s.metadata.project === p).length])),
    dateRange: [orderedSessions[0]!.metadata.date, orderedSessions.at(-1)!.metadata.date],
    facts: facts.length,
    factsVerified: facts.filter((f) => f.verified).length,
    factsSuperseded: facts.filter((f) => f.supersededBy).length,
    factsSuperseding: facts.filter((f) => f.supersedes).length,
    factsByCategory: Object.fromEntries([...new Set(facts.map((f) => f.category))].map((c) => [c, facts.filter((f) => f.category === c).length])),
    sessionsRegenerated: Object.values(verifyLog).filter((v) => v.attempts > 1).length,
    sessionsFullyVerified: Object.values(verifyLog).filter((v) => !v.failed.length).length,
    questionCandidates: Object.fromEntries(CATEGORIES.map((c) => [c, rawQs[CATEGORIES.indexOf(c)]!.length])),
    validationRound1: { passed: toValidate.length - failed.length, total: toValidate.length },
    validationRepair: { attempted: failed.length, fixed: repaired.length, passedAfterFix: repaired.filter((q) => r2.get(q.questionId)!.ok).length },
    abstentionStringCheck: { passed: abstLog.filter((a) => a.ok).length, total: abstLog.length },
    questionsByCategory: Object.fromEntries(CATEGORIES.map((c) => [c, final.filter((q) => q.questionType === c).length])),
    questions: final.length,
  };
  writeFileSync(join(OUT, "stats.json"), JSON.stringify(stats, null, 2) + "\n");
  log(`llmCalls=${calls} cacheHits=${cacheHits} wallClock=${Math.round((Date.now() - tStart) / 1000)}s`);
  writeFileSync(join(SCRATCH, "verification-log.json"), JSON.stringify({ verifyLog, valLog, abstLog }, null, 2));
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
