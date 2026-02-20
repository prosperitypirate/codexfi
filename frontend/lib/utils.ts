import type { MemoryType } from "./types";

export const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "project-brief":   { bg: "bg-blue-500/15",   text: "text-blue-400",   border: "border-blue-500/30" },
  "architecture":    { bg: "bg-purple-500/15",  text: "text-purple-400", border: "border-purple-500/30" },
  "tech-context":    { bg: "bg-cyan-500/15",    text: "text-cyan-400",   border: "border-cyan-500/30" },
  "product-context": { bg: "bg-emerald-500/15", text: "text-emerald-400",border: "border-emerald-500/30" },
  "progress":        { bg: "bg-amber-500/15",   text: "text-amber-400",  border: "border-amber-500/30" },
  "session-summary": { bg: "bg-orange-500/15",  text: "text-orange-400", border: "border-orange-500/30" },
  "error-solution":  { bg: "bg-red-500/15",     text: "text-red-400",    border: "border-red-500/30" },
  "preference":      { bg: "bg-pink-500/15",    text: "text-pink-400",   border: "border-pink-500/30" },
  "learned-pattern": { bg: "bg-indigo-500/15",  text: "text-indigo-400", border: "border-indigo-500/30" },
  "project-config":  { bg: "bg-zinc-500/15",    text: "text-zinc-400",   border: "border-zinc-500/30" },
  "unknown":         { bg: "bg-zinc-500/15",    text: "text-zinc-400",   border: "border-zinc-500/30" },
};

export function getTypeColor(type: string) {
  return TYPE_COLORS[type] ?? TYPE_COLORS["unknown"];
}

export const ALL_TYPES: MemoryType[] = [
  "project-brief", "architecture", "tech-context", "product-context",
  "progress", "session-summary", "error-solution", "preference",
  "learned-pattern", "project-config",
];

export function shortId(userId: string): string {
  // e.g. "opencode_project_abc12345def67890" → "abc12345"
  const parts = userId.split("_");
  const hash = parts[parts.length - 1] ?? userId;
  return hash.slice(0, 8);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function fmtUSD(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.0001) return `$${n.toFixed(8)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

export function fmtTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function timeAgo(iso: string): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}
