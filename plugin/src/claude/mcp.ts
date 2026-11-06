/**
 * codexfi MCP server (stdio) — the explicit, agent-initiated memory tier.
 *
 * Hooks cover the automatic path (inject at session start + per prompt, extract
 * after every turn). These tools let Claude act on memory deliberately:
 *
 *   memory_search  semantic search (project, user or both scopes)
 *   memory_add     store a fact verbatim (no extraction call)
 *   memory_list    recent memories, optionally by type
 *   memory_forget  delete a memory by id (or unique id prefix)
 *
 * Minimal hand-rolled JSON-RPC 2.0 over newline-delimited stdio — the MCP stdio
 * transport — so the plugin ships with no SDK dependency.
 */

import { createInterface } from "node:readline";

import pkg from "../../package.json";
import { MEMORY_TYPES } from "../types.js";
import { isFullyPrivate, stripPrivateContent } from "../services/privacy.js";
import { ensureInit, isDisabled, tagsFor } from "./runtime.js";

const PROTOCOL_VERSION = "2025-06-18";

const SERVER_INSTRUCTIONS =
	"codexfi is this machine's persistent memory for Claude Code. Relevant memories are injected automatically " +
	"at session start and with each prompt as [MEMORY] blocks, and every turn is extracted in the background. " +
	"Use memory_search when you need history that is not already in context (past decisions, earlier fixes, " +
	"conventions, what was done in previous sessions). Use memory_add when the user asks you to remember " +
	"something or when you settle a durable fact (scope \"user\" for cross-project preferences). Memories are " +
	"notes from past sessions — verify against the code before relying on them for anything risky.";

const scopeSchema = { type: "string", enum: ["project", "user", "all"], description: "Default: all (search) / project (add, list)" };

const TOOLS = [
	{
		name: "memory_search",
		description: "Semantic search over codexfi memories from past sessions (decisions, fixes, conventions, preferences).",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", description: "What to look for, in natural language" },
				scope: scopeSchema,
				limit: { type: "number", description: "Max results (default 10)" },
			},
			required: ["query"],
		},
	},
	{
		name: "memory_add",
		description: "Store a durable fact in codexfi memory, verbatim. Write it as a self-contained statement including the why.",
		inputSchema: {
			type: "object",
			properties: {
				content: { type: "string", description: "The fact to remember" },
				type: { type: "string", enum: [...MEMORY_TYPES], description: "Memory type (default learned-pattern; preference for user habits)" },
				scope: { type: "string", enum: ["project", "user"], description: "project (default) or user (cross-project)" },
			},
			required: ["content"],
		},
	},
	{
		name: "memory_list",
		description: "List the most recently updated codexfi memories, optionally filtered by type.",
		inputSchema: {
			type: "object",
			properties: {
				scope: { type: "string", enum: ["project", "user"] },
				type: { type: "string", enum: [...MEMORY_TYPES] },
				limit: { type: "number", description: "Max results (default 20)" },
			},
		},
	},
	{
		name: "memory_forget",
		description: "Delete a codexfi memory by id (full id or a unique prefix of at least 8 characters).",
		inputSchema: {
			type: "object",
			properties: { id: { type: "string" } },
			required: ["id"],
		},
	},
];

type Args = Record<string, unknown>;

function projectDir(): string {
	return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

function clampLimit(v: unknown, dflt: number, max = 50): number {
	const n = typeof v === "number" ? Math.floor(v) : dflt;
	return Math.max(1, Math.min(max, n || dflt));
}

async function callTool(name: string, args: Args): Promise<string> {
	// excludePaths is a privacy switch — honour it for explicit tool calls too.
	if (isDisabled(projectDir())) return "codexfi is disabled for this directory (excludePaths).";
	const store = await import("../store.js");
	await ensureInit();
	const tags = tagsFor(projectDir());

	switch (name) {
		case "memory_search": {
			const query = String(args.query ?? "").trim();
			if (!query) return "query is required";
			const scope = (args.scope as string) ?? "all";
			const limit = clampLimit(args.limit, 10);
			const { detectQueryTypes } = await import("../services/query-types.js");
			const types = detectQueryTypes(query);
			const { activeThresholds } = await import("../embedder.js");
			const floor = activeThresholds().floor;
			const searches = [];
			if (scope !== "user") searches.push(store.search(query, tags.project, { limit, threshold: floor, ...(types ? { types } : {}) }).then((r) => r.map((x) => ({ ...x, scope: "project" }))));
			if (scope !== "project") searches.push(store.search(query, tags.user, { limit, threshold: floor }).then((r) => r.map((x) => ({ ...x, scope: "user" }))));
			const rows = (await Promise.all(searches)).flat().sort((a, b) => b.score - a.score).slice(0, limit);
			if (rows.length === 0) return `No memories found for "${query}".`;
			return rows
				.map((r) => `- [${r.id.slice(0, 8)} · ${r.scope} · ${(r.metadata?.type as string) ?? "?"} · ${Math.round(r.score * 100)}%${r.date ? ` · ${r.date}` : ""}] ${r.memory}`)
				.join("\n");
		}
		case "memory_add": {
			const content = String(args.content ?? "");
			if (!content.trim()) return "content is required";
			if (isFullyPrivate(content)) return "Refusing to store content that is entirely <private>.";
			const scope = args.scope === "user" ? "user" : "project";
			const result = await store.addMemory(stripPrivateContent(content), scope === "user" ? tags.user : tags.project, {
				type: typeof args.type === "string" ? args.type : undefined,
				metadata: { source: "memory_add", date: new Date().toISOString().slice(0, 10) },
			});
			return `${result.event === "ADD" ? "Stored" : "Updated existing"} ${scope} memory ${result.id.slice(0, 8)} (${result.type}).`;
		}
		case "memory_list": {
			const tag = args.scope === "user" ? tags.user : tags.project;
			const limit = clampLimit(args.limit, 20, 100);
			const rows = typeof args.type === "string"
				? (await store.listByType(tag, [args.type], { limit })).map((r) => ({ id: r.id as string, memory: r.memory as string, type: args.type as string, updated: (r.updated_at as string) ?? "" }))
				: (await store.list(tag, { limit })).map((r) => ({ id: r.id, memory: r.memory, type: (r.metadata?.type as string) ?? "?", updated: r.updated_at ?? "" }));
			if (rows.length === 0) return "No memories yet.";
			return rows.map((r) => `- [${r.id.slice(0, 8)} · ${r.type} · ${r.updated.slice(0, 10)}] ${r.memory}`).join("\n");
		}
		case "memory_forget": {
			const id = String(args.id ?? "").trim();
			if (id.length < 8) return "Provide the full id or a prefix of at least 8 characters.";
			const { store: vs } = await import("../db.js");
			const candidates = [tags.project, tags.user]
				.flatMap((t) => vs.scan({ user_id: t }))
				.filter((r) => r.id === id || r.id.startsWith(id));
			if (candidates.length === 0) return `No memory with id ${id} in this project or your user scope.`;
			if (candidates.length > 1) return `Prefix ${id} is ambiguous (${candidates.length} matches) — use more characters.`;
			await store.deleteMemory(candidates[0]!.id);
			return `Deleted memory ${candidates[0]!.id.slice(0, 8)}: ${candidates[0]!.memory.slice(0, 120)}`;
		}
		default:
			throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
	}
}

interface RpcMessage {
	jsonrpc: "2.0";
	id?: number | string | null;
	method?: string;
	params?: Record<string, unknown>;
}

function send(msg: Record<string, unknown>): void {
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
}

/** Handle one JSON-RPC request; returns the response object (or null for notifications). Exported for tests. */
export async function handleRpc(msg: RpcMessage): Promise<Record<string, unknown> | null> {
	const isNotification = msg.id === undefined || msg.id === null;
	try {
		switch (msg.method) {
			case "initialize":
				return {
					id: msg.id,
					result: {
						protocolVersion: (msg.params?.protocolVersion as string) ?? PROTOCOL_VERSION,
						capabilities: { tools: {} },
						serverInfo: { name: "codexfi", version: pkg.version },
						instructions: SERVER_INSTRUCTIONS,
					},
				};
			case "ping":
				return { id: msg.id, result: {} };
			case "tools/list":
				return { id: msg.id, result: { tools: TOOLS } };
			case "tools/call": {
				const name = String(msg.params?.name ?? "");
				const args = (msg.params?.arguments ?? {}) as Args;
				try {
					const text = await callTool(name, args);
					return { id: msg.id, result: { content: [{ type: "text", text }] } };
				} catch (e) {
					if ((e as { code?: number }).code === -32602) throw e;
					return {
						id: msg.id,
						result: { content: [{ type: "text", text: `codexfi error: ${e instanceof Error ? e.message : String(e)}` }], isError: true },
					};
				}
			}
			default:
				if (isNotification) return null; // notifications/initialized, cancelled, …
				return { id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
		}
	} catch (e) {
		if (isNotification) return null;
		return { id: msg.id, error: { code: (e as { code?: number }).code ?? -32603, message: e instanceof Error ? e.message : String(e) } };
	}
}

/** Run the stdio server until stdin closes. */
export async function runMcpServer(): Promise<void> {
	const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
	for await (const line of rl) {
		if (!line.trim()) continue;
		let msg: RpcMessage;
		try {
			msg = JSON.parse(line) as RpcMessage;
		} catch {
			send({ id: null, error: { code: -32700, message: "Parse error" } });
			continue;
		}
		const reply = await handleRpc(msg);
		if (reply) send(reply);
	}
}
