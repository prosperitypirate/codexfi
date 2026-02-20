import { CONFIG } from "../config.js";

export interface StructuredMemory {
  id: string;
  memory?: string;
  chunk?: string;
  similarity?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

interface ProfileResult {
  profile: {
    static: string[];
    dynamic: string[];
  } | null;
}

interface MemoryResultMinimal {
  similarity: number;
  memory?: string;
  chunk?: string;
}

interface MemoriesResponseMinimal {
  results?: MemoryResultMinimal[];
}

// Ordered sections for the structured [MEMORY] block.
// Each entry maps a display label → the memory type keys that belong there.
const STRUCTURED_SECTIONS: Array<{ label: string; types: string[] }> = [
  { label: "Project Brief",  types: ["project-brief", "project-config"] },
  { label: "Architecture",   types: ["architecture"] },
  { label: "Tech Context",   types: ["tech-context"] },
  { label: "Product Context", types: ["product-context"] },
  { label: "Progress & Status", types: ["progress"] },
];

// Only the most recent session-summary is shown — surfaced separately.
const SESSION_SUMMARY_TYPES = ["session-summary", "conversation"];

export function formatContextForPrompt(
  profile: ProfileResult | null,
  userMemories: MemoriesResponseMinimal,
  semanticResults: MemoriesResponseMinimal,
  byType?: Record<string, StructuredMemory[]>
): string {
  const parts: string[] = ["[MEMORY]"];

  // ── Structured project sections ────────────────────────────────────────────
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
      // Sort by createdAt desc, take the most recent one
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

  // ── User profile / preferences (user-scoped) ───────────────────────────────
  if (CONFIG.injectProfile && profile?.profile) {
    const { static: staticFacts } = profile.profile;
    if (staticFacts.length > 0) {
      parts.push("\n## User Preferences");
      staticFacts.slice(0, CONFIG.maxProfileItems).forEach((fact) => {
        parts.push(`- ${fact}`);
      });
    }
  }

  // ── Semantic search hits — relevant to current task ────────────────────────
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
      parts.push(`- [${pct}%] ${content}`);
      // Append a truncated source snippet for high-confidence hits (≥55%) so
      // Claude can read exact values (config numbers, error strings, function
      // names) that are compressed out of the memory summary.
      // Skipped for low-confidence results to keep token usage reasonable.
      const snippet = mem.chunk?.trim();
      if (snippet && snippet !== content && mem.similarity >= 0.55) {
        const truncated = snippet.length > 400 ? snippet.slice(0, 400) + "…" : snippet;
        parts.push(`  > ${truncated.replace(/\n/g, "\n  > ")}`);
      }
    });
  }

  if (parts.length === 1) return "";

  return parts.join("\n");
}
