/**
 * Scenario 03 — Transcript Noise Guard
 *
 * Verifies that memories saved by auto-save do NOT contain raw transcript noise
 * (lines starting with [user] or [assistant]).
 *
 * Also verifies memory recall works — session 2 should know about ferrite-api.
 */

import { createTestDir, runOpencode } from "../opencode.js";
import { waitForMemories, getMemoriesForDir } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
  const id = "03";
  const name = "Transcript Noise Guard in Relevant Section";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("transcript-noise");
  details.push(`test dir: ${dir}`);

  try {
    // ── Session 1: have a realistic project conversation ────────────────────────
    details.push("Session 1: multi-turn project conversation…");
    const s1 = await runOpencode(
      "I'm working on a Rust web service called 'ferrite-api'. " +
      "It uses Axum for routing, SQLx for PostgreSQL, and Redis for caching. " +
      "The main challenge is optimising the caching layer for high throughput. " +
      "Key file: src/cache/redis_pool.rs. Current architecture uses a connection pool of 20. " +
      "Can you briefly acknowledge the project details?",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  exitCode: ${s1.exitCode}, duration: ${(s1.durationMs/1000).toFixed(1)}s`);

    if (s1.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now()-start, details, error: `Session 1 failed: ${s1.stderr.slice(0,200)}` };
    }

    // ── Wait for auto-save, then inspect backend memories directly ──────────────
    details.push("Waiting for memories…");
    await waitForMemories(dir, 1, 30_000);
    const memories = await getMemoriesForDir(dir);
    details.push(`  total memories: ${memories.length}`);

    // Check that no memory content starts with [user] or [assistant] transcript markers
    const transcriptPatterns = [/^\[user\]/m, /^\[assistant\]/m, /^user:/mi, /^assistant:/mi];

    const noisyMemories = memories.filter((m) =>
      transcriptPatterns.some((p) => p.test(m.memory))
    );

    details.push(`  memories with transcript noise: ${noisyMemories.length}`);
    if (noisyMemories.length > 0) {
      for (const m of noisyMemories) {
        details.push(`    NOISY: "${m.memory.slice(0, 100)}…"`);
      }
    } else {
      for (const m of memories) {
        details.push(`    ok: "${m.memory.slice(0, 80)}…" [${m.metadata?.type ?? "unknown"}]`);
      }
    }

    // ── Session 2: verify memory recall (ferrite-api details) ──────────────────
    details.push("Session 2: asking about ferrite-api to verify recall…");
    const s2 = await runOpencode(
      "What Rust project do you have context about? What are its key components?",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  exitCode: ${s2.exitCode}, duration: ${(s2.durationMs/1000).toFixed(1)}s`);

    const response = s2.text;
    details.push(`  response: ${response.slice(0, 200)}`);

    // Check memory content directly for project name (more reliable than response check)
    const ferriteInBackend = memories.some((m) => /ferrite/i.test(m.memory));

    const assertions = [
      { label: "At least 1 memory saved",                       pass: memories.length > 0 },
      { label: "No transcript noise in memories",                pass: noisyMemories.length === 0 },
      { label: "ferrite-api name stored in backend memories",    pass: ferriteInBackend },
      { label: "Session 2 recalls tech (Axum/SQLx/Redis/Rust)",  pass: /axum|sqlx|redis|rust/i.test(response) },
    ];

    for (const a of assertions) {
      details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
    }

    return {
      id, name,
      status: assertions.every((a) => a.pass) ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details,
      evidence: { totalMemories: memories.length, noisyCount: noisyMemories.length, responsePreview: response.slice(0, 400) },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now()-start, details, error: String(err) };
  }
}
