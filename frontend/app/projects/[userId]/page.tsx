"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MemoryCard } from "@/components/MemoryCard";
import { TypeBadge } from "@/components/TypeBadge";
import { shortId } from "@/lib/utils";
import { ALL_TYPES } from "@/lib/utils";
import type { Memory } from "@/lib/types";

export default function ProjectDetailPage() {
  const params = useParams();
  const userId = decodeURIComponent(params.userId as string);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const [memoriesRes, namesRes] = await Promise.all([
        fetch(`/api/memories?user_id=${encodeURIComponent(userId)}&limit=200`),
        fetch("/api/names"),
      ]);
      if (!memoriesRes.ok) throw new Error(await memoriesRes.text());
      const data = await memoriesRes.json();
      setMemories(data.results ?? []);
      if (namesRes.ok) {
        const names: Record<string, string> = await namesRes.json();
        setDisplayName(names[userId] ?? null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  function handleDelete(id: string) {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  const scope = userId.includes("_user_") ? "user" : "project";

  const filtered = memories.filter((m) => {
    const typeMatch = filter === "all" || m.metadata?.type === filter;
    const searchMatch =
      search === "" ||
      m.memory.toLowerCase().includes(search.toLowerCase());
    return typeMatch && searchMatch;
  });

  // Count by type for filter tabs
  const typeCounts = memories.reduce<Record<string, number>>((acc, m) => {
    const t = m.metadata?.type ?? "unknown";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm font-mono text-zinc-500">
        <Link href="/projects" className="hover:text-zinc-300 transition-colors">
          Projects
        </Link>
        <span>/</span>
        <span className="text-zinc-300">{shortId(userId)}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded border shrink-0 ${
              scope === "user"
                ? "text-pink-400 border-pink-500/30 bg-pink-500/10"
                : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
            }`}>
              {scope}
            </span>
            <h1 className="text-xl font-bold text-white font-mono">
              {displayName ?? shortId(userId)}
            </h1>
          </div>
          {displayName && (
            <p className="text-xs font-mono text-zinc-500 mb-0.5">{shortId(userId)}</p>
          )}
          <p className="text-xs font-mono text-zinc-600 break-all">{userId}</p>
        </div>
        <span className="text-2xl font-bold text-white font-mono">{memories.length}</span>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Filter memories..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
      />

      {/* Type filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
            filter === "all"
              ? "bg-zinc-700 border-zinc-600 text-white"
              : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          all ({memories.length})
        </button>
        {ALL_TYPES.filter((t) => typeCounts[t] > 0).map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1.5 rounded-lg border transition-colors ${
              filter === type
                ? "bg-zinc-700 border-zinc-600"
                : "bg-zinc-900 border-zinc-800 opacity-70 hover:opacity-100"
            }`}
          >
            <TypeBadge type={type} />
            <span className="text-zinc-400">{typeCounts[type]}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="text-sm font-mono text-zinc-500 py-8 text-center">Loading…</div>
      )}
      {error && (
        <div className="text-sm font-mono text-red-400 py-4">{error}</div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-sm font-mono text-zinc-600 py-8 text-center">
          No memories match.
        </div>
      )}
      {!loading && !error && (
        <div className="space-y-3">
          {filtered.map((m) => (
            <MemoryCard key={m.id} item={m} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
