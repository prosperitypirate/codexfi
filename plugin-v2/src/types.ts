/**
 * Zod schemas and TypeScript types for memory records and API responses.
 */

import { z } from "zod";

// ── Memory types ────────────────────────────────────────────────────────────────

export const MEMORY_TYPES = [
	"project-brief",
	"architecture",
	"tech-context",
	"product-context",
	"session-summary",
	"progress",
	"error-solution",
	"preference",
	"learned-pattern",
	"project-config",
	"conversation",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MemoryTypeSchema = z.enum(MEMORY_TYPES);

// ── Memory record (LanceDB row) ─────────────────────────────────────────────────

export const MemoryRecordSchema = z.object({
	id: z.string(),
	memory: z.string(),
	user_id: z.string(),
	vector: z.array(z.number()),
	metadata_json: z.string(),
	created_at: z.string(),
	updated_at: z.string(),
	hash: z.string(),
	chunk: z.string(),
	superseded_by: z.string(),
	type: z.string().optional(),
});

export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

// ── Extracted fact (from LLM) ───────────────────────────────────────────────────

export const ExtractedFactSchema = z.object({
	memory: z.string(),
	type: z.string(),
	chunk: z.string().optional(),
});

export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

// ── Search result ───────────────────────────────────────────────────────────────

export const SearchResultSchema = z.object({
	id: z.string(),
	memory: z.string(),
	chunk: z.string(),
	score: z.number(),
	metadata: z.record(z.string(), z.unknown()),
	created_at: z.string().nullable(),
	date: z.string().nullable(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

// ── Store operation results ─────────────────────────────────────────────────────

export const IngestResultSchema = z.object({
	id: z.string(),
	memory: z.string(),
	event: z.enum(["ADD", "UPDATE"]),
});

export type IngestResult = z.infer<typeof IngestResultSchema>;

// ── Memory metadata ─────────────────────────────────────────────────────────────

export const MemoryMetadataSchema = z.object({
	type: z.string().optional(),
	date: z.string().optional(),
	condensed_from: z.string().optional(),
	source: z.string().optional(),
}).passthrough();

export type MemoryMetadata = z.infer<typeof MemoryMetadataSchema>;

// ── Message format (conversation input) ─────────────────────────────────────────

export const MessageSchema = z.object({
	role: z.string(),
	content: z.union([
		z.string(),
		z.array(z.object({
			type: z.string(),
			text: z.string().optional(),
		}).passthrough()),
	]),
});

export type Message = z.infer<typeof MessageSchema>;

// ── Extraction mode ─────────────────────────────────────────────────────────────

export type ExtractionMode = "normal" | "summary" | "init";
