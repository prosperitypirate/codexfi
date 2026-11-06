/**
 * Context builders for the Claude Code hooks.
 *
 * Two channels (Claude Code has no per-call system-prompt rewrite):
 *
 *   SessionStart     → the structured project picture (brief, architecture, tech,
 *                      progress, active context, recent sessions, user prefs)
 *   UserPromptSubmit → "Relevant to Current Task": semantic + enumeration hits for
 *                      THIS prompt, minus anything already injected this session.
 *
 * Memory Bank mode: when <project>/memory-bank exists (and memoryBank != "off"),
 * the structured sections are skipped — the bank carries them — and only sessions
 * newer than the bank's last save are shown.
 */

import { PLUGIN_CONFIG } from "../plugin-config.js";
import * as store from "../store.js";
import {
	applyPerTypeCaps,
	formatContextForPrompt,
	RENDERED_STRUCTURAL_TYPES,
	type MemoriesResponseMinimal,
	type StructuredMemory,
} from "../services/context.js";
import { detectMemoryBank, type MemoryBankInfo } from "../services/memory-bank.js";
import { detectQueryTypes } from "../services/query-types.js";
import { activeThresholds } from "../embedder.js";
import type { SearchResult } from "../types.js";

const SESSION_TYPES = new Set(["session-summary", "conversation"]);

/** Cap on type-matched memories shown for list-style prompts. */
const MAX_ENUMERATION_EXTRAS = 8;

/** Slack applied when comparing session dates to the bank's last-save time. */
const BANK_SLACK_MS = 60 * 60 * 1000;

export function memoryBankFor(cwd: string): MemoryBankInfo | null {
	if (PLUGIN_CONFIG.memoryBank === "off") return null;
	return detectMemoryBank(cwd);
}

async function structuredByType(projectTag: string): Promise<Record<string, StructuredMemory[]>> {
	const rows = await store.listStructured(projectTag, RENDERED_STRUCTURAL_TYPES, {
		limit: PLUGIN_CONFIG.maxStructuredMemories,
	});
	const byType: Record<string, StructuredMemory[]> = {};
	for (const r of rows) {
		const t = (r.metadata?.type as string | undefined) || "other";
		(byType[t] ??= []).push({
			id: r.id,
			memory: r.memory,
			similarity: 1,
			metadata: r.metadata,
			createdAt: r.created_at ?? undefined,
		});
	}
	applyPerTypeCaps(byType);
	return byType;
}

/** Keep only session summaries (optionally newer than `since`). */
function sessionsOnly(byType: Record<string, StructuredMemory[]>, since?: number): Record<string, StructuredMemory[]> {
	const out: Record<string, StructuredMemory[]> = {};
	for (const [t, items] of Object.entries(byType)) {
		if (!SESSION_TYPES.has(t)) continue;
		const kept = since === undefined
			? items
			: items.filter((m) => {
				const ts = m.createdAt ? Date.parse(m.createdAt) : NaN;
				return !Number.isNaN(ts) && ts > since - BANK_SLACK_MS;
			});
		if (kept.length > 0) out[t] = kept;
	}
	return out;
}

export interface SessionContext {
	text: string;
	injectedIds: string[];
	memoryBank: MemoryBankInfo | null;
	projectMemoryCount: number;
}

/**
 * Build the SessionStart block. Returns empty text when there is nothing to say
 * (brand-new project with no user preferences yet).
 */
export async function buildSessionContext(
	projectTag: string,
	userTag: string,
	cwd: string,
): Promise<SessionContext> {
	const bank = memoryBankFor(cwd);
	const full = await structuredByType(projectTag);
	const byType = bank ? sessionsOnly(full, bank.lastSavedAt) : full;

	const profileRows = PLUGIN_CONFIG.injectProfile ? await store.getProfile(userTag, PLUGIN_CONFIG.maxProfileItems) : [];
	const profile = { profile: { static: profileRows.map((p) => p.memory).filter(Boolean), dynamic: [] as string[] } };

	let text = formatContextForPrompt(profile, { results: [] }, { results: [] }, byType);
	if (text && bank) {
		text = text.replace(
			"[MEMORY]",
			"[MEMORY] (codexfi — supplements this project's memory-bank/; the bank is the curated source, these are automatic notes)",
		);
	}

	const injectedIds = [
		...Object.values(byType).flat().map((m) => m.id),
		...profileRows.map((p) => p.id),
	];
	const projectMemoryCount = Object.values(full).reduce((n, items) => n + items.length, 0);
	return { text, injectedIds, memoryBank: bank, projectMemoryCount };
}

function toMinimal(rows: SearchResult[]): MemoriesResponseMinimal {
	return {
		results: rows.map((r) => ({
			similarity: r.score,
			memory: r.memory,
			chunk: r.chunk,
			date: r.date ?? undefined,
		})),
	};
}

export interface PromptContext {
	text: string;
	injectedIds: string[];
}

/**
 * Build the per-turn "Relevant to Current Task" block for `prompt`.
 * `alreadyInjected` holds memory ids already shown in this session — they are
 * still in Claude's context, so repeating them only burns tokens.
 */
export async function buildPromptContext(
	prompt: string,
	projectTag: string,
	userTag: string,
	alreadyInjected: ReadonlySet<string> = new Set(),
): Promise<PromptContext> {
	const types = detectQueryTypes(prompt);
	const limit = PLUGIN_CONFIG.maxMemories;
	const [proj, user] = await Promise.all([
		store.search(prompt, projectTag, {
			limit: PLUGIN_CONFIG.maxProjectMemories,
			threshold: activeThresholds().similarity,
			recencyWeight: 0.15,
			...(types ? { types } : {}),
		}),
		store.search(prompt, userTag, {
			limit,
			threshold: activeThresholds().similarity,
			recencyWeight: 0.1,
		}),
	]);

	const fresh = (rows: SearchResult[]) => rows.filter((r) => !alreadyInjected.has(r.id));
	const { display, enumBase } = activeThresholds();

	// Enumeration extras ("list all / every X") are selected by type, not by
	// similarity — render them in their own capped section instead of faking a score.
	const isExtra = (r: SearchResult) => !!types && r.score === enumBase;
	const semantic = fresh(proj).filter((r) => !isExtra(r));
	const extras = fresh(proj).filter(isExtra).slice(0, MAX_ENUMERATION_EXTRAS);
	const userFresh = fresh(user);

	let text = formatContextForPrompt(null, toMinimal(userFresh), toMinimal(semantic), undefined);
	if (extras.length > 0) {
		const lines = extras.map((r) => `- [${(r.metadata?.type as string) ?? "memory"}${r.date ? `, ${r.date}` : ""}] ${r.memory}`);
		text = `${text || "[MEMORY]"}\n\n## Also on Record (matched by type for this list-style request)\n${lines.join("\n")}`;
	}
	const shown = [...userFresh, ...semantic].filter((r) => r.score >= display).concat(extras);
	return { text, injectedIds: shown.map((r) => r.id) };
}
