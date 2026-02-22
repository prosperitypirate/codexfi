/**
 * Scenario 02 — README-based project-brief seeding
 *
 * Creates a project dir with a README.md, starts a session, and verifies that:
 * 1. seedProjectBrief() fires (a project-brief memory is created)
 * 2. Session 2 shows ## Project Brief in the [MEMORY] block
 */

import { createTestDir, runOpencode } from "../opencode.js";
import { getMemoriesForDir, waitForMemories, countByType } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

const README = `# Nexus
A graph-based knowledge management system built with TypeScript and Neo4j.
Nodes represent concepts; edges represent relationships.
Features: full-text search, auto-tagging, Markdown export.

## Tech Stack
- Runtime: Node.js 20
- Database: Neo4j 5
- API: Fastify + GraphQL
- Auth: JWT via Redis session store
`;

export async function run(): Promise<ScenarioResult> {
  const id = "02";
  const name = "README-Based Project-Brief Seeding";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("readme-seeding");
  details.push(`test dir: ${dir}`);

  try {
    // ── Session 1 with README present ─────────────────────────────────────────
    details.push("Session 1: starting with README.md in place…");
    const s1 = await runOpencode(
      "Hello. What is this project about based on the README?",
      dir,
      { readme: README, timeoutMs: 90_000 }
    );

    details.push(`  exitCode: ${s1.exitCode}, duration: ${(s1.durationMs/1000).toFixed(1)}s`);

    if (s1.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now()-start, details, error: `Session 1 failed: ${s1.stderr.slice(0,200)}` };
    }

    // ── Wait for memories incl. project-brief ─────────────────────────────────
    details.push("Waiting up to 35s for project-brief memory…");
    await waitForMemories(dir, 1, 35_000);
    const allMems = await getMemoriesForDir(dir);
    const briefCount = await countByType(dir, "project-brief");

    details.push(`  total memories: ${allMems.length}`);
    details.push(`  project-brief count: ${briefCount}`);

    if (briefCount === 0) {
      // Might still be seeding — wait a bit more
      await Bun.sleep(5_000);
      const briefCount2 = await countByType(dir, "project-brief");
      details.push(`  project-brief count (after extra wait): ${briefCount2}`);
      if (briefCount2 === 0) {
        return {
          id, name, status: "FAIL", durationMs: Date.now()-start, details,
          error: "No project-brief memory created even with README present"
        };
      }
    }

    // ── Session 2: verify memory recall from README content ──────────────────
    // Ask a question that can only be answered from the seeded project-brief memory.
    details.push("Session 2: asking about Nexus project to verify README-seeded memory…");
    const s2 = await runOpencode(
      "What project do you have context about? What is its database and API layer?",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  exitCode: ${s2.exitCode}, duration: ${(s2.durationMs/1000).toFixed(1)}s`);

    if (s2.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now()-start, details, error: `Session 2 failed: ${s2.stderr.slice(0,200)}` };
    }

    const response = s2.text;
    details.push(`  response length: ${response.length} chars`);
    details.push(`  preview: ${response.slice(0, 200)}`);

    const assertions = [
      { label: "project-brief in backend",                     pass: briefCount > 0 },
      { label: "Response mentions 'Nexus'",                    pass: response.toLowerCase().includes("nexus") },
      { label: "Response mentions database tech (Neo4j/Redis)", pass: /neo4j|redis|graph/i.test(response) },
    ];

    for (const a of assertions) {
      details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
    }

    return {
      id, name,
      status: assertions.every((a) => a.pass) ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details,
      evidence: { briefCount, responsePreview: response.slice(0, 500) },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now()-start, details, error: String(err) };
  }
}
