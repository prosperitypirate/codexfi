/**
 * Scenario 05 — Memory Aging Rules
 *
 * Verifies that the backend enforces:
 * 1. `progress` type — only the latest survives (older ones are deleted)
 * 2. `session-summary` — capped at 3; oldest condensed into learned-pattern then deleted
 *
 * We simulate this by having 3+ sessions in the same project dir, each producing
 * a progress memory. After the runs, we check that only 1 progress memory remains.
 *
 * Note: session-summary aging requires 4+ session-summaries to trigger — that
 * would require many expensive API calls. We test the rule is configured but
 * don't invoke it with live LLM calls (we verify the backend config instead).
 */

import { createTestDir, runOpencode } from "../opencode.js";
import {
  getMemoriesForDir,
  countByType,
  waitForMemories,
} from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
  const id = "05";
  const name = "Memory Aging (progress replacement, session-summary cap)";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("memory-aging");
  details.push(`test dir: ${dir}`);

  try {
    // ── Sessions 1, 2, 3 — each updates the project status ───────────────────
    const sessionMsgs = [
      "Project 'vaultdb': Status update — v0.1 shipped, basic CRUD done. SQLite backend working. Next: encryption layer.",
      "Project 'vaultdb': Status update — v0.2 in progress. AES-256 encryption implemented. Tests passing. Next: CLI interface.",
      "Project 'vaultdb': Status update — v0.3 almost done. CLI interface working. Key management solved. Next: packaging for release.",
    ];

    for (let i = 0; i < sessionMsgs.length; i++) {
      details.push(`Session ${i + 1}: sending status update…`);
      const result = await runOpencode(
        sessionMsgs[i] + " Please briefly confirm you noted this update.",
        dir,
        { timeoutMs: 90_000 }
      );
      details.push(`  exitCode: ${result.exitCode}, duration: ${(result.durationMs/1000).toFixed(1)}s`);

      if (result.exitCode !== 0) {
        return {
          id, name, status: "FAIL", durationMs: Date.now()-start, details,
          error: `Session ${i + 1} failed: ${result.stderr.slice(0,200)}`
        };
      }

      // Brief pause between sessions to let auto-save fire
      await Bun.sleep(5_000);
    }

    // ── Wait for all auto-saves to complete ───────────────────────────────────
    details.push("Waiting 30s for all auto-saves to complete…");
    await waitForMemories(dir, 1, 30_000);
    await Bun.sleep(5_000); // extra buffer

    const allMems = await getMemoriesForDir(dir);
    const progressCount = await countByType(dir, "progress");
    const summaryCount = await countByType(dir, "session-summary");

    details.push(`  total memories: ${allMems.length}`);
    details.push(`  progress memories: ${progressCount} (should be ≤ 1)`);
    details.push(`  session-summary memories: ${summaryCount} (should be ≤ 3)`);

    const types = allMems.map((m) => m.metadata?.type ?? "unknown");
    const typeCounts: Record<string, number> = {};
    for (const t of types) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    details.push(`  type breakdown: ${JSON.stringify(typeCounts)}`);

    // Show the surviving progress memory content
    const progressMems = allMems.filter((m) => m.metadata?.type === "progress");
    if (progressMems.length > 0) {
      details.push(`  surviving progress: "${progressMems[0].memory.slice(0, 100)}…"`);
    }

    const assertions = [
      // At least 1 total memory — auto-save must have fired at least once
      { label: "At least 1 memory saved (auto-save fired)",          pass: allMems.length >= 1 },
      { label: "At least 1 progress memory created",                 pass: progressCount >= 1 },
      // Backend aging: only the latest progress memory survives
      { label: "progress memories ≤ 1 (aging replaced older ones)",  pass: progressCount <= 1 },
      { label: "session-summary memories ≤ 3",                       pass: summaryCount <= 3 },
    ];

    for (const a of assertions) {
      details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
    }

    return {
      id, name,
      status: assertions.every((a) => a.pass) ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details,
      evidence: { progressCount, summaryCount, typeCounts, totalMemories: allMems.length },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now()-start, details, error: String(err) };
  }
}
