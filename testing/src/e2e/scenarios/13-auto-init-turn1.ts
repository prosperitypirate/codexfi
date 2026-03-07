/**
 * Scenario 13 — Auto-Init Turn 1 Visibility + Enrichment
 *
 * The critical scenario that validates the complete auto-init fix:
 * - Bug 1: Auto-init uses init mode (correct extraction type assignments)
 * - Bug 2: Re-fetch after auto-init makes memories visible on Turn 1
 * - Phase 3: Background enrichment fires after Turn 1 response
 *
 * Creates a fake project ("widget-factory") with identifiable content,
 * asks a question on Turn 1, and asserts:
 *   1. Agent knows project name from auto-init
 *   2. Agent knows test command from auto-init
 *   3. project-brief memory exists in DB
 *   4. tech-context or architecture memory exists
 *   5. Background enrichment adds more memories
 *   6. Log-based: init mode used
 *   7. Log-based: re-fetch after auto-init
 *   8. Log-based: [MEMORY] injected on Turn 1
 *   9. Log-based: background enrichment completed
 */

import { createTestDir, runOpencode, getServerLogs } from "../opencode.js";
import { waitForMemories, getMemoriesForDir } from "../memory-api.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { ScenarioResult } from "../report.js";

export async function run(): Promise<ScenarioResult> {
	const id = "13";
	const name = "Auto-Init Turn 1 Visibility + Enrichment";
	const details: string[] = [];
	const start = Date.now();

	// Create a fake project with identifiable content
	const dir = createTestDir("auto-init-turn1");
	details.push(`test dir: ${dir}`);

	writeFileSync(join(dir, "package.json"), JSON.stringify({
		name: "widget-factory",
		description: "A widget manufacturing system using React and PostgreSQL",
		scripts: { test: "vitest run", build: "tsc && vite build" },
		dependencies: { react: "^18.0.0", pg: "^8.0.0" },
	}, null, 2));

	writeFileSync(join(dir, "README.md"),
		"# Widget Factory\n\nA full-stack application for managing widget production.\n" +
		"Built with React frontend and PostgreSQL backend.\n" +
		"## Getting Started\n\n`pnpm install && pnpm dev`\n"
	);

	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(join(dir, "src/index.ts"),
		"import express from 'express';\nconst app = express();\n" +
		"app.listen(3000, () => console.log('Widget Factory running'));\n"
	);

	details.push("created widget-factory project files (package.json, README.md, src/index.ts)");

	try {
		// ── Session 1, Turn 1: Ask about the project ────────────────────────────────
		// Auto-init should fire, extract memories, and make them visible
		details.push("Session 1: asking about the project on Turn 1…");
		const result = await runOpencode(
			"What is this project and how do I run the tests?",
			dir,
			{ timeoutMs: 90_000 }
		);

		details.push(`  exitCode: ${result.exitCode}, duration: ${(result.durationMs / 1000).toFixed(1)}s`);
		details.push(`  response: ${result.text.slice(0, 200)}`);

		if (result.exitCode !== 0) {
			return {
				id, name, status: "FAIL", durationMs: Date.now() - start, details,
				error: `Session 1 failed: ${result.stderr.slice(0, 200)}`
			};
		}

		// ── Assertions ──────────────────────────────────────────────────────────────
		const assertions: Array<{ label: string; pass: boolean }> = [];

		// 1. Agent should know the project name from auto-init
		assertions.push({
			label: "Turn 1 knows project name",
			pass: /widget.?factory/i.test(result.text),
		});

		// 2. Agent should know the test command from auto-init
		assertions.push({
			label: "Turn 1 knows test command",
			pass: /vitest/i.test(result.text),
		});

		// 3. Verify project-brief memory exists in DB
		details.push("Waiting up to 15s for project-brief memory…");
		const memories = await waitForMemories(dir, 1, 15_000);
		details.push(`  memories saved: ${memories.length}`);

		for (const m of memories) {
			details.push(`  - [${m.metadata?.type ?? "?"}] "${m.memory.slice(0, 80)}"`);
		}

		assertions.push({
			label: "project-brief memory created",
			pass: memories.some(m => m.metadata?.type === "project-brief"),
		});

		// 4. Verify architecture or tech-context memory exists
		assertions.push({
			label: "tech-context or architecture memory created",
			pass: memories.some(m =>
				m.metadata?.type === "tech-context" ||
				m.metadata?.type === "architecture"
			),
		});

		// 5. Wait for background enrichment (Turn 1 response already delivered)
		details.push("Waiting 8s for background enrichment…");
		await Bun.sleep(8000);

		const enrichedMemories = await waitForMemories(dir, memories.length + 1, 15_000);
		details.push(`  enriched memories: ${enrichedMemories.length}`);
		assertions.push({
			label: "background enrichment added more memories",
			pass: enrichedMemories.length > memories.length,
		});

		// ── Log-based assertions ────────────────────────────────────────────────────
		// Small delay to let any in-flight log writes flush after enrichment
		await Bun.sleep(2000);
		const logs = getServerLogs(dir);
		details.push(`  server log lines: ${logs.length}`);
		// Dump enrichment-related log lines for debugging
		for (const l of logs.filter(x => x.includes("enrichment:"))) {
			details.push(`  [log] ${l.slice(0, 120)}`);
		}

		assertions.push({
			label: "Server logs confirm init mode used",
			pass: logs.some(l => l.includes("auto-init: using init mode")),
		});
		assertions.push({
			label: "Server logs confirm re-fetch after auto-init",
			pass: logs.some(l => l.includes("auto-init: re-fetched memories for Turn 1")),
		});
		assertions.push({
			label: "Server logs confirm [MEMORY] injected on Turn 1",
			pass: logs.some(l => l.includes("system.transform: [MEMORY] injected")),
		});
		assertions.push({
			label: "Server logs confirm background enrichment completed",
			pass: logs.some(l =>
				l.includes("enrichment: extraction done") ||
				l.includes("enrichment: session cache updated")
			),
		});

		for (const a of assertions) {
			details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
		}

		return {
			id, name,
			status: assertions.every(a => a.pass) ? "PASS" : "FAIL",
			durationMs: Date.now() - start,
			details,
			evidence: {
				memoriesCount: memories.length,
				enrichedMemoriesCount: enrichedMemories.length,
				responsePreview: result.text.slice(0, 500),
				serverLogLines: logs.length,
			},
			testDirs: [dir],
		};

	} catch (err) {
		return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
	}
}
