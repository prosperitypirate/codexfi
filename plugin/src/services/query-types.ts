/**
 * Query-intent detection for hybrid enumeration retrieval.
 *
 * Top-K semantic search cannot answer "list every X" / "across both projects"
 * questions once a corpus spans many sessions, so for those queries search()
 * also pulls every memory of the relevant types.
 */

/** Narrow set for pure enumeration queries ("list all", "every"). */
export const ENUMERATION_TYPES = [
	"tech-context", "preference", "learned-pattern", "error-solution", "project-config",
];

/** Wider set for cross-project synthesis — adds architecture for component/endpoint details. */
export const SYNTHESIS_TYPES = [...ENUMERATION_TYPES, "architecture"];

export const ENUMERATION_REGEX = /\b(list\s+all|list\s+every|all\s+the\s+\w+|every\s+(env|config|setting|preference|error|pattern|tool|developer|tech|project|decision|approach)|across\s+all(\s+sessions)?|complete\s+(list|history|tech\s+stack|stack)|entire\s+(history|list|project\s+history|tech\s+stack)|describe\s+all|enumerate\s+all|full\s+(list|history|tech\s+stack))\b/i;

export const WIDE_SYNTHESIS_REGEX = /\b(both\s+(projects?|the)|across\s+both|end[\s-]to[\s-]end|how\s+has.{0,30}evolved|sequence\s+of.{0,20}decisions?)\b/i;

/** Types to enumerate for this query, or undefined for plain semantic search. */
export function detectQueryTypes(query: string): string[] | undefined {
	if (WIDE_SYNTHESIS_REGEX.test(query)) return SYNTHESIS_TYPES;
	if (ENUMERATION_REGEX.test(query)) return ENUMERATION_TYPES;
	return undefined;
}
