/**
 * Memory-bank mode — phase mb-build.
 *
 * Simulates a developer who keeps a Memory Bank per project and says
 * "save bank" at the end of every session. Sessions are processed in the same
 * order codexfi ingests them. Sessions tagged project "both" update every
 * project's bank (one LLM call per bank). Projects are independent, so each
 * project's chain runs concurrently; within a project the order is strict.
 *
 * The bank is checkpointed after every update (resumable) and the final banks
 * are written as markdown to data/runs/<id>/memory-bank/<project>/*.md.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MB_FILES,
  type Checkpoint,
  type MbBuildStep,
  type MemoryBankFiles,
  type UnifiedSession,
} from "../types.js";
import type { Config } from "../utils/config.js";
import { complete } from "../llm/backend.js";
import { markPhaseComplete, runDir, saveCheckpoint } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";
import {
  MB_SYSTEM_PROMPT, MB_BUDGETS, MB_HARD_CAP,
  buildUpdatePrompt, buildCondensePrompt, parseBankJson, emptyBank, estTokens,
} from "../memory-bank/prompt.js";

const BOTH = "both";

/** Distinct real projects across the sessions (ignores the "both" marker). */
export function listProjects(sessions: UnifiedSession[]): string[] {
  const set = new Set<string>();
  for (const s of sessions) for (const p of rawProjects(s)) if (p !== BOTH) set.add(p);
  return set.size > 0 ? [...set] : ["default"];
}

function rawProjects(s: UnifiedSession): string[] {
  const p = s.metadata?.project;
  if (Array.isArray(p)) return p.map(String);
  if (typeof p === "string" && p) return [p];
  return ["default"];
}

/** Projects whose bank a session updates ("both" → every project). */
export function sessionProjects(s: UnifiedSession, all: string[]): string[] {
  const raw = rawProjects(s);
  return raw.includes(BOTH) ? all : raw;
}

const stepKey = (sessionId: string, project: string) => `${sessionId}::${project}`;

function sizes(bank: MemoryBankFiles) {
  const tokens = Object.fromEntries(MB_FILES.map((f) => [f, estTokens(bank[f])])) as MbBuildStep["tokens"];
  const totalTokens = MB_FILES.reduce((s, f) => s + tokens[f], 0);
  return { tokens, totalTokens };
}

function overBudget(bank: MemoryBankFiles): boolean {
  const { tokens, totalTokens } = sizes(bank);
  return totalTokens > MB_HARD_CAP || MB_FILES.some((f) => tokens[f] > MB_BUDGETS[f] * 1.25);
}

async function callBank(prompt: string, previous: MemoryBankFiles, config: Config) {
  // One retry when the output is not parseable JSON.
  let lastText = "";
  let durationMs = 0;
  let usage;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await complete({
      model: config.mbModel,
      system: MB_SYSTEM_PROMPT,
      prompt: attempt === 1 ? prompt : `${prompt}\n\nIMPORTANT: your previous reply was not a valid JSON object. Reply with ONLY the JSON object.`,
      maxOutputTokens: 32_000,
      timeoutMs: parseInt(process.env.MB_TIMEOUT_MS ?? "900000", 10),
    }, config);
    durationMs += res.durationMs;
    usage = res.usage;
    lastText = res.text;
    const bank = parseBankJson(res.text, previous);
    if (bank) return { bank, durationMs, usage, error: undefined as string | undefined };
  }
  return { bank: previous, durationMs, usage, error: `unparseable bank JSON (${lastText.length} chars): ${lastText.slice(0, 120)}` };
}

export async function runMemoryBankBuild(
  sessions: UnifiedSession[],
  cp: Checkpoint,
  config: Config,
): Promise<void> {
  log.phase("MEMORY BANK BUILD");
  const projects = listProjects(sessions);
  log.info(`Simulating "save bank" after each of ${sessions.length} sessions — projects: ${projects.join(", ")} — model ${config.mbModel} [${config.llmBackend}]`);

  if (!cp.memoryBank) {
    cp.memoryBank = {
      model: config.mbModel,
      banks: Object.fromEntries(projects.map((p) => [p, emptyBank()])),
      applied: [],
      history: [],
    };
    saveCheckpoint(cp);
  }
  const state = cp.memoryBank;
  for (const p of projects) state.banks[p] ??= emptyBank();
  const applied = new Set(state.applied);

  // Per-project ordered work lists, in ingest order.
  const chains = new Map<string, UnifiedSession[]>(projects.map((p) => [p, []]));
  for (const s of sessions) {
    const sp = sessionProjects(s, projects);
    for (const p of sp) chains.get(p)!.push(s);
  }
  const totalSteps = [...chains.values()].reduce((n, c) => n + c.length, 0);
  if (applied.size > 0) log.info(`  Resuming: ${applied.size}/${totalSteps} bank updates already applied`);

  await Promise.all([...chains.entries()].map(async ([project, chain]) => {
    for (const session of chain) {
      const key = stepKey(session.sessionId, project);
      if (applied.has(key)) continue;

      const prev = state.banks[project];
      const prompt = buildUpdatePrompt(project, session, prev, sessionProjects(session, projects));
      let { bank, durationMs, usage, error } = await callBank(prompt, prev, config);

      let condensed = false;
      if (!error && overBudget(bank)) {
        log.warn(`  ${project} bank over budget after ${session.sessionId} (~${sizes(bank).totalTokens} tokens) — condensing`);
        const c = await callBank(buildCondensePrompt(project, bank), bank, config);
        durationMs += c.durationMs;
        if (!c.error) { bank = c.bank; condensed = true; }
      }

      state.banks[project] = bank;
      const { tokens, totalTokens } = sizes(bank);
      state.history.push({ sessionId: session.sessionId, project, tokens, totalTokens, durationMs, usage, condensed: condensed || undefined, error });
      applied.add(key);
      state.applied = [...applied];
      saveCheckpoint(cp);

      const sizeStr = MB_FILES.map((f) => `${f.replace(".md", "")}=${tokens[f]}`).join(" ");
      const tag = error ? ` ⚠ ${error}` : condensed ? " (condensed)" : "";
      log.dim(`  [${applied.size}/${totalSteps}] ${session.sessionId} → ${project}: ~${totalTokens} tok (${sizeStr}) ${(durationMs / 1000).toFixed(1)}s${tag}`);
    }
  }));

  writeBankFiles(cp);
  markPhaseComplete(cp, "mb-build");

  const errors = state.history.filter((h) => h.error).length;
  for (const p of projects) {
    const { totalTokens } = sizes(state.banks[p]);
    log.success(`Memory bank ${p}: ~${totalTokens} tokens`);
  }
  if (errors > 0) log.warn(`${errors} bank update(s) failed to parse — previous bank kept for those sessions`);
}

/** Write final banks + size history under the run dir. */
export function writeBankFiles(cp: Checkpoint): void {
  if (!cp.memoryBank) return;
  const base = join(runDir(cp.runId), "memory-bank");
  for (const [project, bank] of Object.entries(cp.memoryBank.banks)) {
    const dir = join(base, project.replace(/[^a-zA-Z0-9_.-]/g, "_"));
    mkdirSync(dir, { recursive: true });
    for (const f of MB_FILES) writeFileSync(join(dir, f), bank[f]);
  }
  writeFileSync(join(base, "sizes.json"), JSON.stringify(cp.memoryBank.history, null, 2));
  log.info(`  Banks written to ${base}`);
}
