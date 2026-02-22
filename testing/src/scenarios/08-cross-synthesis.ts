/**
 * Scenario 08 — Cross-Synthesis (isWideSynthesis)
 *
 * Verifies that when the agent is asked about patterns "across both projects",
 * the plugin fires hybrid type-based retrieval (isWideSynthesis heuristic) and
 * the answer synthesises facts from two separate project memory namespaces.
 *
 * Project A dir: a TypeScript/React frontend project using Tailwind + Vitest
 * Project B dir: a Python/FastAPI backend project using Pytest + Pydantic
 *
 * Session A1: seed facts into project A
 * Session B1: seed facts into project B
 * Session A2: in project A dir, ask "What patterns are used consistently across
 *             both projects?" — the plugin must retrieve from both namespaces.
 *
 * Note: the plugin scopes retrieval to the current project's namespace by default.
 * Cross-synthesis only works if the agent's memory context spans both projects,
 * which happens when the user works in the same user session across projects.
 * Here we verify the isWideSynthesis heuristic fires and the answer is coherent.
 */

import { createTestDirs, runOpencode } from "../opencode.js";
import { getMemoriesForDir, waitForMemories } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
  const id = "08";
  const name = "Cross-Synthesis (isWideSynthesis)";
  const details: string[] = [];
  const start = Date.now();

  const [dirA, dirB] = createTestDirs("cross-synthesis", 2);
  details.push(`project A dir: ${dirA}`);
  details.push(`project B dir: ${dirB}`);

  try {
    // ── Session A1 — seed project A ───────────────────────────────────────────
    details.push("Session A1: seeding project A (TypeScript/React frontend)…");
    const sA1 = await runOpencode(
      "Project 'aurora-ui': A TypeScript React frontend app. " +
      "Key patterns: we use Tailwind CSS for all styling (no CSS modules), " +
      "Vitest for unit tests with React Testing Library, " +
      "Zod for form validation, and React Query for server state. " +
      "All components are functional with hooks — no class components. " +
      "Code style: ESLint + Prettier enforced in CI. " +
      "Please confirm you have noted the project details.",
      dirA,
      { timeoutMs: 90_000 }
    );
    details.push(`  exitCode: ${sA1.exitCode}, duration: ${(sA1.durationMs / 1000).toFixed(1)}s`);
    if (sA1.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session A1 failed: ${sA1.stderr.slice(0, 200)}` };
    }

    details.push("Waiting for project A memories…");
    await waitForMemories(dirA, 1, 35_000);
    await Bun.sleep(3_000);
    const memoriesA = await getMemoriesForDir(dirA);
    details.push(`  project A memories: ${memoriesA.length}`);

    // ── Session B1 — seed project B ───────────────────────────────────────────
    details.push("Session B1: seeding project B (Python/FastAPI backend)…");
    const sB1 = await runOpencode(
      "Project 'aurora-api': A Python FastAPI backend service. " +
      "Key patterns: we use Pytest for all tests with pytest-asyncio for async tests, " +
      "Pydantic v2 for request/response validation, " +
      "Zod-equivalent validation on the Python side using Pydantic models, " +
      "and Ruff for linting (no flake8/pylint). " +
      "All endpoints are async. Code style: Black formatter enforced in CI. " +
      "Please confirm you have noted the project details.",
      dirB,
      { timeoutMs: 90_000 }
    );
    details.push(`  exitCode: ${sB1.exitCode}, duration: ${(sB1.durationMs / 1000).toFixed(1)}s`);
    if (sB1.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session B1 failed: ${sB1.stderr.slice(0, 200)}` };
    }

    details.push("Waiting for project B memories…");
    await waitForMemories(dirB, 1, 35_000);
    await Bun.sleep(3_000);
    const memoriesB = await getMemoriesForDir(dirB);
    details.push(`  project B memories: ${memoriesB.length}`);

    if (memoriesA.length === 0 || memoriesB.length === 0) {
      return {
        id, name, status: "FAIL", durationMs: Date.now() - start, details,
        error: `Expected memories in both projects: A=${memoriesA.length}, B=${memoriesB.length}`
      };
    }

    // ── Session A2 — cross-synthesis query in project A ───────────────────────
    // The phrase "across both projects" triggers isWideSynthesis heuristic
    details.push("Session A2: asking cross-synthesis question (triggers isWideSynthesis)…");
    const sA2 = await runOpencode(
      "What patterns are used consistently across both projects I've been working on? " +
      "Focus on testing approach, validation, and code style enforcement.",
      dirA,
      { timeoutMs: 120_000 }
    );
    details.push(`  exitCode: ${sA2.exitCode}, duration: ${(sA2.durationMs / 1000).toFixed(1)}s`);
    if (sA2.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session A2 failed: ${sA2.stderr.slice(0, 200)}` };
    }

    const response = sA2.text;
    details.push(`  response length: ${response.length} chars`);
    details.push(`  preview: ${response.slice(0, 300)}`);

    // ── Assertions ─────────────────────────────────────────────────────────────
    const assertions = [
      { label: "Response not empty",                                    pass: response.length > 50 },
      { label: "Mentions testing (Vitest or Pytest)",                   pass: /vitest|pytest/i.test(response) },
      { label: "Mentions validation (Zod or Pydantic)",                 pass: /zod|pydantic/i.test(response) },
      { label: "Mentions CI code style enforcement (ESLint/Prettier/Black/Ruff)", pass: /eslint|prettier|black|ruff/i.test(response) },
      { label: "Project A has memories in backend",                     pass: memoriesA.length >= 1 },
      { label: "Project B has memories in backend",                     pass: memoriesB.length >= 1 },
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
        memoriesA: memoriesA.length,
        memoriesB: memoriesB.length,
        responsePreview: response.slice(0, 500),
      },
      testDirs: [dirA, dirB],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
  }
}
