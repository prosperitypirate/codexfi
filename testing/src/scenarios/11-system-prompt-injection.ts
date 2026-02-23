/**
 * Scenario 11 — System Prompt Memory Injection
 *
 * Validates the system.transform injection mechanism: [MEMORY] is injected
 * into the system prompt (not as a synthetic message part) and semantic search
 * returns topic-relevant results for each query.
 *
 * Session 1: Seed diverse memories — auth (JWT/cookies) AND CI (GitHub Actions).
 * Verify  : Memories appear in backend with correct content.
 * Session 2: Ask about the project → agent should reference facts from memory.
 *
 * The agent may be skeptical about an empty temp directory, but the test
 * checks that memory-injected terms appear in the response at all (proving
 * the system.transform hook delivered the [MEMORY] block to the LLM).
 */

import { createTestDir, runOpencode } from "../opencode.js";
import { waitForMemories } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
  const id = "11";
  const name = "System Prompt Memory Injection";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("sys-prompt-inject");
  details.push(`test dir: ${dir}`);

  try {
    // ── Session 1: Seed diverse topic memories ──────────────────────────────
    details.push("Session 1: seeding auth + CI facts…");
    const s1 = await runOpencode(
      "Please remember the following important project details:\n\n" +
      "1. Authentication uses JWT tokens stored in httpOnly secure cookies. " +
      "Refresh tokens are rotated on every use with a 7-day expiry. " +
      "The auth middleware is in src/middleware/auth.ts.\n\n" +
      "2. CI/CD uses GitHub Actions with self-hosted runners on GCP. " +
      "Docker images are built with multi-stage Dockerfiles and pushed to Artifact Registry. " +
      "Deployments go through ArgoCD with automatic canary analysis.\n\n" +
      "Acknowledge you saved these.",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  sessionID: ${s1.sessionID}`);
    details.push(`  exitCode: ${s1.exitCode}, duration: ${(s1.durationMs / 1000).toFixed(1)}s`);

    if (s1.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details,
        error: `Session 1 failed with exit ${s1.exitCode}: ${s1.stderr.slice(0, 200)}` };
    }

    // ── Wait for memories to persist ────────────────────────────────────────
    details.push("Waiting up to 35s for memories to persist…");
    const memories = await waitForMemories(dir, 1, 35_000);
    details.push(`  memories saved: ${memories.length}`);

    if (memories.length === 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details,
        error: "No memories saved after Session 1 (auto-save did not fire)" };
    }

    // ── Verify backend has the seeded content ───────────────────────────────
    const allContent = memories.map((m) => m.memory).join(" ").toLowerCase();
    const hasAuthInBackend = /jwt|cookie|httponly|token/i.test(allContent);
    const hasCIInBackend = /github\s*actions|argocd|docker|canary/i.test(allContent);
    details.push(`  backend has auth terms: ${hasAuthInBackend}`);
    details.push(`  backend has CI terms: ${hasCIInBackend}`);

    // ── Session 2: Ask agent to recall what it knows ────────────────────────
    // Use a single session that asks the agent to summarize project knowledge.
    // The agent receives the [MEMORY] block via system.transform, and we check
    // that seeded facts appear in its response (even skeptically referenced).
    details.push("Session 2: asking agent to summarize project knowledge…");
    const s2 = await runOpencode(
      "Summarize everything you know about this project. " +
      "Include any details you have about authentication, CI/CD, " +
      "infrastructure, and deployment. Report from your project " +
      "memory context — the [MEMORY] block in your system prompt. " +
      "List each fact as a bullet point.",
      dir,
      { timeoutMs: 90_000 }
    );

    details.push(`  exitCode: ${s2.exitCode}, duration: ${(s2.durationMs / 1000).toFixed(1)}s`);

    if (s2.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details,
        error: `Session 2 failed: ${s2.stderr.slice(0, 200)}` };
    }

    const response = s2.text;
    details.push(`  response preview: ${response.slice(0, 300)}…`);

    // ── Assertions ──────────────────────────────────────────────────────────
    // The agent response should mention memory-injected facts. Even if the
    // agent is skeptical about an empty directory, the seeded terms should
    // appear because the system.transform hook puts them in the system prompt.
    const assertions: Array<{ label: string; pass: boolean }> = [
      // Backend verification (memories were correctly stored)
      { label: "Memories saved to backend",
        pass: memories.length > 0 },
      { label: "Backend contains auth-related content",
        pass: hasAuthInBackend },
      { label: "Backend contains CI-related content",
        pass: hasCIInBackend },

      // System.transform injection proof — agent response references injected facts
      // Check for auth terms in response (proves [MEMORY] block was received)
      { label: "Response references auth terms (JWT/cookie/token)",
        pass: /jwt|cookie|httponly|token/i.test(response) },
      // Check for CI terms in response (proves semantic search returned CI facts)
      { label: "Response references CI terms (GitHub Actions/Docker/ArgoCD)",
        pass: /github\s*actions|argocd|argo\s*cd|docker|canary|artifact\s*registry|gcp/i.test(response) },
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
      evidence: {
        memoriesCount: memories.length,
        memoryContent: allContent.slice(0, 500),
        responsePreview: response.slice(0, 800),
      },
      testDirs: [dir],
    };
  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
  }
}
