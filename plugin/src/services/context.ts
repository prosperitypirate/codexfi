/**
 * Formats the [MEMORY] block from structured sections + semantic results.
 * Zero network calls, zero side effects — pure formatting.
 */

import { PLUGIN_CONFIG } from "../plugin-config.js";

export interface StructuredMemory {
	id: string;
	memory?: string;
	chunk?: string;
	similarity?: number;
	metadata?: Record<string, unknown>;
	date?: string;
	createdAt?: string;
}

export interface ProfileResult {
	profile: {
		static: string[];
		dynamic: string[];
	} | null;
}

export interface MemoryResultMinimal {
	similarity: number;
	memory?: string;
	chunk?: string;
	date?: string;
}

export interface MemoriesResponseMinimal {
	results?: MemoryResultMinimal[];
}

// Ordered sections for the structured [MEMORY] block.
const STRUCTURED_SECTIONS: Array<{ label: string; types: string[]; renderCap?: number }> = [
	{ label: "Project Brief",    types: ["project-brief", "project-config"] },
	{ label: "Architecture",     types: ["architecture", "architecture-pattern"] },
	{ label: "Tech Context",     types: ["tech-context"] },
	{ label: "Product Context",  types: ["product-context"] },
	{ label: "Progress & Status", types: ["progress"] },
	// Active Context: latest singleton memory — capped at 2,000 chars to prevent
	// oversized memories from bloating the block (edge case: user manually adds one)
	{ label: "Active Context",   types: ["active-context"], renderCap: 2000 },
];

const SESSION_SUMMARY_TYPES = ["session-summary", "conversation"];

export function formatContextForPrompt(
	profile: ProfileResult | null,
	userMemories: MemoriesResponseMinimal,
	semanticResults: MemoriesResponseMinimal,
	byType?: Record<string, StructuredMemory[]>
): string {
	const parts: string[] = ["[MEMORY]"];

	// ── Structured project sections ─────────────────────────────────────────
	if (byType) {
		for (const section of STRUCTURED_SECTIONS) {
			const items: StructuredMemory[] = [];
			for (const t of section.types) {
				if (byType[t]) items.push(...byType[t]);
			}
			if (items.length === 0) continue;

			parts.push(`\n## ${section.label}`);
			items.forEach((mem) => {
				const rawContent = mem.memory || mem.chunk || "";
				if (!rawContent) return;
				// Apply per-section render cap (used by Active Context to prevent oversized blobs)
				const content = section.renderCap && rawContent.length > section.renderCap
					? rawContent.slice(0, section.renderCap) + "…"
					: rawContent;
				// architecture-pattern memories render with a '> pattern:' prefix for visual distinction
				const memType = (mem.metadata?.type as string | undefined) ?? "";
				if (memType === "architecture-pattern") {
					parts.push(`> **pattern:** ${content}`);
				} else {
					parts.push(`- ${content}`);
				}
			});
		}

		// Recent sessions — up to 3 most recent session-summaries, newest first.
		// Latest entry is full text; 2nd truncated at 600 chars; 3rd at 300 chars.
		// Condensation is pure string truncation — no LLM call, zero latency cost.
		const sessionItems: StructuredMemory[] = [];
		for (const t of SESSION_SUMMARY_TYPES) {
			if (byType[t]) sessionItems.push(...byType[t]);
		}
		if (sessionItems.length > 0) {
			const sorted = [...sessionItems].sort((a, b) => {
				const ta = a.createdAt ?? "";
				const tb = b.createdAt ?? "";
				return tb.localeCompare(ta);
			});
			const recentSessions = sorted.slice(0, 3);
			const sessionParts: string[] = [];

			recentSessions.forEach((mem, idx) => {
				const raw = mem.memory || mem.chunk || "";
				if (!raw) return;
				let content: string;
				if (idx === 0) {
					content = raw;                          // latest: full text
				} else if (idx === 1) {
					content = raw.length > 600 ? raw.slice(0, 600) + "…" : raw;
				} else {
					content = raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
				}
				sessionParts.push(`- ${content}`);
			});

			if (sessionParts.length > 0) {
				parts.push("\n## Recent Sessions");
				parts.push(...sessionParts);
			}
		}
	}

	// ── User profile / preferences (user-scoped) ────────────────────────────
	if (PLUGIN_CONFIG.injectProfile && profile?.profile) {
		const { static: staticFacts } = profile.profile;
		if (staticFacts.length > 0) {
			parts.push("\n## User Preferences");
			staticFacts.slice(0, PLUGIN_CONFIG.maxProfileItems).forEach((fact) => {
				parts.push(`- ${fact}`);
			});
		}
	}

	// ── Semantic search hits — relevant to current task ─────────────────────
	const userResults = userMemories.results || [];
	const semanticItems = semanticResults.results || [];

	const allSemantic = [
		...userResults.map((r) => ({ ...r, _source: "user" as const })),
		...semanticItems.map((r) => ({ ...r, _source: "project" as const })),
	].sort((a, b) => b.similarity - a.similarity);

	if (allSemantic.length > 0) {
		parts.push("\n## Relevant to Current Task");
		allSemantic.forEach((mem) => {
			const pct = Math.round(mem.similarity * 100);
			const content = mem.memory || mem.chunk || "";
			if (!content) return;
			const dateTag = mem.date ? `, ${mem.date}` : "";
			parts.push(`- [${pct}%${dateTag}] ${content}`);
			const snippet = mem.chunk?.trim();
			if (snippet && snippet !== content && mem.similarity >= 0.55) {
				const isTranscript =
					snippet.startsWith("[assistant]") || snippet.startsWith("[user]");
				if (!isTranscript) {
					const truncated = snippet.length > 400 ? snippet.slice(0, 400) + "…" : snippet;
					parts.push(`  > ${truncated.replace(/\n/g, "\n  > ")}`);
				}
			}
		});
	}

	if (parts.length === 1) return "";

	return parts.join("\n");
}
