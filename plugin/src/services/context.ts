/**
 * Formats the [MEMORY] block from structured sections + semantic results.
 * Zero network calls, zero side effects — pure formatting.
 */

import { SIMILARITY_THRESHOLD } from "../config.js";
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

/**
 * Every memory type that can ever be rendered by a structured section or
 * Recent Sessions. Used to scope the structural-block fetch to ONLY these
 * types, so high-volume atomic types (learned-pattern, error-solution,
 * preference — which have no structural renderer at all) can no longer
 * starve the recency window that feeds this block. See issue #201.
 */
export const RENDERED_STRUCTURAL_TYPES: string[] = [
	...STRUCTURED_SECTIONS.flatMap((s) => s.types),
	...SESSION_SUMMARY_TYPES,
];

// ── Per-type soft caps — prevent any single type from crowding out others.
// Singletons (progress, active-context) are handled by aging rules and need
// no cap. Session-summary is capped separately (MAX_SESSION_SUMMARIES, plus
// the 3-newest slice below). Caps are soft: excess entries are simply sliced
// off after grouping, assuming the input is already sorted newest-first.
//
// Lives here (not in index.ts) so benchmark/src/pipeline/block-quality.ts can
// import it too — index.ts's exports are all scanned and invoked as plugin
// hooks by OpenCode's loader, so non-hook utilities can't safely live there.
export const PER_TYPE_CAPS: Record<string, number> = {
	"project-brief":        8,
	"project-config":       8,
	"architecture":         12,
	"architecture-pattern": 12,
	"tech-context":         8,
	"product-context":      8,
};

/**
 * Apply per-type soft caps in-place, slicing excess entries from each type.
 *
 * Assumes `byType[type]` is already sorted newest-first (the contract
 * `store.listStructured()` provides) — slicing keeps the first N entries,
 * i.e. the newest N, and drops the rest.
 */
export function applyPerTypeCaps(byType: Record<string, StructuredMemory[]>): void {
	for (const [type, cap] of Object.entries(PER_TYPE_CAPS)) {
		if (byType[type] && byType[type].length > cap) {
			byType[type] = byType[type].slice(0, cap);
		}
	}
}

/** Lowercase + collapse whitespace for cross-section duplicate detection. */
function normalizeForDedup(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function formatContextForPrompt(
	profile: ProfileResult | null,
	userMemories: MemoriesResponseMinimal,
	semanticResults: MemoriesResponseMinimal,
	byType?: Record<string, StructuredMemory[]>
): string {
	const parts: string[] = ["[MEMORY]"];

	// ── Semantic search hits — computed early for cross-section dedup ───────
	// (rendered later, under "Relevant to Current Task")
	const userResults = userMemories.results || [];
	const semanticItems = semanticResults.results || [];

	const allSemantic = [
		...userResults.map((r) => ({ ...r, _source: "user" as const })),
		...semanticItems.map((r) => ({ ...r, _source: "project" as const })),
	].sort((a, b) => b.similarity - a.similarity);

	// Apply displaySimilarityThreshold — filter out low-confidence results from display.
	// Note: retrieval still runs at similarityThreshold (0.45) for full recall;
	// this is a separate, higher display floor to reduce noise in the block.
	const displayThreshold = PLUGIN_CONFIG.displaySimilarityThreshold;
	const filteredSemantic = allSemantic.filter((m) => m.similarity >= displayThreshold);

	// Cross-section dedup (issue #201): a structural/session bullet whose content
	// already appears under "Relevant to Current Task" is skipped there — that
	// section renders with richer context (score, date, source snippet), so
	// showing the same fact twice is pure noise, not signal.
	const semanticContentSet = new Set(
		filteredSemantic
			.map((m) => normalizeForDedup(m.memory || m.chunk || ""))
			.filter(Boolean)
	);

	// ── Structured project sections ─────────────────────────────────────────
	if (byType) {
		for (const section of STRUCTURED_SECTIONS) {
			const items: StructuredMemory[] = [];
			for (const t of section.types) {
				if (byType[t]) items.push(...byType[t]);
			}
			if (items.length === 0) continue;

			const sectionLines: string[] = [];
			items.forEach((mem) => {
				const rawContent = mem.memory || mem.chunk || "";
				if (!rawContent) return;
				if (semanticContentSet.has(normalizeForDedup(rawContent))) return;
				// Apply per-section render cap (used by Active Context to prevent oversized blobs)
				const content = section.renderCap && rawContent.length > section.renderCap
					? rawContent.slice(0, section.renderCap) + "…"
					: rawContent;
				// architecture-pattern memories render with a '> pattern:' prefix for visual distinction
				const memType = (mem.metadata?.type as string | undefined) ?? "";
				if (memType === "architecture-pattern") {
					sectionLines.push(`> **pattern:** ${content}`);
				} else {
					sectionLines.push(`- ${content}`);
				}
			});

			if (sectionLines.length === 0) continue;
			parts.push(`\n## ${section.label}`);
			parts.push(...sectionLines);
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
				if (semanticContentSet.has(normalizeForDedup(raw))) return;
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
	if (filteredSemantic.length > 0) {
		parts.push("\n## Relevant to Current Task");
		filteredSemantic.forEach((mem) => {
			const pct = Math.round(mem.similarity * 100);
			const content = mem.memory || mem.chunk || "";
			if (!content) return;
			const dateTag = mem.date ? `, ${mem.date}` : "";
			parts.push(`- [${pct}%${dateTag}] ${content}`);
			const snippet = mem.chunk?.trim();
			if (snippet && snippet !== content && mem.similarity >= SIMILARITY_THRESHOLD) {
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
