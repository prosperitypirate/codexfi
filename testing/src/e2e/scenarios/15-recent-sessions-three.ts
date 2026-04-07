/**
 * Scenario 15 — Recent Sessions Shows Last 3 Summaries
 *
 * Validates the "Recent Sessions" upgrade introduced in design doc 010 (Phase 3).
 *
 * Before this change, the [MEMORY] block showed only the single most recent
 * session summary under "## Last Session". After the change it shows the last 3,
 * with progressive truncation (latest: full; 2nd: ≤600 chars; 3rd: ≤300 chars).
 *
 * Test plan:
 *   Phase 1: Seed 3 session-summary memories with distinct, identifiable facts.
 *            Each covers a different topic so the agent can distinguish them.
 *   Phase 2: Run a session — ask the agent what it knows from RECENT SESSIONS.
 *            Because all 3 summaries appear in [MEMORY], the agent should be
 *            able to reference facts from all three.
 *   Phase 3: Assert that the agent mentions facts unique to each of the 3
 *            summaries, proving all 3 were injected (not just the latest one).
 *
 * The older approach (1 session) would only surface Session C facts.
 * If even one older session fact appears, the block is working correctly.
 *
 * Summary content (distinct facts used as "fingerprints"):
 *   Session A (oldest):  refactored database layer, introduced connection pooling
 *   Session B (middle):  migrated to Next.js App Router, dropped Pages Router
 *   Session C (latest):  fixed Stripe webhook race condition, added idempotency keys
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
import { seedMemoryDirect, getMemoriesForDir } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

// Three distinct session summaries — each contains unique fingerprint terms
const SESSION_A = {
  label: "Session A (oldest) — DB refactor",
  content:
    "Previous session: Refactored the entire database layer. Replaced raw SQL " +
    "with Drizzle ORM. Introduced PgBouncer for connection pooling with a pool " +
    "size of 25. Moved all migrations from manual scripts to drizzle-kit. " +
    "Key file changed: src/db/connection.ts. All existing tests were updated " +
    "to use the new query builder API.",
  // fingerprint terms: drizzle, pgbouncer, connection pooling, drizzle-kit
  fingerprints: [/drizzle/i, /pgbouncer/i, /connection.pool/i],
};

const SESSION_B = {
  label: "Session B (middle) — App Router migration",
  content:
    "Previous session: Completed the Next.js App Router migration. Removed all " +
    "Pages Router code and getServerSideProps usage. Converted 14 pages to use " +
    "React Server Components with async/await data fetching. Updated all layouts " +
    "to use the new RootLayout pattern. The middleware.ts file was rewritten to " +
    "use the Edge Runtime matcher syntax.",
  // fingerprint terms: App Router, getServerSideProps, React Server Components, RootLayout
  fingerprints: [/app.?router/i, /getserversideprops/i, /server.?component/i, /rootlayout/i],
};

const SESSION_C = {
  label: "Session C (latest) — Stripe fix",
  content:
    "Previous session: Fixed a critical Stripe webhook race condition. The issue was " +
    "that duplicate webhook events were being processed concurrently. Added idempotency " +
    "keys stored in Redis with a 24-hour TTL to deduplicate events. The fix is in " +
    "src/api/stripe/webhook.ts. Deployed to production without downtime.",
  // fingerprint terms: stripe, webhook, idempotency, redis
  fingerprints: [/stripe/i, /idempotency/i, /webhook/i],
};

export async function run(): Promise<ScenarioResult> {
  const id = "15";
  const name = "Recent Sessions Shows Last 3 Summaries";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("recent-sessions-3");
  details.push(`test dir: ${dir}`);

  let server: ServerHandle | null = null;
  let sessionID: string | null = null;

  try {
    // ── Phase 1: Seed 3 session-summary memories with distinct content ───────
    // Insert oldest → newest so createdAt ordering is unambiguous
    details.push("Phase 1: seeding 3 session-summary memories (A → B → C)…");

    const seedA = await seedMemoryDirect(dir, SESSION_A.content, "session-summary");
    details.push(`  ${SESSION_A.label}: seeded id=${seedA.id}`);

    // Small delays to ensure distinct createdAt timestamps
    await Bun.sleep(600);

    const seedB = await seedMemoryDirect(dir, SESSION_B.content, "session-summary");
    details.push(`  ${SESSION_B.label}: seeded id=${seedB.id}`);

    await Bun.sleep(600);

    const seedC = await seedMemoryDirect(dir, SESSION_C.content, "session-summary");
    details.push(`  ${SESSION_C.label}: seeded id=${seedC.id}`);

    // Verify all 3 are in the store
    const storedMemories = await getMemoriesForDir(dir);
    const sessionSummaries = storedMemories.filter(m => m.metadata?.type === "session-summary");
    details.push(`  session-summary memories in store: ${sessionSummaries.length}`);

    if (sessionSummaries.length < 3) {
      return {
        id, name, status: "FAIL", durationMs: Date.now() - start, details,
        error: `Only ${sessionSummaries.length} session-summary memories seeded — expected 3`,
      };
    }

    // ── Phase 2: Start server and query the agent ────────────────────────────
    details.push("Phase 2: starting server, querying agent about recent sessions…");
    server = await startServer(dir, { timeoutMs: 45_000 });
    details.push(`  server ready at ${server.url}`);

    sessionID = await createSession(server, "recent-sessions-test");
    details.push(`  session: ${sessionID}`);

    const result = await sendServerMessage(
      server,
      sessionID,
      "Summarise what happened in recent sessions. What database changes were made? " +
      "What frontend framework migration was done? What API bug was fixed and how? " +
      "List key facts from each past session you can see in your memory context.",
      { timeoutMs: 120_000 },
    );

    const response = result.text;
    details.push(`  duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    details.push(`  response preview: ${response.slice(0, 400)}…`);

    // ── Phase 3: Check which session fingerprints appear in the response ─────
    details.push("Phase 3: checking session fingerprints in response…");

    const sessionAHit = SESSION_A.fingerprints.some(p => p.test(response));
    const sessionBHit = SESSION_B.fingerprints.some(p => p.test(response));
    const sessionCHit = SESSION_C.fingerprints.some(p => p.test(response));

    // Log which specific terms matched for debugging
    for (const p of SESSION_A.fingerprints) {
      if (p.test(response)) details.push(`  Session A match: ${p}`);
    }
    for (const p of SESSION_B.fingerprints) {
      if (p.test(response)) details.push(`  Session B match: ${p}`);
    }
    for (const p of SESSION_C.fingerprints) {
      if (p.test(response)) details.push(`  Session C match: ${p}`);
    }

    const sessionsReferenced = [sessionAHit, sessionBHit, sessionCHit].filter(Boolean).length;
    details.push(`  sessions referenced in response: ${sessionsReferenced}/3`);

    // ── Assertions ───────────────────────────────────────────────────────────
    const assertions: Array<{ label: string; pass: boolean }> = [
      { label: "All 3 session-summary memories saved to store",
        pass: sessionSummaries.length >= 3 },
      { label: "Response references Session C (latest — Stripe/idempotency)",
        pass: sessionCHit },
      { label: "Response references Session B (App Router migration)",
        pass: sessionBHit },
      { label: "Response references Session A (DB refactor / connection pooling)",
        pass: sessionAHit },
      { label: "All 3 past sessions surfaced (proves 3-summary block, not 1)",
        pass: sessionsReferenced === 3 },
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
        sessionSummariesInStore: sessionSummaries.length,
        sessionAHit,
        sessionBHit,
        sessionCHit,
        sessionsReferenced,
        responsePreview: response.slice(0, 800),
      },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
  } finally {
    if (sessionID && server) {
      await deleteSession(server, sessionID).catch(() => {});
    }
    if (server) {
      await stopServer(server);
      details.push("  server stopped");
    }
  }
}
