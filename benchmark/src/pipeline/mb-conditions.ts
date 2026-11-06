/**
 * Memory-bank mode — context assembly, answering and judging per CONDITION.
 *
 *   no-memory     no context (floor)
 *   mb-only       every project's Memory Bank concatenated. DevMemBench questions
 *                 are cross-project, so all banks are given — mirrors a developer
 *                 who has both banks loaded.
 *   codexfi-only  the codexfi [MEMORY] block exactly as block-quality mode builds it
 *   mb+codexfi    Memory Bank(s) + codexfi block built with memoryBankAware=true
 *   full-context  every ingested session transcript concatenated (oracle / upper
 *                 bound) — skipped when over BENCH_FULL_CONTEXT_MAX_CHARS
 *
 * All conditions use the same system prompt (context as system prompt, answer
 * only from it) and the same user prompt as block-quality mode.
 */

import {
  MB_FILES,
  type Checkpoint,
  type MbAnswer,
  type MbCondition,
  type MbEvaluation,
  type UnifiedQuestion,
  type UnifiedSession,
} from "../types.js";
import type { Config } from "../utils/config.js";
import { buildCodexfiBlock } from "./codexfi-block.js";
import { buildContextSystemPrompt } from "./answer.js";
import { buildBlockQualityAnswerPrompt, getJudgePrompt, formatJudgePrompt } from "../prompts/index.js";
import { answer as generateAnswer, judge } from "../judges/llm.js";
import { markPhaseComplete, saveCheckpoint, throttledSaver } from "../utils/checkpoint.js";
import { mapPool } from "../utils/concurrency.js";
import { renderTranscript } from "../memory-bank/prompt.js";
import { log } from "../utils/logger.js";

export const needsCodexfi = (c: MbCondition[]) => c.includes("codexfi-only") || c.includes("mb+codexfi");
export const needsBank    = (c: MbCondition[]) => c.includes("mb-only") || c.includes("mb+codexfi");

// ── Static contexts ───────────────────────────────────────────────────────────

export function renderBanks(cp: Checkpoint): string {
  const banks = cp.memoryBank?.banks ?? {};
  const projects = Object.keys(banks);
  if (projects.length === 0) return "";
  const header = projects.length > 1
    ? `The developer works on ${projects.length} projects (${projects.join(", ")}). The Memory Bank of each project is loaded below.\n\n`
    : "";
  return header + projects.map((p) =>
    `# Memory Bank — project: ${p}\n\n` +
    MB_FILES.map((f) => `## ${f}\n\n${banks[p][f].trim() || "(empty)"}`).join("\n\n")
  ).join("\n\n---\n\n");
}

export function renderFullContext(sessions: UnifiedSession[]): string {
  return sessions.map((s) => {
    const date = (s.metadata?.date as string | undefined) ?? "unknown date";
    const project = s.metadata?.project ? `, project: ${String(s.metadata.project)}` : "";
    return `## Session ${s.sessionId} (${date}${project})\n\n${renderTranscript(s)}`;
  }).join("\n\n");
}

export function fullContextMaxChars(): number {
  return parseInt(process.env.BENCH_FULL_CONTEXT_MAX_CHARS ?? "600000", 10);
}

// ── Phase: mb-contexts ────────────────────────────────────────────────────────

export async function runMbContexts(
  questions: UnifiedQuestion[],
  sessions: UnifiedSession[],
  cp: Checkpoint,
  config: Config,
): Promise<void> {
  log.phase("MB CONTEXTS");
  const conditions = cp.mbConditions!;

  if (conditions.includes("full-context")) {
    const full = renderFullContext(sessions);
    const cap = fullContextMaxChars();
    if (full.length > cap) {
      cp.fullContextNote = `full-context skipped: ${full.length} chars > BENCH_FULL_CONTEXT_MAX_CHARS=${cap}`;
      log.warn(cp.fullContextNote);
    } else {
      cp.fullContextNote = undefined;
      log.info(`  full-context: ${full.length} chars (~${Math.ceil(full.length / 4)} tokens)`);
    }
  }
  if (needsBank(conditions)) {
    const bank = renderBanks(cp);
    log.info(`  memory bank context: ${bank.length} chars (~${Math.ceil(bank.length / 4)} tokens)`);
  }

  if (needsCodexfi(conditions)) {
    const wantFull = conditions.includes("codexfi-only");
    const wantAware = conditions.includes("mb+codexfi");
    cp.mbContexts ??= {};
    const ctx = cp.mbContexts;
    const pending = questions.filter((q) => {
      const e = ctx[q.questionId];
      return !e || (wantFull && e.codexfi === undefined) || (wantAware && e.codexfiMbAware === undefined);
    });
    log.info(`  Building codexfi blocks for ${pending.length} questions (memoryBankAware: ${[wantFull && "false", wantAware && "true"].filter(Boolean).join(" + ")})`);
    const saver = throttledSaver(cp);
    await mapPool(pending, config.concurrency, async (q) => {
      const start = Date.now();
      const entry = { ...(ctx[q.questionId] ?? { durationMs: 0 }) };
      if (wantFull && entry.codexfi === undefined) {
        entry.codexfi = await buildCodexfiBlock(q.question, cp.runTag, { memoryBankAware: false });
      }
      if (wantAware && entry.codexfiMbAware === undefined) {
        entry.codexfiMbAware = await buildCodexfiBlock(q.question, cp.runTag, { memoryBankAware: true });
      }
      entry.durationMs += Date.now() - start;
      return { q, entry };
    }, ({ q, entry }) => {
      ctx[q.questionId] = entry;
      saver.save();
      log.dim(`  ${q.questionId}: codexfi ${entry.codexfi?.length ?? "-"} chars, mb-aware ${entry.codexfiMbAware?.length ?? "-"} chars`);
    });
    saver.flush();
  }

  markPhaseComplete(cp, "mb-contexts");
}

/** Context text for a (condition, question) pair, or null when the condition is skipped. */
function contextFor(
  condition: MbCondition,
  q: UnifiedQuestion,
  cp: Checkpoint,
  statics: { bank: string; full: string | null },
): string | null {
  const e = cp.mbContexts?.[q.questionId];
  switch (condition) {
    case "no-memory":    return "";
    case "mb-only":      return statics.bank;
    case "codexfi-only": return e?.codexfi ?? "";
    case "mb+codexfi": {
      const block = e?.codexfiMbAware ?? "";
      return block ? `${statics.bank}\n\n---\n\n${block}` : statics.bank;
    }
    case "full-context": return statics.full;
  }
}

/** Conditions that will actually be answered (full-context drops out when over the cap). */
export function activeConditions(cp: Checkpoint): MbCondition[] {
  return cp.mbConditions!.filter((c) => !(c === "full-context" && cp.fullContextNote));
}

// ── Phase: mb-answer ──────────────────────────────────────────────────────────

export async function runMbAnswer(
  questions: UnifiedQuestion[],
  sessions: UnifiedSession[],
  cp: Checkpoint,
  config: Config,
): Promise<void> {
  log.phase("MB ANSWER");
  const conditions = activeConditions(cp);
  const statics = {
    bank: needsBank(conditions) ? renderBanks(cp) : "",
    full: conditions.includes("full-context") ? renderFullContext(sessions) : null,
  };
  cp.mbAnswers ??= {};
  const answers = cp.mbAnswers;
  for (const c of conditions) answers[c] ??= {};

  const items = conditions.flatMap((c) => questions.map((q) => ({ c, q })))
    .filter(({ c, q }) => !answers[c]![q.questionId]);
  log.info(`Answering ${items.length} (condition × question) pairs with ${config.answeringModel} [${config.llmBackend}, concurrency ${config.concurrency}] — conditions: ${conditions.join(", ")}`);

  const saver = throttledSaver(cp);
  let n = 0;
  await mapPool(items, config.concurrency, async ({ c, q }) => {
    const context = contextFor(c, q, cp, statics) ?? "";
    const ans = await generateAnswer(
      buildBlockQualityAnswerPrompt(q.question, q.questionType),
      config,
      { system: buildContextSystemPrompt(context) },
    );
    const r: MbAnswer = {
      questionId: q.questionId, condition: c, answer: ans.text,
      durationMs: ans.durationMs, contextChars: context.length, usage: ans.usage,
    };
    return r;
  }, (r) => {
    answers[r.condition]![r.questionId] = r;
    saver.save();
    n++;
    log.dim(`  [${n}/${items.length}] ${r.condition.padEnd(12)} ${r.questionId}: ${r.answer.slice(0, 70).replace(/\n/g, " ")}${r.answer.length > 70 ? "…" : ""}`);
  });
  saver.flush();
  markPhaseComplete(cp, "mb-answer");
}

// ── Phase: mb-evaluate ────────────────────────────────────────────────────────

export async function runMbEvaluate(
  questions: UnifiedQuestion[],
  cp: Checkpoint,
  config: Config,
): Promise<void> {
  log.phase("MB EVALUATE");
  const conditions = activeConditions(cp);
  cp.mbEvaluations ??= {};
  const evals = cp.mbEvaluations;
  for (const c of conditions) evals[c] ??= {};

  const items = conditions.flatMap((c) => questions.map((q) => ({ c, q })))
    .filter(({ c, q }) => !evals[c]![q.questionId] && cp.mbAnswers?.[c]?.[q.questionId]);
  log.info(`Judging ${items.length} answers with ${config.judgeModel} [${config.llmBackend}, concurrency ${config.concurrency}]`);

  const saver = throttledSaver(cp);
  let n = 0;
  await mapPool(items, config.concurrency, async ({ c, q }) => {
    const a = cp.mbAnswers![c]![q.questionId];
    const prompt = formatJudgePrompt(getJudgePrompt(q.questionType), q.question, q.groundTruth, a.answer);
    const res = await judge(prompt, config);
    const e: MbEvaluation = {
      questionId: q.questionId, questionType: q.questionType, condition: c,
      question: q.question, groundTruth: q.groundTruth, hypothesis: a.answer,
      score: res.score, label: res.label, explanation: res.explanation,
      contextChars: a.contextChars, answerDurationMs: a.durationMs, judgeDurationMs: res.durationMs ?? 0,
    };
    return e;
  }, (e) => {
    evals[e.condition]![e.questionId] = e;
    saver.save();
    n++;
    log.dim(`  [${n}/${items.length}] ${e.score === 1 ? "✓" : "✗"} ${e.condition.padEnd(12)} ${e.questionId} [${e.questionType}]: ${e.explanation.slice(0, 60)}`);
  });
  saver.flush();
  saveCheckpoint(cp);
  markPhaseComplete(cp, "mb-evaluate");
}
