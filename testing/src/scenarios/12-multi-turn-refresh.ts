/**
 * Scenario 12 — Multi-Turn Per-Turn Semantic Refresh
 *
 * The definitive test for the per-turn memory refresh feature.
 * Uses `opencode serve` to keep the plugin process alive across turns,
 * so sessionCaches persists and turns 2+ actually hit the semantic
 * refresh code path (the `else` branch in chat.message).
 *
 * Setup:
 *   - Seed 6 diverse memories directly into the backend (deterministic)
 *   - Start a persistent opencode server
 *   - Create a single session
 *
 * Multi-turn conversation (same session):
 *   Turn 1: Ask about authentication         → should recall JWT/cookie facts
 *   Turn 2: Switch to database topic          → per-turn refresh surfaces DB facts
 *   Turn 3: Switch to CI/CD topic             → refresh surfaces CI facts
 *   Turn 4: Switch to frontend topic          → refresh surfaces frontend facts
 *   Turn 5: Switch to monitoring topic        → refresh surfaces monitoring facts
 *   Turn 6: Return to authentication          → refresh re-surfaces auth facts
 *
 * This validates:
 *   - system.transform injection works on turn 1
 *   - Per-turn semantic refresh (turns 2-6) surfaces topic-relevant memories
 *   - Topic switching causes different memories to surface
 *   - Returning to a previous topic still works (turn 6 = auth again)
 *   - Session cache persists across turns (single process via serve)
 */

import {
  createTestDir,
  startServer,
  stopServer,
  createSession,
  sendServerMessage,
  deleteSession,
  type ServerHandle,
} from "../opencode.js";
import {
  addMemoryDirect,
  cleanupTestDirs,
} from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

// ── Memory seeds — 6 distinct topics ────────────────────────────────────────

const SEEDS = [
  {
    topic: "auth",
    type: "architecture" as const,
    content:
      "Authentication uses JWT tokens stored in httpOnly secure cookies. " +
      "Refresh tokens are rotated on every use with a 7-day expiry. " +
      "The auth middleware lives at src/middleware/auth.ts and validates " +
      "tokens using the jose library.",
  },
  {
    topic: "database",
    type: "tech-context" as const,
    content:
      "The database is PostgreSQL 15 running on RDS. We use Drizzle ORM " +
      "for type-safe queries. Connection pooling goes through PgBouncer " +
      "with a pool size of 20. Migrations live in db/migrations/ and are " +
      "applied via drizzle-kit push.",
  },
  {
    topic: "ci",
    type: "architecture" as const,
    content:
      "CI/CD uses GitHub Actions with self-hosted runners on GCP. " +
      "Docker images are built with multi-stage Dockerfiles and pushed " +
      "to Artifact Registry. Deployments go through ArgoCD with " +
      "automatic canary analysis before promoting to production.",
  },
  {
    topic: "frontend",
    type: "tech-context" as const,
    content:
      "The frontend is Next.js 14 with App Router. Styling uses Tailwind CSS " +
      "with shadcn/ui components. State management is Zustand for client state " +
      "and TanStack Query for server state. The app is deployed on Vercel " +
      "with ISR for dynamic pages.",
  },
  {
    topic: "monitoring",
    type: "architecture" as const,
    content:
      "Monitoring uses Datadog APM for distributed tracing. Custom metrics " +
      "are emitted via StatsD. Alerts are routed to PagerDuty with " +
      "escalation policies. SLOs are set at 99.9% for the API and 99.5% " +
      "for background jobs. Logs go to Datadog Logs via the dd-agent.",
  },
  {
    topic: "api",
    type: "architecture" as const,
    content:
      "The REST API follows JSON:API spec with versioning via URL prefix " +
      "(v1, v2). Rate limiting uses a sliding window counter in Redis " +
      "with 100 req/min per API key. OpenAPI specs are auto-generated " +
      "from Zod schemas using zod-to-openapi.",
  },
];

// ── Turn definitions — each turn queries a different topic ──────────────────

interface TurnDef {
  topic: string;
  prompt: string;
  /** Regex patterns that should match in the response (any one = pass) */
  patterns: RegExp[];
  label: string;
}

const TURNS: TurnDef[] = [
  {
    topic: "auth",
    prompt:
      "What authentication approach does this project use? " +
      "Describe the token strategy and middleware from your memory context.",
    patterns: [/jwt/i, /httponly/i, /cookie/i, /jose/i, /auth\.ts/i],
    label: "Turn 1 (auth): recalls JWT/cookie details",
  },
  {
    topic: "database",
    prompt:
      "Now tell me about the database setup. What ORM and database " +
      "engine does this project use? Describe from your memory context.",
    patterns: [/postgres/i, /drizzle/i, /pgbouncer/i, /rds/i, /migration/i],
    label: "Turn 2 (DB): per-turn refresh surfaces PostgreSQL/Drizzle",
  },
  {
    topic: "ci",
    prompt:
      "Switch topic: what CI/CD pipeline does this project use? " +
      "How are builds and deployments handled? Use your memory context.",
    patterns: [/github\s*actions/i, /argocd/i, /docker/i, /canary/i, /artifact/i],
    label: "Turn 3 (CI): per-turn refresh surfaces GitHub Actions/ArgoCD",
  },
  {
    topic: "frontend",
    prompt:
      "Now the frontend. What framework and styling approach is used? " +
      "Describe the component library and state management from memory.",
    patterns: [/next\.?js/i, /tailwind/i, /shadcn/i, /zustand/i, /tanstack/i, /vercel/i],
    label: "Turn 4 (frontend): per-turn refresh surfaces Next.js/Tailwind",
  },
  {
    topic: "monitoring",
    prompt:
      "What monitoring and observability stack does this project use? " +
      "Describe tracing, metrics, and alerting from your memory context.",
    patterns: [/datadog/i, /statsd/i, /pagerduty/i, /slo/i, /apm/i, /tracing/i],
    label: "Turn 5 (monitoring): per-turn refresh surfaces Datadog/PagerDuty",
  },
  {
    topic: "auth",
    prompt:
      "Let's circle back to authentication. Remind me — what token " +
      "strategy and expiry is used? Answer from memory context.",
    patterns: [/jwt/i, /cookie/i, /7[- ]?day/i, /refresh/i, /rotate/i],
    label: "Turn 6 (auth again): re-surfaces auth after topic switches",
  },
];

// ── Scenario entry point ────────────────────────────────────────────────────

export async function run(): Promise<ScenarioResult> {
  const id = "12";
  const name = "Multi-Turn Per-Turn Semantic Refresh";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("multi-turn-refresh");
  details.push(`test dir: ${dir}`);

  let server: ServerHandle | null = null;
  let sessionID: string | null = null;

  try {
    // ── Phase 1: Seed memories directly into backend ──────────────────────
    details.push("Phase 1: seeding 6 topic memories directly into backend…");
    let totalSeeded = 0;
    for (const seed of SEEDS) {
      const results = await addMemoryDirect(dir, seed.content, seed.type);
      totalSeeded += results.length;
      details.push(`  [${seed.topic}] seeded ${results.length} memories (type: ${seed.type})`);
    }
    details.push(`  total memories seeded: ${totalSeeded}`);

    if (totalSeeded < 4) {
      return {
        id, name, status: "FAIL", durationMs: Date.now() - start, details,
        error: `Only ${totalSeeded} memories seeded — expected at least 4`,
      };
    }

    // ── Phase 2: Start persistent server ──────────────────────────────────
    details.push("Phase 2: starting opencode serve…");
    server = await startServer(dir, { timeoutMs: 45_000 });
    details.push(`  server ready at ${server.url}`);

    // ── Phase 3: Create session ───────────────────────────────────────────
    sessionID = await createSession(server, "multi-turn-refresh-test");
    details.push(`  session created: ${sessionID}`);

    // ── Phase 4: Multi-turn conversation ──────────────────────────────────
    details.push("Phase 3: multi-turn conversation (6 turns, same session)…");

    const assertions: Array<{ label: string; pass: boolean }> = [
      { label: "Memories seeded to backend (>= 4)", pass: totalSeeded >= 4 },
    ];

    const turnResponses: string[] = [];

    for (let i = 0; i < TURNS.length; i++) {
      const turn = TURNS[i];
      details.push(`  Turn ${i + 1} [${turn.topic}]…`);

      const result = await sendServerMessage(
        server,
        sessionID,
        turn.prompt,
        { timeoutMs: 120_000 }
      );

      const response = result.text;
      turnResponses.push(response);
      details.push(`    duration: ${(result.durationMs / 1000).toFixed(1)}s`);
      details.push(`    response preview: ${response.slice(0, 150)}…`);

      // Check if any pattern matches
      const matched = turn.patterns.some((p) => p.test(response));
      assertions.push({ label: turn.label, pass: matched });
      details.push(`    [${matched ? "✓" : "✗"}] ${turn.label}`);
    }

    // ── Phase 5: Cross-turn isolation check ───────────────────────────────
    // Turn 2 (DB) should NOT heavily reference auth terms, proving refresh
    // actually changed the "Relevant to Current Task" section.
    const dbResponse = turnResponses[1] ?? "";
    const ciResponse = turnResponses[2] ?? "";
    // If the DB response is dominated by auth terms, the refresh didn't work
    const authTermsInDb = (dbResponse.match(/jwt|httponly|cookie/gi) ?? []).length;
    const dbTermsInDb = (dbResponse.match(/postgres|drizzle|pgbouncer|rds|migration/gi) ?? []).length;
    const dbNotDominatedByAuth = dbTermsInDb >= authTermsInDb;
    assertions.push({
      label: "Turn 2 (DB) has more DB terms than auth terms (isolation)",
      pass: dbNotDominatedByAuth,
    });
    details.push(`  DB isolation: DB terms=${dbTermsInDb}, auth terms=${authTermsInDb} → ${dbNotDominatedByAuth ? "✓" : "✗"}`);

    // Same check: CI response should have more CI terms than DB terms
    const dbTermsInCi = (ciResponse.match(/postgres|drizzle|pgbouncer|rds/gi) ?? []).length;
    const ciTermsInCi = (ciResponse.match(/github.actions|argocd|docker|canary|artifact/gi) ?? []).length;
    const ciNotDominatedByDb = ciTermsInCi >= dbTermsInCi;
    assertions.push({
      label: "Turn 3 (CI) has more CI terms than DB terms (isolation)",
      pass: ciNotDominatedByDb,
    });
    details.push(`  CI isolation: CI terms=${ciTermsInCi}, DB terms=${dbTermsInCi} → ${ciNotDominatedByDb ? "✓" : "✗"}`);

    // ── Assertion summary ─────────────────────────────────────────────────
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
        memoriesSeeded: totalSeeded,
        turnsCompleted: turnResponses.length,
        turnPreviews: turnResponses.map((r, i) => ({
          turn: i + 1,
          topic: TURNS[i].topic,
          preview: r.slice(0, 300),
        })),
      },
      testDirs: [dir],
    };
  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────
    if (sessionID && server) {
      await deleteSession(server, sessionID).catch(() => {});
    }
    if (server) {
      await stopServer(server);
      details.push(`  server stopped`);
    }
  }
}
