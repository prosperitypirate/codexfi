/**
 * Memory-bank mode — report.json + report.md + terminal summary.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MB_FILES,
  QUESTION_TYPES,
  type Checkpoint,
  type MbCondition,
  type MbEvaluation,
  type UnifiedQuestion,
} from "../types.js";
import { markPhaseComplete, runDir } from "../utils/checkpoint.js";
import { activeConditions } from "./mb-conditions.js";
import { log } from "../utils/logger.js";

interface Stats { total: number; correct: number; accuracy: number }

interface ConditionReport {
  condition: MbCondition;
  summary: Stats;
  byQuestionType: Record<string, Stats>;
  context: { avgChars: number; avgEstTokens: number; maxChars: number };
  latency: { answerMeanMs: number; answerMedianMs: number; answerP95Ms: number; judgeMeanMs: number };
  usage: { avgInputTokens: number; avgOutputTokens: number; totalCostUsd?: number };
}

interface Flip { questionId: string; questionType: string; question: string; groundTruth: string; mbOnly: string; mbPlusCodexfi: string }

export interface MemoryBankReport {
  runId: string;
  mode: "memory-bank";
  dataset: string;
  llmBackend?: string;
  judgeModel: string;
  answeringModel: string;
  mbModel?: string;
  runTag: string;
  timestamp: string;
  totalQuestions: number;
  conditions: ConditionReport[];
  skipped: string[];
  delta?: {
    a: "mb+codexfi"; b: "mb-only";
    overall: number;
    byQuestionType: Record<string, { mbOnly: number; mbPlusCodexfi: number; delta: number; gained: number; lost: number }>;
    gained: Flip[];
    lost: Flip[];
  };
  memoryBank?: {
    projects: Record<string, { tokens: Record<string, number>; totalTokens: number }>;
    updates: number;
    buildDurationMs: number;
    parseErrors: number;
  };
  ingestTotalMs?: number;
  totalDurationMs?: number;
  evaluations: MbEvaluation[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
function pctl(v: number[], p: number) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(Math.floor(p * s.length), s.length - 1)];
}
const stats = (es: MbEvaluation[]): Stats => {
  const correct = es.filter((e) => e.score === 1).length;
  return { total: es.length, correct, accuracy: es.length ? correct / es.length : 0 };
};
const typeOrder = (types: string[]) => {
  const known = Object.keys(QUESTION_TYPES);
  return [...new Set(types)].sort((a, b) => (known.indexOf(a) + 1 || 99) - (known.indexOf(b) + 1 || 99));
};
const alias = (t: string) => (QUESTION_TYPES as Record<string, { alias: string }>)[t]?.alias ?? t;

export function runMbReport(cp: Checkpoint, questions: UnifiedQuestion[]): MemoryBankReport {
  log.phase("REPORT");
  const qOrder = questions.map((q) => q.questionId);
  const conds = activeConditions(cp);
  const allTypes = typeOrder(questions.map((q) => q.questionType));

  const evalsFor = (c: MbCondition) =>
    qOrder.map((id) => cp.mbEvaluations?.[c]?.[id]).filter((e): e is MbEvaluation => !!e);

  const conditions: ConditionReport[] = conds.map((c) => {
    const es = evalsFor(c);
    const answers = qOrder.map((id) => cp.mbAnswers?.[c]?.[id]).filter((a) => !!a);
    const byQuestionType: Record<string, Stats> = {};
    for (const t of allTypes) {
      const te = es.filter((e) => e.questionType === t);
      if (te.length) byQuestionType[t] = stats(te);
    }
    const chars = es.map((e) => e.contextChars);
    const ans = es.map((e) => e.answerDurationMs);
    const costs = answers.map((a) => a!.usage?.costUsd).filter((x): x is number => typeof x === "number");
    return {
      condition: c,
      summary: stats(es),
      byQuestionType,
      context: { avgChars: Math.round(mean(chars)), avgEstTokens: Math.round(mean(chars) / 4), maxChars: Math.max(0, ...chars) },
      latency: {
        answerMeanMs: Math.round(mean(ans)),
        answerMedianMs: Math.round(pctl(ans, 0.5)),
        answerP95Ms: Math.round(pctl(ans, 0.95)),
        judgeMeanMs: Math.round(mean(es.map((e) => e.judgeDurationMs))),
      },
      usage: {
        avgInputTokens: Math.round(mean(answers.map((a) => a!.usage?.inputTokens ?? 0))),
        avgOutputTokens: Math.round(mean(answers.map((a) => a!.usage?.outputTokens ?? 0))),
        ...(costs.length ? { totalCostUsd: Number(costs.reduce((s, x) => s + x, 0).toFixed(4)) } : {}),
      },
    };
  });

  const skipped: string[] = [];
  if (cp.fullContextNote) skipped.push(cp.fullContextNote);

  // ── Delta: mb+codexfi − mb-only ──
  let delta: MemoryBankReport["delta"];
  if (conds.includes("mb+codexfi") && conds.includes("mb-only")) {
    const a = new Map(evalsFor("mb+codexfi").map((e) => [e.questionId, e]));
    const b = new Map(evalsFor("mb-only").map((e) => [e.questionId, e]));
    const both = qOrder.filter((id) => a.has(id) && b.has(id));
    const flip = (id: string): Flip => {
      const ea = a.get(id)!, eb = b.get(id)!;
      return { questionId: id, questionType: ea.questionType, question: ea.question, groundTruth: ea.groundTruth, mbOnly: eb.hypothesis, mbPlusCodexfi: ea.hypothesis };
    };
    const gained = both.filter((id) => a.get(id)!.score === 1 && b.get(id)!.score === 0).map(flip);
    const lost   = both.filter((id) => a.get(id)!.score === 0 && b.get(id)!.score === 1).map(flip);
    const byQuestionType: NonNullable<MemoryBankReport["delta"]>["byQuestionType"] = {};
    for (const t of allTypes) {
      const ids = both.filter((id) => a.get(id)!.questionType === t);
      if (!ids.length) continue;
      const accA = ids.filter((id) => a.get(id)!.score === 1).length / ids.length;
      const accB = ids.filter((id) => b.get(id)!.score === 1).length / ids.length;
      byQuestionType[t] = {
        mbOnly: accB, mbPlusCodexfi: accA, delta: accA - accB,
        gained: gained.filter((f) => f.questionType === t).length,
        lost: lost.filter((f) => f.questionType === t).length,
      };
    }
    const overallA = both.filter((id) => a.get(id)!.score === 1).length / Math.max(1, both.length);
    const overallB = both.filter((id) => b.get(id)!.score === 1).length / Math.max(1, both.length);
    delta = { a: "mb+codexfi", b: "mb-only", overall: overallA - overallB, byQuestionType, gained, lost };
  }

  let memoryBank: MemoryBankReport["memoryBank"];
  if (cp.memoryBank) {
    const projects: NonNullable<MemoryBankReport["memoryBank"]>["projects"] = {};
    for (const [p, bank] of Object.entries(cp.memoryBank.banks)) {
      const tokens = Object.fromEntries(MB_FILES.map((f) => [f, Math.ceil(bank[f].length / 4)]));
      projects[p] = { tokens, totalTokens: Object.values(tokens).reduce((s, x) => s + x, 0) };
    }
    memoryBank = {
      projects,
      updates: cp.memoryBank.history.length,
      buildDurationMs: cp.memoryBank.history.reduce((s, h) => s + h.durationMs, 0),
      parseErrors: cp.memoryBank.history.filter((h) => h.error).length,
    };
  }

  const report: MemoryBankReport = {
    runId: cp.runId, mode: "memory-bank", dataset: cp.dataset ?? "v1", llmBackend: cp.llmBackend,
    judgeModel: cp.judgeModel, answeringModel: cp.answeringModel, mbModel: cp.memoryBank?.model,
    runTag: cp.runTag, timestamp: new Date().toISOString(), totalQuestions: questions.length,
    conditions, skipped, delta, memoryBank,
    ingestTotalMs: cp.ingestResult?.totalDurationMs, totalDurationMs: cp.totalDurationMs,
    evaluations: conds.flatMap(evalsFor),
  };

  const dir = runDir(cp.runId);
  writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 2));
  const md = renderMarkdown(report, allTypes);
  writeFileSync(join(dir, "report.md"), md);
  markPhaseComplete(cp, "report");

  printSummary(report, allTypes);
  console.log(`\n  Report saved to: ${join(dir, "report.json")}`);
  console.log(`                   ${join(dir, "report.md")}\n`);
  return report;
}

function renderMarkdown(r: MemoryBankReport, types: string[]): string {
  const L: string[] = [];
  L.push(`# DevMemBench — memory-bank mode — run \`${r.runId}\``, "");
  L.push(`Dataset **${r.dataset}** · ${r.totalQuestions} questions · backend \`${r.llmBackend ?? "api"}\` · answer \`${r.answeringModel}\` · judge \`${r.judgeModel}\`${r.mbModel ? ` · bank model \`${r.mbModel}\`` : ""} · ${r.timestamp}`, "");
  if (r.skipped.length) L.push(...r.skipped.map((s) => `> ${s}`), "");

  L.push("## Accuracy by condition × category", "");
  L.push(`| Category | ${r.conditions.map((c) => c.condition).join(" | ")} |`);
  L.push(`|---|${r.conditions.map(() => "---:").join("|")}|`);
  for (const t of types) {
    L.push(`| ${t} | ${r.conditions.map((c) => {
      const s = c.byQuestionType[t];
      return s ? `${pct(s.accuracy)} (${s.correct}/${s.total})` : "—";
    }).join(" | ")} |`);
  }
  L.push(`| **Overall** | ${r.conditions.map((c) => `**${pct(c.summary.accuracy)}** (${c.summary.correct}/${c.summary.total})`).join(" | ")} |`, "");

  L.push("## Context size and latency", "");
  L.push("| Condition | Avg context chars | Avg est. tokens | Max chars | Answer mean / median / p95 (ms) | Judge mean (ms) | Avg in/out tokens |");
  L.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const c of r.conditions) {
    L.push(`| ${c.condition} | ${c.context.avgChars} | ${c.context.avgEstTokens} | ${c.context.maxChars} | ${c.latency.answerMeanMs} / ${c.latency.answerMedianMs} / ${c.latency.answerP95Ms} | ${c.latency.judgeMeanMs} | ${c.usage.avgInputTokens} / ${c.usage.avgOutputTokens} |`);
  }
  L.push("");

  if (r.delta) {
    const d = r.delta;
    L.push(`## Delta: mb+codexfi − mb-only (overall ${signed(d.overall)})`, "");
    L.push("| Category | mb-only | mb+codexfi | Δ | gained | lost |");
    L.push("|---|---:|---:|---:|---:|---:|");
    for (const [t, x] of Object.entries(d.byQuestionType)) {
      L.push(`| ${t} | ${pct(x.mbOnly)} | ${pct(x.mbPlusCodexfi)} | ${signed(x.delta)} | ${x.gained} | ${x.lost} |`);
    }
    L.push("");
    for (const [title, list] of [["Gained (mb-only ✗ → mb+codexfi ✓)", d.gained], ["Lost (mb-only ✓ → mb+codexfi ✗)", d.lost]] as const) {
      L.push(`### ${title} — ${list.length}`, "");
      for (const f of list) {
        L.push(`- **${f.questionId}** [${f.questionType}] ${f.question}`);
        L.push(`  - expected: ${oneLine(f.groundTruth)}`);
        L.push(`  - mb-only: ${oneLine(f.mbOnly)}`);
        L.push(`  - mb+codexfi: ${oneLine(f.mbPlusCodexfi)}`);
      }
      L.push("");
    }
  }

  if (r.memoryBank) {
    L.push("## Memory Bank (final, est. tokens)", "");
    L.push(`| Project | ${MB_FILES.join(" | ")} | total |`);
    L.push(`|---|${MB_FILES.map(() => "---:").join("|")}|---:|`);
    for (const [p, x] of Object.entries(r.memoryBank.projects)) {
      L.push(`| ${p} | ${MB_FILES.map((f) => x.tokens[f]).join(" | ")} | ${x.totalTokens} |`);
    }
    L.push("", `${r.memoryBank.updates} bank updates · build time ${(r.memoryBank.buildDurationMs / 1000).toFixed(0)}s · parse errors ${r.memoryBank.parseErrors} · size history in \`memory-bank/sizes.json\``, "");
  }
  return L.join("\n");
}

function printSummary(r: MemoryBankReport, types: string[]): void {
  const w = 13;
  console.log(`\n  Memory-bank mode — run ${r.runId} (dataset ${r.dataset}, ${r.totalQuestions} questions)\n`);
  console.log(`  ${"category".padEnd(12)}${r.conditions.map((c) => c.condition.padStart(w)).join("")}`);
  for (const t of types) {
    console.log(`  ${alias(t).padEnd(12)}${r.conditions.map((c) => {
      const s = c.byQuestionType[t];
      return (s ? pct(s.accuracy) : "—").padStart(w);
    }).join("")}`);
  }
  console.log(`  ${"OVERALL".padEnd(12)}${r.conditions.map((c) => pct(c.summary.accuracy).padStart(w)).join("")}`);
  console.log(`  ${"ctx tokens".padEnd(12)}${r.conditions.map((c) => String(c.context.avgEstTokens).padStart(w)).join("")}`);
  console.log(`  ${"answer ms".padEnd(12)}${r.conditions.map((c) => String(c.latency.answerMeanMs).padStart(w)).join("")}`);
  for (const s of r.skipped) console.log(`\n  note: ${s}`);
  if (r.delta) {
    console.log(`\n  Δ mb+codexfi − mb-only: ${signed(r.delta.overall)}  (gained ${r.delta.gained.length}, lost ${r.delta.lost.length})`);
    for (const [t, x] of Object.entries(r.delta.byQuestionType)) {
      if (x.gained || x.lost) console.log(`    ${alias(t).padEnd(12)} ${signed(x.delta).padStart(7)}  +${x.gained} −${x.lost}`);
    }
    if (r.delta.gained.length) console.log(`    gained: ${r.delta.gained.map((f) => f.questionId).join(", ")}`);
    if (r.delta.lost.length)   console.log(`    lost:   ${r.delta.lost.map((f) => f.questionId).join(", ")}`);
  }
}

const signed = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}pp`;
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);
