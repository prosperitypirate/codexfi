/**
 * Dashboard HTTP server — raw Bun.serve() with zero framework dependencies.
 *
 * Serves a single-file HTML dashboard at "/" and JSON API endpoints for live data.
 * Designed to be started by the CLI `dashboard` command and shut down on Ctrl+C.
 *
 * API endpoints:
 *   GET /                     — HTML dashboard (self-contained, no external deps)
 *   GET /api/stats            — Memory counts, type distribution, per-project breakdown
 *   GET /api/costs            — Cumulative API cost ledger by provider
 *   POST /api/costs/reset     — Zero out the cost ledger
 *   GET /api/activity         — Recent API call activity (in-memory ring buffer)
 *   GET /api/memories?limit=N           — Recent memories across all projects
 *   GET /api/memories?user_id=X&limit=N — Memories for a specific project/scope
 *   DELETE /api/memories/:id            — Delete a single memory by ID
 *   GET /api/search?q=...               — Semantic search (requires VOYAGE_API_KEY)
 */

import { VOYAGE_API_KEY } from "../config.js";
import { store, refresh as refreshDb } from "../db.js";
import { ledger, activityLog } from "../telemetry.js";
import { nameRegistry } from "../names.js";

/**
 * Refresh all cross-process state: store (re-reads JSONL from disk), cost ledger, name registry.
 *
 * The dashboard runs as a separate Bun process from the plugin. All three data
 * sources are written to disk by the plugin and cached in memory here. Without
 * this refresh, the dashboard shows stale data from when it was started.
 */
async function refreshAll(): Promise<void> {
	await Promise.all([
		refreshDb(),
		ledger.load(),
		nameRegistry.load(),
		activityLog.load(),
	]);
}

import { searchByVector, deleteMemory } from "../store.js";
import { embed } from "../embedder.js";
import { validateId } from "../config.js";
import { getDashboardHtml } from "./html.js";

// ── CORS headers ────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...CORS_HEADERS },
	});
}

function html(body: string): Response {
	return new Response(body, {
		headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
	});
}

// ── API handlers ────────────────────────────────────────────────────────────────

async function handleStats(): Promise<Response> {
	const allRows = store.scan({});
	const active = allRows.filter(r => !r.superseded_by);
	const superseded = allRows.length - active.length;
	const names = nameRegistry.snapshot();

	// Per-project breakdown
	const byProject = new Map<string, { count: number; name: string; scope: string }>();
	for (const r of active) {
		const uid = r.user_id;
		const existing = byProject.get(uid);
		if (existing) {
			existing.count++;
		} else {
			const isUser = uid.includes("_user_");
			byProject.set(uid, {
				count: 1,
				name: names[uid] ?? uid,
				scope: isUser ? "user" : "project",
			});
		}
	}

	// Per-type breakdown
	const byType: Record<string, number> = {};
	for (const r of active) {
		const type = r.type || "untyped";
		byType[type] = (byType[type] ?? 0) + 1;
	}

	// Scope counts
	const byScope = { project: 0, user: 0 };
	for (const r of active) {
		if (r.user_id.includes("_user_")) {
			byScope.user++;
		} else {
			byScope.project++;
		}
	}

	return json({
		total: allRows.length,
		active: active.length,
		superseded,
		projects: [...byProject.entries()]
			.map(([uid, info]) => ({ user_id: uid, ...info }))
			.sort((a, b) => b.count - a.count),
		by_type: byType,
		by_scope: byScope,
	});
}

async function handleCosts(): Promise<Response> {
	return json(ledger.snapshot());
}

async function handleCostsReset(): Promise<Response> {
	await ledger.reset();
	return json({ ok: true });
}

function handleActivity(url: URL): Response {
	const limit = parseInt(url.searchParams.get("limit") ?? "30", 10);
	const safeLimit = Math.min(Math.max(1, limit), 200);
	return json({ entries: activityLog.recent(safeLimit) });
}

async function handleMemories(url: URL): Promise<Response> {
	const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
	const safeLimit = Math.min(Math.max(1, limit), 500);
	const filterUserId = url.searchParams.get("user_id") ?? "";

	if (store.countRows() === 0) return json({ results: [] });

	const filter = filterUserId
		? { user_id: filterUserId, superseded_by: "" as const }
		: { superseded_by: "" as const };

	let active = store.scan(filter);

	active.sort((a, b) =>
		(b.updated_at || "").localeCompare(a.updated_at || "")
	);

	active = active.slice(0, safeLimit);

	const names = nameRegistry.snapshot();

	const results = active.map(r => {
		let metadata: Record<string, unknown> = {};
		try {
			metadata = JSON.parse(r.metadata_json || "{}");
		} catch { /* empty */ }

		return {
			id: r.id,
			memory: r.memory,
			user_id: r.user_id,
			project_name: names[r.user_id] ?? r.user_id,
			metadata,
			type: r.type || (metadata.type as string) || "unknown",
			created_at: r.created_at,
			updated_at: r.updated_at,
		};
	});

	return json({ results });
}

async function handleDeleteMemory(memoryId: string): Promise<Response> {
	try {
		const safeId = validateId(memoryId, "memory_id");
		await deleteMemory(safeId);
		return json({ ok: true, deleted: memoryId });
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : "Delete failed" },
			400,
		);
	}
}

async function handleSearch(url: URL): Promise<Response> {
	const query = url.searchParams.get("q") ?? "";
	if (!query.trim()) {
		return json({ error: "Missing ?q= parameter" }, 400);
	}

	if (!VOYAGE_API_KEY) {
		return json({ error: "VOYAGE_API_KEY not set — semantic search unavailable" }, 503);
	}

	const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);
	const safeLimit = Math.min(Math.max(1, limit), 50);

	if (store.countRows() === 0) return json({ results: [] });

	// Get unique user IDs from active records
	const userIds = [...new Set(store.scan({ superseded_by: "" }).map(r => r.user_id))];
	const names = nameRegistry.snapshot();

	// Embed query ONCE, then reuse the vector across all per-user searches.
	const queryVector = await embed(query.trim(), "query");

	// Search across all users with the pre-computed vector
	const allResults: Array<Record<string, unknown>> = [];
	for (const uid of userIds) {
		try {
			const results = await searchByVector(queryVector, uid, { limit: safeLimit });
			for (const r of results) {
				allResults.push({
					...r,
					user_id: uid,
					project_name: names[uid] ?? uid,
				});
			}
		} catch {
			// Skip user IDs that fail
		}
	}

	// Sort by score descending, take top N
	allResults.sort((a, b) => (b.score as number) - (a.score as number));

	return json({ results: allResults.slice(0, safeLimit) });
}

// ── Server factory ──────────────────────────────────────────────────────────────

export interface DashboardOptions {
	port?: number;
	hostname?: string;
}

/**
 * Start the dashboard HTTP server. Returns the Server instance for shutdown.
 *
 * The caller (CLI command) is responsible for:
 *   1. Initializing the store, ledger, and nameRegistry before calling this
 *   2. Calling server.stop() on shutdown
 */
export function startDashboard(options: DashboardOptions = {}): ReturnType<typeof Bun.serve> {
	const port = options.port ?? 9120;
	const hostname = options.hostname ?? "127.0.0.1";

	const server = Bun.serve({
		port,
		hostname,
		fetch: async (req: Request): Promise<Response> => {
			const url = new URL(req.url);

			// CORS preflight
			if (req.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: CORS_HEADERS });
			}

			try {
				// Refresh all cross-process state before handling API requests.
				if (url.pathname.startsWith("/api/")) {
					await refreshAll();
				}

				// Route dispatch — static routes first, then dynamic patterns
				switch (url.pathname) {
					case "/":
						return html(getDashboardHtml());

					case "/api/stats":
						return await handleStats();

					case "/api/costs":
						if (req.method === "POST") return await handleCostsReset();
						return await handleCosts();

					case "/api/costs/reset":
						if (req.method === "POST") return await handleCostsReset();
						return json({ error: "Method not allowed" }, 405);

					case "/api/activity":
						return handleActivity(url);

					case "/api/memories":
						return await handleMemories(url);

					case "/api/search":
						return await handleSearch(url);
				}

				// Dynamic routes: /api/memories/:id
				if (url.pathname.startsWith("/api/memories/") && req.method === "DELETE") {
					const memoryId = url.pathname.slice("/api/memories/".length);
					if (memoryId) return await handleDeleteMemory(memoryId);
				}

				return json({ error: "Not found" }, 404);
			} catch (err) {
				console.error("Dashboard request error:", err);
				return json(
					{ error: err instanceof Error ? err.message : "Internal server error" },
					500,
				);
			}
		},
	});

	return server;
}
