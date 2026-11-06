/**
 * Prompts for the simulated Memory Bank ("save bank" at the end of each session).
 *
 * A Memory Bank = six markdown files per project that a developer keeps the
 * agent updating at session end, under per-file token budgets with
 * rolling-window aging of activeContext.md. Written for this benchmark.
 */

import { MB_FILES, type MbFile, type MemoryBankFiles, type UnifiedSession } from "../types.js";

/** Per-file budgets in estimated tokens (chars / 4). */
export const MB_BUDGETS: Record<MbFile, number> = {
  "projectbrief.md":   3_000,
  "productContext.md": 8_000,
  "systemPatterns.md": 15_000,
  "techContext.md":    10_000,
  "activeContext.md":  19_000,
  "progress.md":       12_000,
};
export const MB_TOTAL_TARGET = 67_000;
export const MB_HARD_CAP     = 70_000;

export const estTokens = (s: string): number => Math.ceil(s.length / 4);

export const MB_SYSTEM_PROMPT = `You maintain a developer's Memory Bank for ONE software project: six markdown files that an AI coding agent reads at the start of every session to recover project context. At the end of each coding session the developer says "save bank" and you update the bank from that session's transcript.

FILES (budgets in estimated tokens, ~4 characters per token):
- projectbrief.md (max 3,000): the foundation — what the project is, core requirements, goals, scope. Changes rarely.
- productContext.md (max 8,000): why the project exists, problems it solves, users, UX expectations.
- systemPatterns.md (max 15,000): architecture, components and how they interact, data flow, API design, design patterns, key technical decisions with rationale, coding conventions.
- techContext.md (max 10,000): languages, frameworks, libraries and versions, databases, infrastructure, tooling, configuration values, environment variables, dev setup, constraints, the developer's tool and style preferences.
- activeContext.md (max 19,000): current focus, recent changes, next steps, open questions — kept as a rolling window of sessions, aged by date relative to the newest session:
    * "Current Focus": the last 1-2 sessions in full detail (up to ~4,000 tokens per session).
    * "Recent Work": sessions from the previous 2-3 weeks, condensed to ~500 tokens each.
    * "Established Patterns": older sessions, condensed to ~80 tokens each (one compact entry: impact, pattern, lesson, key files).
- progress.md (max 12,000): what works, what is left, known issues, and a "Completed Milestones" markdown table with columns | Achievement | Date | Impact | Status |, one row per milestone.
Total target ~67,000 tokens; hard cap 70,000 tokens.

RULES:
- Update the existing bank; do not start over. Keep every still-valid fact.
- When a fact changes (a library replaced, a value changed, a decision reversed), update it in place to the CURRENT state and keep a brief note of what it replaced and when (e.g. "Migrated from X to Y on 2025-01-20"), so the history stays recoverable.
- Capture concrete specifics: names, versions, config values and numbers, file paths, endpoints, error messages and their root causes and fixes, commands, decisions with rationale, dates. Specifics are what make the bank useful.
- Record preferences and conventions the developer states.
- Only record what the transcript actually says — never invent or extrapolate.
- Put each fact in the most appropriate file; avoid duplicating it across files.
- Respect the budgets. When a file would exceed its budget, condense its oldest material first (apply the aging rules above to activeContext.md).
- Only rewrite files this session actually affects (like editing just those files). Empty files (first session) get sensible headings and whatever the session supports.

OUTPUT: exactly one JSON object whose keys are the file names you changed (any of "projectbrief.md", "productContext.md", "systemPatterns.md", "techContext.md", "activeContext.md", "progress.md") and whose values are the COMPLETE updated markdown content of that file. Omit unchanged files — they are kept as they are. activeContext.md and progress.md almost always change.
Example shape: {"activeContext.md": "...", "progress.md": "..."}
Output only the JSON object — no prose before or after it, no code fences.`;

export function emptyBank(): MemoryBankFiles {
  return Object.fromEntries(MB_FILES.map((f) => [f, ""])) as MemoryBankFiles;
}

export function renderBankForPrompt(bank: MemoryBankFiles): string {
  return MB_FILES.map((f) => {
    const body = bank[f].trim();
    return `### ${f} (~${estTokens(bank[f])} tokens)\n${body || "(empty)"}`;
  }).join("\n\n");
}

export function renderTranscript(session: UnifiedSession): string {
  return session.messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n");
}

export function buildUpdatePrompt(
  project: string,
  session: UnifiedSession,
  bank: MemoryBankFiles,
  sessionProjects: string[],
): string {
  const date = (session.metadata?.date as string | undefined) ?? "unknown date";
  const multi = sessionProjects.length > 1
    ? `\nNote: this session spans several projects (${sessionProjects.join(", ")}). Record only what is relevant to ${project}, including shared facts and preferences that apply to it.\n`
    : "";
  return `Project: ${project}
Session: ${session.sessionId} (${date})
${multi}
## Current Memory Bank
${renderBankForPrompt(bank)}

## Session transcript
${renderTranscript(session)}

The developer says: "save bank". Return the changed Memory Bank files as the JSON object described in your instructions.`;
}

export function buildCondensePrompt(project: string, bank: MemoryBankFiles): string {
  const sizes = MB_FILES.map((f) => `${f}: ~${estTokens(bank[f])} / ${MB_BUDGETS[f]}`).join("\n");
  const total = MB_FILES.reduce((s, f) => s + estTokens(bank[f]), 0);
  return `Project: ${project}

The Memory Bank below is ~${total} tokens, over its budgets (hard cap ${MB_HARD_CAP}, target ${MB_TOTAL_TARGET}):
${sizes}

Condense it to fit every per-file budget. Apply the activeContext.md aging rules, merge redundant entries, and drop prose before facts. Do NOT drop current-state facts, specific values, decisions, or error fixes.

## Current Memory Bank
${renderBankForPrompt(bank)}

Return the full condensed Memory Bank as the JSON object described in your instructions.`;
}

/**
 * Parse the LLM's JSON bank. Missing keys keep the previous content.
 * Returns null when no JSON object could be parsed.
 */
export function parseBankJson(text: string, previous: MemoryBankFiles): MemoryBankFiles | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && !t.startsWith("{")) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(t.slice(first, last + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const out = { ...previous };
  let found = 0;
  for (const f of MB_FILES) {
    const v = obj[f];
    if (typeof v === "string") { out[f] = v; found++; }
  }
  return found > 0 ? out : null;
}
