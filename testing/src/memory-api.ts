/**
 * memory-api.ts — typed client for verifying memory state in tests.
 *
 * REWRITTEN for plugin-v2: uses embedded LanceDB store directly instead of
 * HTTP calls to the Docker backend at localhost:8020.
 *
 * The public API surface is identical — test scenarios import the same
 * functions with the same signatures. Only the internals changed from
 * fetch() to store.*() calls.
 */

import { createHash } from "crypto";
import { execSync } from "child_process";
import * as db from "../../plugin-v2/src/db.js";
import { refresh as refreshTable } from "../../plugin-v2/src/db.js";
import * as store from "../../plugin-v2/src/store.js";

const PREFIX = "opencode";

// Track whether we've initialized LanceDB for this test process
let initialized = false;

async function ensureInit(): Promise<void> {
	if (initialized) return;
	await db.init();
	initialized = true;
}

function sha256(input: string): string {
	return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/** Compute the user tag the plugin would use (mirrors plugin/src/services/tags.ts) */
function getUserTag(): string {
	try {
		const email = execSync("git config user.email", { encoding: "utf-8" }).trim();
		if (email) return `${PREFIX}_user_${sha256(email)}`;
	} catch {}
	const fallback = process.env["USER"] ?? process.env["USERNAME"] ?? "anonymous";
	return `${PREFIX}_user_${sha256(fallback)}`;
}

const USER_TAG = getUserTag();

export type MemoryType =
	| "project-brief"
	| "architecture"
	| "tech-context"
	| "product-context"
	| "progress"
	| "project-config"
	| "error-solution"
	| "preference"
	| "learned-pattern"
	| "session-summary"
	| "conversation";

export interface Memory {
	id: string;
	memory: string;
	user_id: string;
	metadata: { type?: MemoryType };
	created_at: string;
	updated_at: string;
	superseded_by?: string | null;
}

/** Compute the project tag for a given directory path (matches plugin's getTags logic) */
export function projectTagForDir(dir: string): string {
	const hash = createHash("sha256").update(dir).digest("hex").slice(0, 16);
	return `opencode_project_${hash}`;
}

/** Fetch all memories for a project directory */
export async function getMemoriesForDir(dir: string): Promise<Memory[]> {
	const projectTag = projectTagForDir(dir);
	return getMemoriesForTag(projectTag);
}

/** Fetch all memories for a project tag */
export async function getMemoriesForTag(projectTag: string): Promise<Memory[]> {
	await ensureInit();
	// Refresh table to see writes from the opencode serve child process
	await refreshTable();
	const rows = await store.list(projectTag, { limit: 100 });
	return rows.map((r) => ({
		id: r.id,
		memory: r.memory,
		user_id: r.user_id,
		metadata: (r.metadata ?? {}) as { type?: MemoryType },
		created_at: r.created_at ?? new Date().toISOString(),
		updated_at: r.updated_at ?? new Date().toISOString(),
		superseded_by: null,
	}));
}

/** Count memories of a specific type for a directory */
export async function countByType(dir: string, type: MemoryType): Promise<number> {
	const memories = await getMemoriesForDir(dir);
	return memories.filter((m) => m.metadata?.type === type).length;
}

/** Wait until the store has at least `minCount` memories for a directory */
export async function waitForMemories(
	dir: string,
	minCount: number,
	timeoutMs = 30_000
): Promise<Memory[]> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const memories = await getMemoriesForDir(dir);
		if (memories.length >= minCount) return memories;
		await Bun.sleep(1000);
	}
	return getMemoriesForDir(dir);
}

/**
 * Directly add a memory to the store, bypassing the plugin/agent.
 * Used for deterministic test seeding — the store extracts facts from
 * the messages array via LLM, embeds them, and stores them.
 */
export async function addMemoryDirect(
	dir: string,
	content: string,
	type?: MemoryType
): Promise<{ id: string; memory: string; event: string }[]> {
	await ensureInit();
	const projectTag = projectTagForDir(dir);
	const metadata: Record<string, unknown> = {};
	if (type) metadata.type = type;

	const results = await store.ingest(
		[{ role: "user", content }],
		projectTag,
		{ metadata },
	);

	return results.map((r) => ({
		id: r.id,
		memory: r.memory,
		event: r.event,
	}));
}

/** Directly search memories via the embedded store */
export async function searchMemories(
	dir: string,
	query: string,
	limit = 10,
	threshold = 0.3
): Promise<{ id: string; memory: string; score: number; metadata: Record<string, unknown> }[]> {
	await ensureInit();
	const projectTag = projectTagForDir(dir);
	const results = await store.search(query, projectTag, { limit, threshold });

	return results.map((r) => ({
		id: r.id,
		memory: r.memory,
		score: r.score,
		metadata: r.metadata,
	}));
}

/**
 * "Health check" — for the embedded store, this always returns true once
 * LanceDB is initialized. Replaces the HTTP /health check.
 */
export async function isBackendReady(): Promise<boolean> {
	try {
		await ensureInit();
		return true;
	} catch {
		return false;
	}
}

/**
 * Delete all memories for a test directory.
 * Called after each scenario to keep the memory store clean.
 */
export async function cleanupTestDir(dir: string): Promise<number> {
	const projectTag = projectTagForDir(dir);
	return cleanupTag(projectTag);
}

/** Delete all memories for multiple test directories */
export async function cleanupTestDirs(dirs: string[]): Promise<number> {
	let total = 0;
	for (const dir of dirs) {
		total += await cleanupTestDir(dir);
	}
	return total;
}

/** Delete all memories for a given project tag */
async function cleanupTag(projectTag: string): Promise<number> {
	try {
		await ensureInit();
		// Refresh to pick up latest state after server shutdown
		await refreshTable();
		const rows = await store.list(projectTag, { limit: 200, includeSuperseded: true });
		let deleted = 0;
		for (const m of rows) {
			try {
				await store.deleteMemory(m.id);
				deleted++;
			} catch {
				// best-effort cleanup
			}
		}
		return deleted;
	} catch {
		return 0;
	}
}
