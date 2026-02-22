/**
 * Scenario 07 — Enumeration Hybrid Retrieval
 *
 * Verifies that the plugin fires hybrid type-based retrieval (types[] param) for
 * enumeration queries ("list all developer preferences") and that the answer
 * covers preferences seeded across multiple separate sessions — not just the
 * most recent one.
 *
 * Session 1: seed 3 distinct developer preferences across a multi-turn message
 * Session 2: seed 2 more distinct preferences
 * Session 3: "List ALL the developer preferences we have established" —
 *            assert that preferences from BOTH sessions appear in the answer
 */

import { createTestDir, runOpencode } from "../opencode.js";
import { getMemoriesForDir, waitForMemories } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
  const id = "07";
  const name = "Enumeration Hybrid Retrieval";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("enumeration-retrieval");
  details.push(`test dir: ${dir}`);

  try {
    // ── Session 1 — seed preferences batch A ──────────────────────────────────
    details.push("Session 1: seeding preferences batch A (3 preferences)…");
    const s1 = await runOpencode(
      "Please note these developer preferences for our project: " +
      "(1) We always use tabs for indentation, never spaces. " +
      "(2) All async functions must have explicit return types in TypeScript. " +
      "(3) We prefer Zod for runtime validation over Joi or Yup. " +
      "Please confirm you've noted all three preferences.",
      dir,
      { timeoutMs: 90_000 }
    );
    details.push(`  exitCode: ${s1.exitCode}, duration: ${(s1.durationMs / 1000).toFixed(1)}s`);
    if (s1.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session 1 failed: ${s1.stderr.slice(0, 200)}` };
    }

    // Wait for auto-save
    details.push("Waiting for session 1 memories…");
    await waitForMemories(dir, 1, 35_000);
    await Bun.sleep(3_000);
    const afterS1 = await getMemoriesForDir(dir);
    details.push(`  memories after session 1: ${afterS1.length}`);

    // ── Session 2 — seed preferences batch B ──────────────────────────────────
    details.push("Session 2: seeding preferences batch B (2 more preferences)…");
    const s2 = await runOpencode(
      "Two more developer preferences to record: " +
      "(1) We use pnpm as our package manager, not npm or yarn. " +
      "(2) All database queries must use parameterised statements — no string interpolation. " +
      "Please confirm you've noted these.",
      dir,
      { timeoutMs: 90_000 }
    );
    details.push(`  exitCode: ${s2.exitCode}, duration: ${(s2.durationMs / 1000).toFixed(1)}s`);
    if (s2.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session 2 failed: ${s2.stderr.slice(0, 200)}` };
    }

    details.push("Waiting for session 2 memories…");
    await waitForMemories(dir, afterS1.length + 1, 35_000);
    await Bun.sleep(3_000);
    const afterS2 = await getMemoriesForDir(dir);
    details.push(`  memories after session 2: ${afterS2.length}`);

    if (afterS2.length < 2) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Expected preferences in backend, only got ${afterS2.length} total memories` };
    }

    // ── Session 3 — enumeration query ─────────────────────────────────────────
    details.push("Session 3: asking enumeration query to trigger hybrid retrieval…");
    const s3 = await runOpencode(
      "List ALL the developer preferences we have established for this project. " +
      "Include every preference you have in memory.",
      dir,
      { timeoutMs: 120_000 }
    );
    details.push(`  exitCode: ${s3.exitCode}, duration: ${(s3.durationMs / 1000).toFixed(1)}s`);
    if (s3.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session 3 failed: ${s3.stderr.slice(0, 200)}` };
    }

    const response = s3.text.toLowerCase();
    details.push(`  response length: ${s3.text.length} chars`);
    details.push(`  preview: ${s3.text.slice(0, 300)}`);

    // ── Assertions ─────────────────────────────────────────────────────────────
    // Must recall from BOTH sessions — that's what hybrid enumeration is for
    const assertions = [
      { label: "Response not empty",                                      pass: s3.text.length > 50 },
      { label: "Recalls tabs preference (session 1)",                     pass: /tab/i.test(response) },
      { label: "Recalls Zod preference (session 1)",                      pass: /zod/i.test(response) },
      { label: "Recalls pnpm preference (session 2)",                     pass: /pnpm/i.test(response) },
      { label: "Recalls parameterised queries preference (session 2)",    pass: /paramteri|parameteris|parameteriz|paramtri|prepared|string interp/i.test(response) },
      { label: "At least 2 memories in backend",                          pass: afterS2.length >= 2 },
    ];

    for (const a of assertions) {
      details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
    }

    return {
      id, name,
      status: assertions.every((a) => a.pass) ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details,
      evidence: { memoriesCount: afterS2.length, responsePreview: s3.text.slice(0, 500) },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
  }
}
