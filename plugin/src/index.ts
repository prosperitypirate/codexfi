import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { memoryClient } from "./services/client.js";
import { formatContextForPrompt, type StructuredMemory } from "./services/context.js";
import { getTags, getDisplayNames } from "./services/tags.js";
import { stripPrivateContent, isFullyPrivate } from "./services/privacy.js";
import { createCompactionHook, type CompactionContext } from "./services/compaction.js";
import { createAutoSaveHook, updateMessageCache } from "./services/auto-save.js";

import { isConfigured, CONFIG } from "./config.js";
import { log } from "./services/logger.js";
import type { MemoryScope, MemoryType } from "./types/index.js";

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`]+`/g;

// Source file extensions that indicate an existing codebase
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
    // Check for root markers first (fast path)
    for (const marker of ROOT_MARKERS) {
      if (existsSync(join(directory, marker))) return true;
    }
    // Check top-level files for code extensions
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

// Key files to read for silent project auto-init (in priority order, capped per file)
const INIT_FILES = [
  { name: "README.md",          maxChars: 3000 },
  { name: "README.rst",         maxChars: 3000 },
  { name: "package.json",       maxChars: 2000 },
  { name: "Cargo.toml",         maxChars: 2000 },
  { name: "go.mod",             maxChars: 1000 },
  { name: "pyproject.toml",     maxChars: 2000 },
  { name: "docker-compose.yml", maxChars: 1500 },
  { name: "docker-compose.yaml",maxChars: 1500 },
  { name: "tsconfig.json",      maxChars: 1000 },
  { name: ".env.example",       maxChars: 500  },
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
  log("auto-init: sending project files for extraction", {
    files: sections.length,
    chars: content.length,
  });

  const result = await memoryClient.addMemoryFromProjectFiles(content, tags.project);
  log("auto-init: extraction done", { success: result.success, count: result.count });
}

const MEMORY_KEYWORD_PATTERN = new RegExp(`\\b(${CONFIG.keywordPatterns.join("|")})\\b`, "i");

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

export const MemoryPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  const tags = getTags(directory);
  const displayNames = getDisplayNames(directory);
  const injectedSessions = new Set<string>();
  log("Plugin init", { directory, tags, displayNames, configured: isConfigured() });

  if (!isConfigured()) {
    log("Plugin disabled - memory server URL not configured");
  } else {
    // Fire-and-forget: register human-readable names so the web UI can display them
    memoryClient.registerNames(tags.project, displayNames.project, tags.user, displayNames.user)
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
              if (model.limit?.context) {
                modelLimits.set(`${provider.id}/${modelId}`, model.limit.context);
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
    isConfigured() && ctx.client
      ? createCompactionHook(ctx as CompactionContext, tags, {
          threshold: CONFIG.compactionThreshold,
          getModelLimit,
        })
      : null;

  const autoSaveHook =
    isConfigured() && ctx.client
      ? createAutoSaveHook(tags)
      : null;

  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      updateMessageCache(output.messages);
    },

    "chat.message": async (input, output) => {
      if (!isConfigured()) return;

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

        const isFirstMessage = !injectedSessions.has(input.sessionID);

        if (isFirstMessage) {
          injectedSessions.add(input.sessionID);

          const [profileResult, userMemoriesResult, projectMemoriesListResult, projectSearchResult] = await Promise.all([
            memoryClient.getProfile(tags.user, userMessage),
            memoryClient.searchMemories(userMessage, tags.user),
            memoryClient.listMemories(tags.project, CONFIG.maxStructuredMemories),
            // Semantic search on project scope so scored results (with chunks) reach
            // the "Relevant to Current Task" section for high-confidence hits.
            memoryClient.searchMemories(userMessage, tags.project),
          ]);

          const profile = profileResult.success ? profileResult : null;
          const userMemories = userMemoriesResult.success ? userMemoriesResult : { results: [] };
          const projectMemoriesList = projectMemoriesListResult.success
            ? projectMemoriesListResult
            : { memories: [] };
          const projectSearch = projectSearchResult.success ? projectSearchResult : { results: [] };

          const allProjectMemories = projectMemoriesList.memories || [];

          // ── Auto-init: no project memory yet ──────────────────────────────
          // Silently read key project files in the background and send for extraction.
          // Nothing is injected into the conversation — completely transparent to the user.
          if (allProjectMemories.length === 0) {
            if (detectExistingCodebase(directory)) {
              triggerSilentAutoInit(directory, tags).catch(
                (err) => log("auto-init: failed", { error: String(err) })
              );
            }
            // For blank directories: do nothing — memories accumulate from conversation naturally.
            // Fall through and let the session proceed with no memory injection.
          }

          // ── Partition project memories by type ─────────────────────────────
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

          // ── "Relevant to Current Task" — always comprehensive, semantic when possible ──
          //
          // Two guarantees that are independent of each other:
          //
          //   1. ALWAYS: recent project memories appear as a baseline so "hi" or
          //      "let's start" still gives the agent useful context about what was
          //      worked on last.  Recent == almost always relevant.
          //
          //   2. ADDITIONALLY: strong semantic hits (≥40%) are surfaced first with
          //      their chunk snippets so the agent can read exact values when the
          //      user's opener is specific enough to match something.
          //
          const SEMANTIC_THRESHOLD = 0.4;

          // Collect strong hits from both scopes (these may carry chunk snippets)
          const semanticHits = [
            ...(userMemoriesResult.results || []),
            ...(projectSearch.results || []),
          ].filter((r) => r.similarity >= SEMANTIC_THRESHOLD);

          // Recent project memories as a reliable baseline — exclude any already
          // covered by a semantic hit so nothing appears twice.
          const semanticIds = new Set(semanticHits.map((r) => r.id));
          const recentBaseline = allProjectMemories
            .slice(0, CONFIG.maxMemories)
            .filter((m) => !semanticIds.has(m.id))
            .map((m) => ({
              id: m.id,
              memory: m.summary,
              chunk: "",
              // 0.45 — shown in "Relevant to Current Task" but below the 0.55
              // chunk-snippet threshold, so no spurious source block appears.
              similarity: 0.45,
              metadata: m.metadata as Record<string, unknown> | undefined,
            }));

          // Semantic hits go first (higher scores, may carry chunks); recent
          // baseline fills remaining slots.
          const semanticResults = {
            results: [...semanticHits, ...recentBaseline],
          };

          const memoryContext = formatContextForPrompt(
            profile,
            { results: [] },   // user profile handled separately inside formatContextForPrompt
            semanticResults,
            byType
          );

          if (memoryContext) {
            const contextPart: Part = {
              id: `memory-context-${Date.now()}`,
              sessionID: input.sessionID,
              messageID: output.message.id,
              type: "text",
              text: memoryContext,
              synthetic: true,
            };

            output.parts.unshift(contextPart);

            const duration = Date.now() - start;
            log("chat.message: context injected", {
              duration,
              contextLength: memoryContext.length,
              typeCount: Object.keys(byType).length,
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
          "Manage and query the persistent memory system (self-hosted). Use 'search' to find relevant memories, 'add' to store new knowledge, 'profile' to view user memories, 'list' to see recent memories, 'forget' to remove a memory.",
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

          try {
            switch (mode) {
              case "help": {
                return JSON.stringify({
                  success: true,
                  message: "Memory Usage Guide (self-hosted)",
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

                const sanitizedContent = stripPrivateContent(args.content);
                if (isFullyPrivate(args.content)) {
                  return JSON.stringify({ success: false, error: "Cannot store fully private content" });
                }

                const scope = args.scope || "project";
                const containerTag = scope === "user" ? tags.user : tags.project;

                const result = await memoryClient.addMemory(sanitizedContent, containerTag, { type: args.type });

                if (!result.success) {
                  return JSON.stringify({ success: false, error: result.error || "Failed to add memory" });
                }

                return JSON.stringify({ success: true, message: `Memory added to ${scope} scope`, id: result.id, scope, type: args.type });
              }

              case "search": {
                if (!args.query) {
                  return JSON.stringify({ success: false, error: "query is required for search mode" });
                }

                const scope = args.scope;

                if (scope === "user") {
                  const result = await memoryClient.searchMemories(args.query, tags.user);
                  if (!result.success) return JSON.stringify({ success: false, error: result.error });
                  return formatSearchResults(args.query, scope, result, args.limit);
                }

                if (scope === "project") {
                  const result = await memoryClient.searchMemories(args.query, tags.project);
                  if (!result.success) return JSON.stringify({ success: false, error: result.error });
                  return formatSearchResults(args.query, scope, result, args.limit);
                }

                // No scope = search both
                const [userResult, projectResult] = await Promise.all([
                  memoryClient.searchMemories(args.query, tags.user),
                  memoryClient.searchMemories(args.query, tags.project),
                ]);

                if (!userResult.success || !projectResult.success) {
                  return JSON.stringify({ success: false, error: userResult.error || projectResult.error });
                }

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
                const result = await memoryClient.getProfile(tags.user, args.query);
                if (!result.success) {
                  return JSON.stringify({ success: false, error: result.error });
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

                const result = await memoryClient.listMemories(containerTag, limit);
                if (!result.success) {
                  return JSON.stringify({ success: false, error: result.error });
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

                const result = await memoryClient.deleteMemory(args.memoryId);
                if (!result.success) {
                  return JSON.stringify({ success: false, error: result.error });
                }

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

      // Auto-save: fire when an assistant message finishes with a terminal reason.
      // finish="tool-calls" = mid-turn tool usage, skip.
      // finish="stop" (or any other non-tool-calls value) = turn truly done, extract.
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
          autoSaveHook.onSessionIdle(info.sessionID as string);
        }
      }
    },
  };
};

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
