/**
 * Scenario 01 — Cross-Session Memory Continuity
 *
 * Session 1: Start in a fresh project dir. Describe a project to the agent so
 *            auto-save has something meaningful to extract.
 * Verify   : Memories appear in the backend with correct project tag.
 * Session 2: New session in the SAME dir. Ask the agent to output its [MEMORY] block.
 * Assert   : The [MEMORY] block contains sections seeded from Session 1.
 */

import { createTestDir, runOpencode } from "../opencode.js";
import { getMemoriesForDir, waitForMemories } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
  const id = "01";
  const name = "Cross-Session Memory Continuity";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("cross-session");
  details.push(`test dir: ${dir}`);

  try {
    // ── Session 1 ──────────────────────────────────────────────────────────────
    details.push("Session 1: describing project to agent…");
    const s1 = await runOpencode(
      "I am building a TypeScript CLI tool called 'taskflow'. " +
      "It uses SQLite via bun:sqlite to store tasks with priorities. " +
      "Main commands: taskflow add <title>, taskflow list, taskflow done <id>. " +
      "The architecture uses a Repository pattern with a TaskRepository class. " +
      "Tech stack: Bun runtime, TypeScript, SQLite. " +
      "Current status: v0.1.0, add and list commands done, done command in progress. " +
      "Please acknowledge you understood the project description.",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  sessionID: ${s1.sessionID}`);
    details.push(`  exitCode: ${s1.exitCode}, duration: ${(s1.durationMs/1000).toFixed(1)}s`);
    details.push(`  response preview: ${s1.text.slice(0, 100)}…`);

    if (s1.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now()-start, details, error: `Session 1 failed with exit ${s1.exitCode}: ${s1.stderr.slice(0,200)}` };
    }

    // ── Wait for auto-save ──────────────────────────────────────────────────────
    details.push("Waiting up to 30s for auto-save to fire…");
    const memories = await waitForMemories(dir, 1, 30_000);
    details.push(`  memories saved: ${memories.length}`);

    if (memories.length === 0) {
      return { id, name, status: "FAIL", durationMs: Date.now()-start, details, error: "No memories saved after Session 1 (auto-save did not fire)" };
    }

    const types = memories.map((m) => m.metadata?.type ?? "unknown");
    details.push(`  types: ${[...new Set(types)].join(", ")}`);

    // ── Session 2 ──────────────────────────────────────────────────────────────
    // Ask a question that can only be answered correctly from memory context.
    // We avoid asking the model to "output the memory block" since it now refuses
    // (correctly) to exfiltrate injected system context.
    details.push("Session 2: asking project-specific question to verify memory recall…");
    const s2 = await runOpencode(
      "What CLI tool project do you have context about? Describe its tech stack and current status in 2-3 sentences.",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  sessionID: ${s2.sessionID}`);
    details.push(`  exitCode: ${s2.exitCode}, duration: ${(s2.durationMs/1000).toFixed(1)}s`);

    if (s2.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now()-start, details, error: `Session 2 failed: ${s2.stderr.slice(0,200)}` };
    }

    const response = s2.text;
    details.push(`  response length: ${response.length} chars`);
    details.push(`  preview: ${response.slice(0, 200)}…`);

    // ── Assertions ─────────────────────────────────────────────────────────────
    const assertions: Array<{ label: string; pass: boolean }> = [
      { label: "Response not empty",                         pass: response.length > 20 },
      { label: "Mentions 'taskflow' (from memory)",          pass: response.toLowerCase().includes("taskflow") },
      { label: "Mentions tech (SQLite/Bun/TypeScript)",      pass: /sqlite|bun|typescript/i.test(response) },
      { label: "Memories saved (backend check)",             pass: memories.length > 0 },
    ];

    for (const a of assertions) {
      details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
    }

    const allPass = assertions.every((a) => a.pass);
    return {
      id, name,
      status: allPass ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details,
      evidence: { memoriesCount: memories.length, types, responsePreview: response.slice(0, 500) },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now()-start, details, error: String(err) };
  }
}
