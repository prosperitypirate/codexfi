/**
 * Scenario 14 — Active-Context Singleton Aging
 *
 * Validates the new `active-context` memory type introduced in design doc 010.
 *
 * The type is a singleton: when a new `active-context` memory is inserted,
 * all older ones for that project are deleted — only the latest survives.
 * This keeps the [MEMORY] block's "## Active Context" section current and
 * prevents stale implementation notes from accumulating.
 *
 * Test plan:
 *   Phase 1: Seed OLD active-context — "working on login page (feature/login)"
 *   Phase 2: Seed NEW active-context — "working on payments module (feature/payments)"
 *            Aging should fire and delete the old entry.
 *   Phase 3: Start a server session, ask about current focus.
 *            Agent should reference the PAYMENTS context, not the login page.
 *   Phase 4: Direct store check — exactly 1 active-context memory survives.
 *
 * This validates both the store-level aging rule AND the [MEMORY] block injection,
 * proving the agent only sees the current implementation focus.
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
  getMemoriesForDir,
} from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
  const id = "14";
  const name = "Active-Context Singleton Aging";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("active-ctx-singleton");
  details.push(`test dir: ${dir}`);

  let server: ServerHandle | null = null;
  let sessionID: string | null = null;

  try {
    // ── Phase 1: Seed OLD active-context ────────────────────────────────────
    details.push("Phase 1: seeding OLD active-context (login page)…");
    const oldResults = await addMemoryDirect(
      dir,
      "Currently implementing the login page on branch feature/login. " +
      "Working on form validation with zod and React Hook Form. " +
      "The submit handler is in src/components/LoginForm.tsx.",
      "active-context",
    );
    details.push(`  seeded ${oldResults.length} memory/memories`);
    const oldId = oldResults[0]?.id;
    details.push(`  old active-context id: ${oldId}`);

    // Verify old entry is in store
    const afterOld = await getMemoriesForDir(dir);
    const oldCount = afterOld.filter(m => m.metadata?.type === "active-context").length;
    details.push(`  active-context count after old seed: ${oldCount}`);

    // ── Phase 2: Seed NEW active-context — aging should fire ────────────────
    details.push("Phase 2: seeding NEW active-context (payments module)…");
    // Small delay to ensure different createdAt timestamps
    await Bun.sleep(500);
    const newResults = await addMemoryDirect(
      dir,
      "Currently implementing the payments module on branch feature/payments. " +
      "Integrating Stripe webhooks for subscription events. " +
      "The webhook handler is in src/api/stripe/webhook.ts.",
      "active-context",
    );
    details.push(`  seeded ${newResults.length} memory/memories`);
    const newId = newResults[0]?.id;
    details.push(`  new active-context id: ${newId}`);

    // Small wait for aging to complete (it's async within ingest)
    await Bun.sleep(1000);

    // ── Phase 3: Store check — only 1 active-context should survive ─────────
    details.push("Phase 3: verifying singleton aging in store…");
    const afterNew = await getMemoriesForDir(dir);
    const activeContextMemories = afterNew.filter(m => m.metadata?.type === "active-context");
    details.push(`  active-context memories remaining: ${activeContextMemories.length}`);
    for (const m of activeContextMemories) {
      details.push(`  - id=${m.id} | "${m.memory.slice(0, 80)}"`);
    }

    const onlyOneRemains = activeContextMemories.length === 1;
    const latestSurvived = activeContextMemories[0]?.id === newId;
    const oldWasDeleted = !activeContextMemories.some(m => m.id === oldId);

    // ── Phase 4: Start server and ask agent about current focus ─────────────
    details.push("Phase 4: starting server and asking agent about current focus…");
    server = await startServer(dir, { timeoutMs: 45_000 });
    details.push(`  server ready at ${server.url}`);

    sessionID = await createSession(server, "active-context-test");
    details.push(`  session: ${sessionID}`);

    const result = await sendServerMessage(
      server,
      sessionID,
      "What am I currently working on? What branch am I on and what file is the key implementation in? " +
      "Answer from your memory context — specifically the Active Context section.",
      { timeoutMs: 90_000 },
    );

    const response = result.text;
    details.push(`  duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    details.push(`  response preview: ${response.slice(0, 300)}…`);

    // Agent should reference payments/Stripe (new) NOT login page (old)
    const referencesPayments = /payment|stripe|webhook|subscription/i.test(response);
    const referencesNewBranch = /feature\/payments|payments/i.test(response);
    const doesNotReferenceLogin = !/login.?form|LoginForm|feature\/login/i.test(response);

    // ── Assertions ───────────────────────────────────────────────────────────
    const assertions: Array<{ label: string; pass: boolean }> = [
      { label: "Old active-context was seeded successfully",
        pass: !!oldId },
      { label: "New active-context was seeded successfully",
        pass: !!newId },
      { label: "Singleton aging: exactly 1 active-context survives",
        pass: onlyOneRemains },
      { label: "Singleton aging: the LATEST entry survived (not the old one)",
        pass: latestSurvived },
      { label: "Singleton aging: old entry was deleted from store",
        pass: oldWasDeleted },
      { label: "Agent response references payments context (new active-context injected)",
        pass: referencesPayments },
      { label: "Agent response references the payments branch",
        pass: referencesNewBranch },
      { label: "Agent does NOT reference stale login page context",
        pass: doesNotReferenceLogin },
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
        oldId,
        newId,
        activeContextCount: activeContextMemories.length,
        latestSurvived,
        responsePreview: response.slice(0, 600),
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
