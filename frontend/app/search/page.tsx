"use client";

import { useState, useEffect } from "react";
import { MemoryCard } from "@/components/MemoryCard";
import { shortId } from "@/lib/utils";
import type { SearchResult, Project } from "@/lib/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects ?? []);
        if ((d.projects ?? []).length > 0) {
          setUserId(d.projects[0].user_id);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !userId) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, user_id: userId, limit: 10 }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white font-mono">Search</h1>
        <p className="text-sm text-zinc-500 mt-1">Semantic search across memories</p>
      </div>

      <form onSubmit={handleSearch} className="space-y-3">
        {/* Project selector */}
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm font-mono text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors"
        >
          {projects.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              [{p.scope}] {shortId(p.user_id)} — {p.count} memories
            </option>
          ))}
        </select>

        {/* Query input */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search memories semantically..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !query.trim() || !userId}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-mono font-medium transition-colors"
          >
            {loading ? "…" : "Search"}
          </button>
        </div>
      </form>

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <div className="text-sm font-mono text-zinc-600 py-8 text-center">
          No results found.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-zinc-500">
            {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
          </p>
          {results.map((r) => (
            <MemoryCard key={r.id} item={r} />
          ))}
        </div>
      )}
    </div>
  );
}
