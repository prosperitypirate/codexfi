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
const STRUCTURED_SECTIONS: Array<{ label: string; types: string[] }> = [
	{ label: "Project Brief",    types: ["project-brief", "project-config"] },
	{ label: "Architecture",     types: ["architecture"] },
	{ label: "Tech Context",     types: ["tech-context"] },
	{ label: "Product Context",  types: ["product-context"] },
	{ label: "Progress & Status", types: ["progress"] },
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
				const content = mem.memory || mem.chunk || "";
				if (content) parts.push(`- ${content}`);
			});
		}

		// Last session — most recent session-summary only
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
			const latest = sorted[0];
			const content = latest?.memory || latest?.chunk || "";
			if (content) {
				parts.push("\n## Last Session");
				parts.push(`- ${content}`);
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
