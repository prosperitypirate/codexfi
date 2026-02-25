/**
 * Privacy tag stripping — removes <private>...</private> content before storage.
 *
 * Applied in ALL 4 ingestion paths (memory tool add, auto-save, compaction, init).
 * This fixes the privacy stripping gap from the original plugin (see design doc §12).
 */

export function containsPrivateTag(content: string): boolean {
	return /<private>[\s\S]*?<\/private>/i.test(content);
}

export function stripPrivateContent(content: string): string {
	return content.replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]");
}

export function isFullyPrivate(content: string): boolean {
	const stripped = stripPrivateContent(content).trim();
	return stripped === "[REDACTED]" || stripped === "";
}
