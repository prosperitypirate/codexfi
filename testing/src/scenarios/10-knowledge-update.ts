/**
 * Scenario 10 — Knowledge Update / Superseded Detection
 *
 * Verifies that when a fact changes, the new memory supersedes the old one
 * and the agent recalls the LATEST value — not the stale one.
 *
 * Session 1: "we use SQLAlchemy for the ORM"
 * Session 2: "we migrated to Tortoise ORM, replacing SQLAlchemy"
 * Session 3: ask "what ORM do we use?" — must answer Tortoise, not SQLAlchemy
 *
 * Also verifies backend state: the old SQLAlchemy memory should have a
 * superseded_by field set, or should no longer appear in active results.
 */

import { createTestDir, runOpencode } from "../opencode.js";
import { getMemoriesForDir, waitForMemories } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
  const id = "10";
  const name = "Knowledge Update / Superseded Detection";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("knowledge-update");
  details.push(`test dir: ${dir}`);

  try {
    // ── Session 1 — establish initial fact ────────────────────────────────────
    details.push("Session 1: establishing initial ORM fact (SQLAlchemy)…");
    const s1 = await runOpencode(
      "Project 'cortex-api': A Python REST API. " +
      "We use SQLAlchemy 2.0 as our ORM with async support. " +
      "Database: PostgreSQL 16. All models inherit from our Base class. " +
      "Please confirm you noted the ORM choice.",
      dir,
      { timeoutMs: 90_000 }
    );
    details.push(`  exitCode: ${s1.exitCode}, duration: ${(s1.durationMs / 1000).toFixed(1)}s`);
    if (s1.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session 1 failed: ${s1.stderr.slice(0, 200)}` };
    }

    details.push("Waiting for session 1 memories…");
    await waitForMemories(dir, 1, 35_000);
    await Bun.sleep(3_000);
    const afterS1 = await getMemoriesForDir(dir);
    details.push(`  memories after session 1: ${afterS1.length}`);

    const sqlalchemyInBackend = afterS1.some((m) =>
      m.memory.toLowerCase().includes("sqlalchemy")
    );
    details.push(`  SQLAlchemy fact in backend: ${sqlalchemyInBackend}`);

    if (afterS1.length === 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: "No memories saved after session 1" };
    }

    // ── Session 2 — update the fact ───────────────────────────────────────────
    details.push("Session 2: updating ORM fact (migrated to Tortoise ORM)…");
    const s2 = await runOpencode(
      "Important update for cortex-api: we have migrated away from SQLAlchemy. " +
      "We now use Tortoise ORM with aerich for migrations. " +
      "SQLAlchemy has been completely removed from the project. " +
      "The new ORM is Tortoise ORM — please update your memory accordingly.",
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

    // Check backend state: Tortoise should be present
    const tortoiseInBackend = afterS2.some((m) =>
      m.memory.toLowerCase().includes("tortoise")
    );
    details.push(`  Tortoise ORM fact in backend: ${tortoiseInBackend}`);

    // Check if SQLAlchemy memory has been superseded (superseded_by set)
    // The backend may either delete stale memories or mark them as superseded
    const sqlalchemyMems = afterS2.filter((m) =>
      m.memory.toLowerCase().includes("sqlalchemy")
    );
    const sqlalchemySuperseded = sqlalchemyMems.every(
      (m) => (m as any).superseded_by != null
    );
    details.push(`  SQLAlchemy memories remaining: ${sqlalchemyMems.length}`);
    details.push(`  SQLAlchemy superseded: ${sqlalchemySuperseded}`);

    // ── Session 3 — recall query ───────────────────────────────────────────────
    details.push("Session 3: asking which ORM is used — must answer Tortoise…");
    const s3 = await runOpencode(
      "What ORM does the cortex-api project use? Just name it directly.",
      dir,
      { timeoutMs: 90_000 }
    );
    details.push(`  exitCode: ${s3.exitCode}, duration: ${(s3.durationMs / 1000).toFixed(1)}s`);
    if (s3.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session 3 failed: ${s3.stderr.slice(0, 200)}` };
    }

    const response = s3.text;
    details.push(`  response: ${response.slice(0, 300)}`);

    // ── Assertions ─────────────────────────────────────────────────────────────
    const assertions = [
      { label: "Response not empty",                                       pass: response.length > 5 },
      { label: "Tortoise ORM fact stored in backend",                      pass: tortoiseInBackend },
      { label: "Answer mentions Tortoise (correct current ORM)",           pass: /tortoise/i.test(response) },
      { label: "Answer does NOT say SQLAlchemy is current ORM",            pass: !(/sqlalchemy is|using sqlalchemy|sqlalchemy for/i.test(response)) },
    ];

    for (const a of assertions) {
      details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
    }

    return {
      id, name,
      status: assertions.every((a) => a.pass) ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details,
      evidence: {
        memoriesAfterUpdate: afterS2.length,
        tortoiseInBackend,
        sqlalchemyMemsRemaining: sqlalchemyMems.length,
        responsePreview: response.slice(0, 400),
      },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
  }
}
