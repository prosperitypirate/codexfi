/**
 * Main plugin entry point — hooks into OpenCode's chat lifecycle.
 *
 * Phase 3d port from plugin/src/index.ts (892 lines → ~800 lines):
 * - ALL memoryClient.* HTTP calls replaced with direct store.* / db.* calls
 * - Enumeration/synthesis detection moved from client.ts into this file
 * - isConfigured() checks VOYAGE_API_KEY instead of HTTP URL
 * - Privacy stripping applied in memory tool "add" and auto-init paths (bug fix §12)
 * - nameRegistry used directly instead of HTTP POST /names
 * - db.init() + telemetry + nameRegistry initialized on first use (lazy)
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as db from "./db.js";
import * as store from "./store.js";
import { nameRegistry } from "./names.js";
import { ledger } from "./telemetry.js";
import {
	formatContextForPrompt,
	type StructuredMemory,
	type ProfileResult,
	type MemoriesResponseMinimal,
} from "./services/context.js";
import { getTags, getDisplayNames } from "./services/tags.js";
import { stripPrivateContent, isFullyPrivate } from "./services/privacy.js";
import { createCompactionHook, type CompactionContext } from "./services/compaction.js";
import {
	createAutoSaveHook, updateMessageCache,
	updateAssistantTextBuffer, popAssistantText, injectFinalAssistantMessage,
} from "./services/auto-save.js";

import { isConfigured, PLUGIN_CONFIG } from "./plugin-config.js";
import { log } from "./services/logger.js";
import type { MemoryScope, MemoryType } from "./types/index.js";

// ── Enumeration / synthesis detection ───────────────────────────────────────────
// Moved from client.ts — store.search() accepts `types` directly, so detection
// lives here alongside the search call.

const ENUMERATION_TYPES = [
	"tech-context", "preference", "learned-pattern", "error-solution", "project-config",
];

const SYNTHESIS_TYPES = [
	...ENUMERATION_TYPES, "architecture",
];

const ENUMERATION_REGEX = /\b(list\s+all|list\s+every|all\s+the\s+\w+|every\s+(env|config|setting|preference|error|pattern|tool|developer|tech|project|decision|approach)|across\s+all(\s+sessions)?|complete\s+(list|history|tech\s+stack|stack)|entire\s+(history|list|project\s+history|tech\s+stack)|describe\s+all|enumerate\s+all|full\s+(list|history|tech\s+stack))\b/i;

const WIDE_SYNTHESIS_REGEX = /\b(both\s+(projects?|the)|across\s+both|end[\s-]to[\s-]end|how\s+has.{0,30}evolved|sequence\s+of.{0,20}decisions?)\b/i;

function detectQueryTypes(query: string): string[] | undefined {
	const isEnumeration = ENUMERATION_REGEX.test(query);
	const isWideSynthesis = WIDE_SYNTHESIS_REGEX.test(query);
	if (isWideSynthesis) return SYNTHESIS_TYPES;
	if (isEnumeration) return ENUMERATION_TYPES;
	return undefined;
}

// ── Code block stripping (for memory keyword detection) ─────────────────────────

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`]+`/g;

const CODE_EXTENSIONS = new Set([
	".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
	".py", ".go", ".rs", ".rb", ".java", ".kt", ".swift",
	".c", ".cpp", ".h", ".cs", ".php", ".vue", ".svelte",
]);

const ROOT_MARKERS = [
	"package.json", "Cargo.toml", "go.mod", "pyproject.toml",
	"requirements.txt", "Gemfile", "pom.xml", "build.gradle",
	"CMakeLists.txt", ".git", "README.md", "README.rst",
];

function detectExistingCodebase(directory: string): boolean {
	try {
		for (const marker of ROOT_MARKERS) {
			if (existsSync(join(directory, marker))) return true;
		}
		const entries = readdirSync(directory, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile()) {
				const ext = entry.name.slice(entry.name.lastIndexOf("."));
				if (CODE_EXTENSIONS.has(ext)) return true;
			}
		}
		return false;
	} catch {
		return false;
	}
}

// ── Project auto-init ───────────────────────────────────────────────────────────

const INIT_FILES = [
	{ name: "README.md",           maxChars: 3000 },
	{ name: "README.rst",          maxChars: 3000 },
	{ name: "package.json",        maxChars: 2000 },
	{ name: "Cargo.toml",          maxChars: 2000 },
	{ name: "go.mod",              maxChars: 1000 },
	{ name: "pyproject.toml",      maxChars: 2000 },
	{ name: "docker-compose.yml",  maxChars: 1500 },
	{ name: "docker-compose.yaml", maxChars: 1500 },
	{ name: "tsconfig.json",       maxChars: 1000 },
	{ name: ".env.example",        maxChars: 500  },
];

const INIT_TOTAL_CHAR_CAP = 7000;

async function triggerSilentAutoInit(
	directory: string,
	tags: { user: string; project: string }
): Promise<void> {
	const sections: string[] = [];
	let totalChars = 0;

	for (const { name, maxChars } of INIT_FILES) {
		if (totalChars >= INIT_TOTAL_CHAR_CAP) break;
		const filePath = join(directory, name);
		if (!existsSync(filePath)) continue;
		try {
			const raw = readFileSync(filePath, "utf-8").slice(0, maxChars);
			sections.push(`=== ${name} ===\n${raw}`);
			totalChars += raw.length;
		} catch {
			continue;
		}
	}

	if (sections.length === 0) {
		log("auto-init: no readable project files found, skipping");
		return;
	}

	const content = sections.join("\n\n");

	// Privacy stripping — applied before extraction (bug fix §12)
	const sanitized = stripPrivateContent(content);

	log("auto-init: sending project files for extraction", {
		files: sections.length,
		chars: sanitized.length,
	});

	// Direct store call — replaces memoryClient.addMemoryFromProjectFiles()
	const results = await store.ingest(
		[{ role: "user", content: sanitized }],
		tags.project,
	);
	log("auto-init: extraction done", { count: results.length });
}

// ── Project-brief seeding fallback ──────────────────────────────────────────────

async function seedProjectBrief(
	directory: string,
	tags: { project: string }
): Promise<void> {
	const readmePath = join(directory, "README.md");
	const rstPath    = join(directory, "README.rst");
	const chosen     = existsSync(readmePath) ? readmePath : existsSync(rstPath) ? rstPath : null;
	if (!chosen) return;

	const raw = readFileSync(chosen, "utf-8");

	const SKIP = /^(#|\[!\[|<|---|===|\s*$)/;
	const firstPara = raw
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l.length > 20 && !SKIP.test(l));

	if (!firstPara) return;

	const projectName = directory.split("/").pop() ?? "this project";
	const content = `Project Brief for "${projectName}": ${firstPara}`;

	// Privacy stripping — applied before extraction (bug fix §12)
	const sanitized = stripPrivateContent(content);

	log("seed-brief: seeding project-brief from README", { contentLength: sanitized.length });

	// Direct store call — replaces memoryClient.addMemory()
	const results = await store.ingest(
		[{ role: "user", content: sanitized }],
		tags.project,
		{ metadata: { type: "project-brief" } },
	);
	log("seed-brief: done", { count: results.length });
}

// ── Memory keyword detection ────────────────────────────────────────────────────

const MEMORY_KEYWORD_PATTERN = new RegExp(
	`\\b(${PLUGIN_CONFIG.keywordPatterns.join("|")})\\b`, "i"
);

const MEMORY_NUDGE_MESSAGE = `[MEMORY TRIGGER DETECTED]
The user wants you to remember something. You MUST use the \`memory\` tool with \`mode: "add"\` to save this information.

Extract the key information the user wants remembered and save it as a concise, searchable memory.
- Use \`scope: "project"\` for project-specific preferences (e.g., "run lint with tests")
- Use \`scope: "user"\` for cross-project preferences (e.g., "prefers concise responses")
- Choose an appropriate \`type\`: "preference", "project-config", "learned-pattern", etc.

DO NOT skip this step. The user explicitly asked you to remember.`;

function removeCodeBlocks(text: string): string {
	return text.replace(CODE_BLOCK_PATTERN, "").replace(INLINE_CODE_PATTERN, "");
}

function detectMemoryKeyword(text: string): boolean {
	const textWithoutCode = removeCodeBlocks(text);
	return MEMORY_KEYWORD_PATTERN.test(textWithoutCode);
}

// ── Per-session memory cache ────────────────────────────────────────────────────

interface SessionMemoryCache {
	structuredSections: Record<string, StructuredMemory[]>;
	profile: ProfileResult | null;
	userSemanticResults: MemoriesResponseMinimal;
	projectSemanticResults: MemoriesResponseMinimal;
	initialized: boolean;
	lastRefreshAt: number;
	needsStructuredRefresh?: boolean;
}

// ── Lazy initialization guard ───────────────────────────────────────────────────

let dbInitialized = false;

async function ensureInitialized(): Promise<void> {
	if (dbInitialized) return;
	await db.init();
	await nameRegistry.init();
	await ledger.init();
	dbInitialized = true;
	log("ensureInitialized: LanceDB + nameRegistry + telemetry ready");
}

// ── Search wrapper ──────────────────────────────────────────────────────────────
// Wraps store.search() to match the shape expected by the session cache
// (MemoriesResponseMinimal with .results[].similarity and .results[].memory).

async function searchMemories(
	query: string,
	containerTag: string,
	recencyWeight?: number,
): Promise<{ results: Array<{ id: string; memory: string; chunk: string; similarity: number; date?: string }> }> {
	const types = detectQueryTypes(query);
	const results = await store.search(query, containerTag, {
		limit: PLUGIN_CONFIG.maxMemories,
		threshold: PLUGIN_CONFIG.similarityThreshold,
		...(recencyWeight !== undefined && recencyWeight > 0 ? { recencyWeight } : {}),
		...(types ? { types } : {}),
	});

	return {
		results: results.map((r) => ({
			id: r.id,
			memory: r.memory,
			chunk: r.chunk || "",
			similarity: r.score,
			date: r.date ?? undefined,
		})),
	};
}

// ── Profile wrapper ─────────────────────────────────────────────────────────────
// Wraps store.getProfile() to match ProfileResult shape.

async function getProfile(
	containerTag: string,
): Promise<ProfileResult & { success: boolean }> {
	try {
		const memories = await store.getProfile(containerTag, PLUGIN_CONFIG.maxProfileItems);
		const facts = memories.map((m) => m.memory).filter(Boolean);
		return {
			success: true,
			profile: {
				static: facts,
				dynamic: [],
			},
		};
	} catch (error) {
		log("getProfile: error", { error: String(error) });
		return {
			success: false,
			profile: null,
		};
	}
}

// ── List wrapper ────────────────────────────────────────────────────────────────
// Wraps store.list() to match the shape expected by existing cache logic.

async function listMemories(
	containerTag: string,
	limit: number,
): Promise<{
	success: boolean;
	memories: Array<{
		id: string;
		summary: string;
		createdAt: string;
		metadata?: Record<string, unknown>;
	}>;
}> {
	try {
		const rows = await store.list(containerTag, { limit });
		return {
			success: true,
			memories: rows.map((r) => ({
				id: r.id,
				summary: r.memory,
				createdAt: r.created_at ?? new Date().toISOString(),
				metadata: r.metadata,
			})),
		};
	} catch (error) {
		log("listMemories: error", { error: String(error) });
		return { success: false, memories: [] };
	}
}

// ── Format search results for tool output ───────────────────────────────────────

function formatSearchResults(
	query: string,
	scope: string | undefined,
	results: { results?: Array<{ id: string; memory?: string; similarity: number }> },
	limit?: number
): string {
	const memoryResults = results.results || [];
	return JSON.stringify({
		success: true,
		query,
		scope,
		count: memoryResults.length,
		results: memoryResults.slice(0, limit || 10).map((r) => ({
			id: r.id,
			content: r.memory,
			similarity: Math.round(r.similarity * 100),
		})),
	});
}

// ── Plugin export ───────────────────────────────────────────────────────────────

export const MemoryPlugin: Plugin = async (ctx: PluginInput) => {
	const { directory } = ctx;
	const tags = getTags(directory);
	const displayNames = getDisplayNames(directory);
	const sessionCaches = new Map<string, SessionMemoryCache>();
	const configured = isConfigured();
	log("Plugin init", { directory, tags, displayNames, configured });

	if (!configured) {
		log("Plugin disabled — VOYAGE_API_KEY not set");
	} else {
		// Fire-and-forget: register human-readable names (local JSON, not HTTP)
		ensureInitialized()
			.then(async () => {
				await nameRegistry.register(tags.project, displayNames.project);
				await nameRegistry.register(tags.user, displayNames.user);
			})
			.catch((err) => log("registerNames failed (non-fatal)", { error: String(err) }));
	}

	// Fetch model limits once at plugin init
	const modelLimits = new Map<string, number>();

	(async () => {
		try {
			const response = await ctx.client.provider.list();
			if (response.data?.all) {
				for (const provider of response.data.all) {
					if (provider.models) {
					for (const [modelId, model] of Object.entries(provider.models)) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const m = model as any;
						if (m.limit?.context) {
							modelLimits.set(`${provider.id}/${modelId}`, m.limit.context as number);
						}
						}
					}
				}
			}
			log("Model limits loaded", { count: modelLimits.size });
		} catch (error) {
			log("Failed to fetch model limits", { error: String(error) });
		}
	})();

	const getModelLimit = (providerID: string, modelID: string): number | undefined => {
		return modelLimits.get(`${providerID}/${modelID}`);
	};

	const compactionHook =
		configured && ctx.client
			? createCompactionHook(ctx as CompactionContext, tags, {
				threshold: PLUGIN_CONFIG.compactionThreshold,
				getModelLimit,
				onCompaction: (sessionID: string) => {
					const cache = sessionCaches.get(sessionID);
					if (cache) {
						cache.needsStructuredRefresh = true;
						log("compaction: flagged session for structured refresh", { sessionID });
					}
				},
			})
			: null;

	const autoSaveHook =
		configured && ctx.client
			? createAutoSaveHook(tags, ctx.client)
			: null;

	return {
		"experimental.chat.messages.transform": async (_input, output) => {
			updateMessageCache(output.messages);
		},

		// ── System prompt injection ──────────────────────────────────────────
		"experimental.chat.system.transform": async (input, output) => {
			if (!configured) return;

			const sessionID = input.sessionID;
			if (!sessionID) return;

			const cache = sessionCaches.get(sessionID);
			if (!cache?.initialized) return;

			try {
				const memoryContext = formatContextForPrompt(
					cache.profile,
					cache.userSemanticResults,
					cache.projectSemanticResults,
					cache.structuredSections
				);

				if (memoryContext) {
					output.system.push(memoryContext);
					log("system.transform: [MEMORY] injected", {
						length: memoryContext.length,
						sessionID,
						...(cache.needsStructuredRefresh
							? { warning: "structured sections stale — refresh pending on next user message" }
							: {}),
					});
				}
			} catch (error) {
				log("system.transform: ERROR", { error: String(error) });
			}
		},

		"chat.message": async (input, output) => {
			if (!configured) return;

			// Ensure DB is initialized before any store operations
			await ensureInitialized();

			const start = Date.now();

			try {
				const textParts = output.parts.filter(
					(p): p is Part & { type: "text"; text: string } => p.type === "text"
				);

				if (textParts.length === 0) {
					log("chat.message: no text parts found");
					return;
				}

				const userMessage = textParts.map((p) => p.text).join("\n");

				if (!userMessage.trim()) {
					log("chat.message: empty message, skipping");
					return;
				}

				log("chat.message: processing", {
					messagePreview: userMessage.slice(0, 100),
					partsCount: output.parts.length,
					textPartsCount: textParts.length,
				});

				if (detectMemoryKeyword(userMessage)) {
					log("chat.message: memory keyword detected");
					const nudgePart: Part = {
						id: `memory-nudge-${Date.now()}`,
						sessionID: input.sessionID,
						messageID: output.message.id,
						type: "text",
						text: MEMORY_NUDGE_MESSAGE,
						synthetic: true,
					};
					output.parts.push(nudgePart);
				}

				const cache = sessionCaches.get(input.sessionID);
				const isFirstMessage = !cache?.initialized;

				if (isFirstMessage) {
					// ── Turn 1: Full memory fetch + cache population ────────────
					const [profileResult, userSearch, projectMemoriesList, projectSearch] = await Promise.all([
						getProfile(tags.user),
						searchMemories(userMessage, tags.user, 0.1),
						listMemories(tags.project, PLUGIN_CONFIG.maxStructuredMemories),
						searchMemories(userMessage, tags.project, 0.15),
					]);

					const profile = profileResult.success ? profileResult : null;
					const allProjectMemories = projectMemoriesList.success
						? projectMemoriesList.memories
						: [];

					// ── Auto-init: no project memory yet ────────────────────────
					if (allProjectMemories.length === 0) {
						if (detectExistingCodebase(directory)) {
							await triggerSilentAutoInit(directory, tags).catch(
								(err) => log("auto-init: failed", { error: String(err) })
							);
						}
					}

					// ── Partition project memories by type ──────────────────────
					const byType: Record<string, StructuredMemory[]> = {};
					for (const m of allProjectMemories) {
						const memType = (m.metadata as Record<string, unknown> | undefined)?.type as string | undefined;
						const key = memType || "other";
						if (!byType[key]) byType[key] = [];
						byType[key].push({
							id: m.id,
							memory: m.summary,
							similarity: 1,
							metadata: m.metadata as Record<string, unknown> | undefined,
							createdAt: m.createdAt,
						});
					}

					// ── Project-brief fallback seeding ──────────────────────────
					if (allProjectMemories.length > 0 && !byType["project-brief"]) {
						await seedProjectBrief(directory, tags).catch(
							(err) => log("seed-brief: failed", { error: String(err) })
						);
					}

					// ── Separate user + project semantic results ────────────────
					const userResults: MemoriesResponseMinimal = {
						results: (userSearch.results || []).map((r) => ({
							...r,
							memory: r.memory,
						})),
					};
					const projectResults: MemoriesResponseMinimal = {
						results: (projectSearch.results || []).map((r) => ({
							...r,
							memory: r.memory,
						})),
					};

					// ── Populate session cache ──────────────────────────────────
					sessionCaches.set(input.sessionID, {
						structuredSections: byType,
						profile,
						userSemanticResults: userResults,
						projectSemanticResults: projectResults,
						initialized: true,
						lastRefreshAt: Date.now(),
					});

					const duration = Date.now() - start;
					log("chat.message: session cache populated (turn 1)", {
						duration,
						typeCount: Object.keys(byType).length,
						userSemanticCount: userResults.results?.length ?? 0,
						projectSemanticCount: projectResults.results?.length ?? 0,
					});
				} else {
					// ── Turns 2+: Per-turn refresh ──────────────────────────────
					try {
						if (cache?.needsStructuredRefresh) {
							// ── Post-compaction: full structured refresh ────────
							const prevStructuredTypes = Object.keys(cache.structuredSections);
							const prevMemoryCount = prevStructuredTypes.reduce(
								(sum, key) => sum + (cache.structuredSections[key]?.length ?? 0), 0
							);
							const prevSemanticCount = cache.projectSemanticResults.results?.length ?? 0;
							const prevProfilePresent = !!cache.profile;

							log("chat.message: post-compaction structured refresh starting", {
								sessionID: input.sessionID,
								before: {
									types: prevStructuredTypes.length,
									memories: prevMemoryCount,
									semanticHits: prevSemanticCount,
									hasProfile: prevProfilePresent,
								},
							});

							const refreshStart = Date.now();

							const [freshList, freshProfile, freshSearch] = await Promise.all([
								listMemories(tags.project, PLUGIN_CONFIG.maxStructuredMemories),
								getProfile(tags.user),
								searchMemories(userMessage, tags.project, 0.15),
							]);

							// Update structured sections
							if (freshList.success) {
								const allProjectMemories = freshList.memories || [];
								const byType: Record<string, StructuredMemory[]> = {};
								for (const m of allProjectMemories) {
									const memType = (m.metadata as Record<string, unknown> | undefined)?.type as string | undefined;
									const key = memType || "other";
									if (!byType[key]) byType[key] = [];
									byType[key].push({
										id: m.id,
										memory: m.summary,
										similarity: 1,
										metadata: m.metadata as Record<string, unknown> | undefined,
										createdAt: m.createdAt,
									});
								}
								cache.structuredSections = byType;

								log("chat.message: post-compaction structured sections refreshed", {
									before: { types: prevStructuredTypes.length, memories: prevMemoryCount },
									after: { types: Object.keys(byType).length, memories: allProjectMemories.length },
								});
							} else {
								log("chat.message: post-compaction structured sections fetch FAILED — keeping stale cache");
							}

							// Update profile
							if (freshProfile.success) {
								cache.profile = freshProfile;
								log("chat.message: post-compaction profile refreshed", {
									hadProfileBefore: prevProfilePresent,
								});
							} else {
								log("chat.message: post-compaction profile fetch FAILED — keeping stale cache");
							}

							// Update project semantic results
							cache.projectSemanticResults = {
								results: (freshSearch.results || []).map((r) => ({
									...r,
									memory: r.memory,
								})),
							};
							log("chat.message: post-compaction semantic results refreshed", {
								before: prevSemanticCount,
								after: freshSearch.results?.length ?? 0,
							});

							cache.needsStructuredRefresh = false;
							cache.lastRefreshAt = Date.now();

							const refreshDuration = Date.now() - refreshStart;
							log("chat.message: post-compaction full refresh complete", {
								duration: refreshDuration,
								after: {
									types: Object.keys(cache.structuredSections).length,
									semanticHits: cache.projectSemanticResults.results?.length ?? 0,
									hasProfile: !!cache.profile,
								},
							});
						} else {
							// ── Normal turn: semantic-only refresh ──────────────
							const freshSearch = await searchMemories(
								userMessage,
								tags.project,
								0.15
							);

							if (cache) {
								cache.projectSemanticResults = {
									results: (freshSearch.results || []).map((r) => ({
										...r,
										memory: r.memory,
									})),
								};
								cache.lastRefreshAt = Date.now();

								log("chat.message: semantic refresh (turn 2+)", {
									resultCount: freshSearch.results?.length ?? 0,
									duration: Date.now() - start,
								});
							}
						}
					} catch (error) {
						const wasPostCompaction = cache?.needsStructuredRefresh ?? false;
						log("chat.message: refresh failed (non-fatal)", {
							error: String(error),
							wasPostCompaction,
							...(wasPostCompaction ? { willRetry: "flag stays set, retrying next turn" } : {}),
						});
					}
				}
			} catch (error) {
				log("chat.message: ERROR", { error: String(error) });
			}
		},

		tool: {
			memory: tool({
				description:
					"Persistent memory system (self-hosted). Use 'search' to find relevant memories, 'add' to store new knowledge, 'profile' to view user memories, 'list' to see recent memories, 'forget' to remove a memory. PROACTIVE USAGE: Search mid-session when you detect a task switch, encounter unfamiliar references, or need historical context not in the [MEMORY] block. Example: memory({ mode: 'search', query: 'PR conventions and commit workflow' })",
				args: {
					mode: tool.schema
						.enum(["add", "search", "profile", "list", "forget", "help"])
						.optional(),
					content: tool.schema.string().optional(),
					query: tool.schema.string().optional(),
					type: tool.schema
						.enum([
							"project-brief",
							"architecture",
							"tech-context",
							"product-context",
							"session-summary",
							"progress",
							"project-config",
							"error-solution",
							"preference",
							"learned-pattern",
							"conversation",
						])
						.optional(),
					scope: tool.schema.enum(["user", "project"]).optional(),
					memoryId: tool.schema.string().optional(),
					limit: tool.schema.number().optional(),
				},
				async execute(args: {
					mode?: string;
					content?: string;
					query?: string;
					type?: MemoryType;
					scope?: MemoryScope;
					memoryId?: string;
					limit?: number;
				}) {
					const mode = args.mode || "help";

					// Ensure DB is ready before any tool operation
					await ensureInitialized();

					try {
						switch (mode) {
							case "help": {
								return JSON.stringify({
									success: true,
									message: "Memory Usage Guide (self-hosted, embedded LanceDB)",
									commands: [
										{ command: "add", description: "Store a new memory", args: ["content", "type?", "scope?"] },
										{ command: "search", description: "Search memories", args: ["query", "scope?"] },
										{ command: "profile", description: "View user memories", args: ["query?"] },
										{ command: "list", description: "List recent memories", args: ["scope?", "limit?"] },
										{ command: "forget", description: "Remove a memory", args: ["memoryId", "scope?"] },
									],
									scopes: {
										user: "Cross-project preferences and knowledge",
										project: "Project-specific knowledge (default)",
									},
									types: [
										"project-brief",
										"architecture",
										"tech-context",
										"product-context",
										"session-summary",
										"progress",
										"project-config",
										"error-solution",
										"preference",
										"learned-pattern",
										"conversation",
									],
								});
							}

							case "add": {
								if (!args.content) {
									return JSON.stringify({ success: false, error: "content is required for add mode" });
								}

								// Privacy stripping — applied before extraction (bug fix §12)
								const sanitizedContent = stripPrivateContent(args.content);
								if (isFullyPrivate(args.content)) {
									return JSON.stringify({ success: false, error: "Cannot store fully private content" });
								}

								const scope = args.scope || "project";
								const containerTag = scope === "user" ? tags.user : tags.project;

								// Direct store call — replaces memoryClient.addMemory()
								const results = await store.ingest(
									[{ role: "user", content: sanitizedContent }],
									containerTag,
									{ metadata: args.type ? { type: args.type } : {} },
								);

								const first = results.find(
									(r) => r.event === "ADD" || r.event === "UPDATE"
								) ?? results[0];

								const id = first?.id ?? `mem-${Date.now()}`;
								return JSON.stringify({ success: true, message: `Memory added to ${scope} scope`, id, scope, type: args.type });
							}

							case "search": {
								if (!args.query) {
									return JSON.stringify({ success: false, error: "query is required for search mode" });
								}

								const scope = args.scope;

								if (scope === "user") {
									const result = await searchMemories(args.query, tags.user);
									return formatSearchResults(args.query, scope, result, args.limit);
								}

								if (scope === "project") {
									const result = await searchMemories(args.query, tags.project);
									return formatSearchResults(args.query, scope, result, args.limit);
								}

								// No scope = search both
								const [userResult, projectResult] = await Promise.all([
									searchMemories(args.query, tags.user),
									searchMemories(args.query, tags.project),
								]);

								const combined = [
									...(userResult.results || []).map((r) => ({ ...r, scope: "user" as const })),
									...(projectResult.results || []).map((r) => ({ ...r, scope: "project" as const })),
								].sort((a, b) => b.similarity - a.similarity);

								return JSON.stringify({
									success: true,
									query: args.query,
									count: combined.length,
									results: combined.slice(0, args.limit || 10).map((r) => ({
										id: r.id,
										content: r.memory,
										similarity: Math.round(r.similarity * 100),
										scope: r.scope,
									})),
								});
							}

							case "profile": {
								const result = await getProfile(tags.user);
								if (!result.success) {
									return JSON.stringify({ success: false, error: "Failed to get profile" });
								}
								return JSON.stringify({
									success: true,
									profile: {
										memories: result.profile?.static || [],
									},
								});
							}

							case "list": {
								const scope = args.scope || "project";
								const limit = args.limit || 20;
								const containerTag = scope === "user" ? tags.user : tags.project;

								const result = await listMemories(containerTag, limit);
								if (!result.success) {
									return JSON.stringify({ success: false, error: "Failed to list memories" });
								}

								return JSON.stringify({
									success: true,
									scope,
									count: result.memories.length,
									memories: result.memories.map((m) => ({
										id: m.id,
										content: m.summary,
										createdAt: m.createdAt,
										metadata: m.metadata,
									})),
								});
							}

							case "forget": {
								if (!args.memoryId) {
									return JSON.stringify({ success: false, error: "memoryId is required for forget mode" });
								}

								// Direct store call — replaces memoryClient.deleteMemory()
								await store.deleteMemory(args.memoryId);

								return JSON.stringify({
									success: true,
									message: `Memory ${args.memoryId} deleted`,
								});
							}

							default:
								return JSON.stringify({ success: false, error: `Unknown mode: ${mode}` });
						}
					} catch (error) {
						return JSON.stringify({
							success: false,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				},
			}),
		},

		event: async (input: { event: { type: string; properties?: unknown } }) => {
			// Run compaction check
			if (compactionHook) {
				await compactionHook.event(input);
			}

			// Clean up session cache on session deletion to prevent memory leaks
			if (input.event.type === "session.deleted") {
				const props = input.event.properties as Record<string, unknown> | undefined;
				const sessionInfo = props?.info as { id?: string } | undefined;
				if (sessionInfo?.id) {
					sessionCaches.delete(sessionInfo.id);
					log("event: session cache cleaned up", { sessionID: sessionInfo.id });
				}
			}

			if (!configured) return;

			// Ensure DB is initialized for event processing
			await ensureInitialized();

			// Capture streaming assistant text via message.part.updated
			if (input.event.type === "message.part.updated") {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const part = (input.event.properties as any)?.part;
				if (
					part &&
					part.type === "text" &&
					!part.synthetic &&
					typeof part.text === "string" && part.text.trim() &&
					part.sessionID && part.messageID
				) {
					updateAssistantTextBuffer(part.sessionID as string, part.messageID as string, part.text as string);
				}
			}

			// Auto-save: fire when an assistant message finishes with a terminal reason
			if (autoSaveHook && input.event.type === "message.updated") {
				const props = input.event.properties as Record<string, unknown> | undefined;
				const info = props?.info as Record<string, unknown> | undefined;
				if (
					info &&
					info.role === "assistant" &&
					typeof info.finish === "string" &&
					info.finish !== "tool-calls" &&
					!info.summary &&
					info.sessionID &&
					info.id
				) {
					log("auto-save: terminal finish detected", { finish: info.finish, sessionID: info.sessionID });

					const bufferedText = popAssistantText(info.sessionID as string, info.id as string);
					if (bufferedText) {
						injectFinalAssistantMessage({
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							info: info as any,
							parts: [{
								id: `buffered-text-${info.id}`,
								sessionID: info.sessionID as string,
								messageID: info.id as string,
								type: "text",
								text: bufferedText,
							}],
						});
					} else {
						log("auto-save: no buffered text for final message (may have been empty or tool-only)", {
							sessionID: info.sessionID,
							messageID: info.id,
						});
					}

					await autoSaveHook.onSessionIdle(info.sessionID as string);
				}
			}
		},
	};
};
