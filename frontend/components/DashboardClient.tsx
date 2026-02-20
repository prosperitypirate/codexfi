"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { StatsCard } from "./StatsCard";
import { TypeBadge } from "./TypeBadge";
import { ActivityFeed } from "./ActivityFeed";
import { timeAgo, ALL_TYPES, shortId, fmtUSD, fmtTokens } from "@/lib/utils";
import type { Stats, Project, Costs, Memory } from "@/lib/types";

const POLL_MS = 10_000;

export function DashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costs, setCosts] = useState<Costs | null>(null);
  const [recentMemories, setRecentMemories] = useState<Memory[]>([]);
  const [recentProjectId, setRecentProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, projectsRes, costsRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/projects"),
        fetch("/api/costs"),
      ]);

      if (!statsRes.ok || !projectsRes.ok || !costsRes.ok) {
        setError("Could not reach memory backend. Is it running?");
        return;
      }

      const [statsData, projectsData, costsData] = await Promise.all([
        statsRes.json(),
        projectsRes.json(),
        costsRes.json(),
      ]);

      setStats(statsData);
      setCosts(costsData);
      const projectList = projectsData.projects ?? [];
      setProjects(projectList);
      setError(null);

      // Fetch recent memories from first project
      const firstProject = projectList[0];
      if (firstProject) {
        setRecentProjectId(firstProject.user_id);
        try {
          const memRes = await fetch(
            `/api/memories?user_id=${encodeURIComponent(firstProject.user_id)}&limit=8`
          );
          if (memRes.ok) {
            const memData = await memRes.json();
            setRecentMemories((memData.results ?? []).slice(0, 8));
          }
        } catch { /* non-fatal */ }
      }

      setLastUpdated(new Date());
    } catch {
      setError("Could not reach memory backend. Is it running?");
    }
  }, []);

  // Expose fetchAll so CostResetButton can trigger immediate re-fetch
  const fetchAllRef = useRef(fetchAll);
  fetchAllRef.current = fetchAll;

  useEffect(() => {
    fetchAll();
    const poll = setInterval(fetchAll, POLL_MS);
    // Re-render relative timestamps every 30s
    const tick = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [fetchAll]);

  if (error) {
    return (
      <div className="p-8 text-red-400 font-mono text-sm">{error}</div>
    );
  }

  if (!stats || !costs) {
    return (
      <div className="p-8 font-mono text-sm text-zinc-500 animate-pulse">
        Loading…
      </div>
    );
  }

  const sortedTypes = Object.entries(stats.by_type).sort(([, a], [, b]) => b - a);
  const maxTypeCount = sortedTypes[0]?.[1] ?? 1;
  const recentProject = projects.find((p) => p.user_id === recentProjectId) ?? projects[0];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-mono">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Memory system overview</p>
        </div>
        {lastUpdated && (
          <p className="text-xs font-mono text-zinc-600">
            updated {lastUpdated.toLocaleTimeString()}
            <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse align-middle" />
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Memories" value={stats.total} />
        <StatsCard label="Projects" value={stats.projects} />
        <StatsCard label="User Scopes" value={stats.users} />
        <StatsCard
          label="Project Memories"
          value={stats.by_scope.project}
          sub={`+ ${stats.by_scope.user} cross-project`}
        />
      </div>

      {/* API Cost tracking */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-mono font-semibold text-zinc-400 uppercase tracking-wider">
              API Costs
            </h2>
            <p className="text-xs text-zinc-600 font-mono mt-0.5">
              Cumulative since last reset
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-mono font-bold text-white">
              {fmtUSD(costs.total_cost_usd)}
            </span>
            {/* Pass fetchAll so reset immediately re-fetches */}
            <CostResetButtonInline onAfterReset={fetchAll} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* xAI */}
          <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-zinc-300">
                xAI · grok-4-1-fast-non-reasoning
              </span>
              <span className="text-sm font-mono font-bold text-amber-400">
                {fmtUSD(costs.xai.cost_usd)}
              </span>
            </div>
            <div className="text-xs font-mono text-zinc-500 space-y-1">
              <div className="flex justify-between">
                <span>calls</span>
                <span className="text-zinc-400">{costs.xai.calls.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>input tokens</span>
                <span className="text-zinc-400">{fmtTokens(costs.xai.prompt_tokens)}</span>
              </div>
              <div className="flex justify-between">
                <span>cached tokens</span>
                <span className="text-zinc-400">{fmtTokens(costs.xai.cached_tokens)}</span>
              </div>
              <div className="flex justify-between">
                <span>output tokens</span>
                <span className="text-zinc-400">{fmtTokens(costs.xai.completion_tokens)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-zinc-700/50 text-zinc-600">
                <span>$0.20 / $0.05 cached / $0.50 per M</span>
              </div>
            </div>
          </div>

          {/* Voyage AI */}
          <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-zinc-300">
                Voyage AI · voyage-code-3
              </span>
              <span className="text-sm font-mono font-bold text-sky-400">
                {fmtUSD(costs.voyage.cost_usd)}
              </span>
            </div>
            <div className="text-xs font-mono text-zinc-500 space-y-1">
              <div className="flex justify-between">
                <span>calls</span>
                <span className="text-zinc-400">{costs.voyage.calls.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>tokens embedded</span>
                <span className="text-zinc-400">{fmtTokens(costs.voyage.tokens)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-zinc-700/50 text-zinc-600">
                <span>$0.18 per M tokens</span>
              </div>
            </div>
          </div>
        </div>

        {costs.last_updated && (
          <p className="text-xs text-zinc-700 font-mono mt-3 text-right">
            updated {new Date(costs.last_updated).toLocaleString()}
          </p>
        )}
      </div>

      {/* Live API activity feed */}
      <ActivityFeed />

      {/* Type breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-mono font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Memory Types
        </h2>
        <div className="space-y-3">
          {ALL_TYPES.map((type) => {
            const count = stats.by_type[type] ?? 0;
            if (count === 0) return null;
            const pct = Math.round((count / maxTypeCount) * 100);
            return (
              <div key={type} className="flex items-center gap-3">
                <div className="w-36 shrink-0">
                  <TypeBadge type={type} />
                </div>
                <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500/60 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-zinc-400 w-6 text-right">{count}</span>
              </div>
            );
          })}
          {stats.total === 0 && (
            <p className="text-sm text-zinc-600 font-mono">No memories yet.</p>
          )}
        </div>
      </div>

      {/* Recent memories */}
      {recentMemories.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono font-semibold text-zinc-400 uppercase tracking-wider">
              Recent — {recentProject?.name ?? (recentProject ? shortId(recentProject.user_id) : "")}
            </h2>
            {recentProject && (
              <Link
                href={`/projects/${encodeURIComponent(recentProject.user_id)}`}
                className="text-xs font-mono text-zinc-500 hover:text-emerald-400 transition-colors"
              >
                view all →
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {recentMemories.map((m) => (
              <div key={m.id} className="flex gap-3 items-start">
                <TypeBadge type={m.metadata?.type ?? "unknown"} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">{m.memory}</p>
                  <p className="text-xs text-zinc-600 font-mono mt-0.5">{timeAgo(m.updated_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects quick list */}
      {projects.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono font-semibold text-zinc-400 uppercase tracking-wider">
              All Scopes
            </h2>
            <Link
              href="/projects"
              className="text-xs font-mono text-zinc-500 hover:text-emerald-400 transition-colors"
            >
              view all →
            </Link>
          </div>
          <div className="space-y-2">
            {projects.slice(0, 5).map((p) => (
              <Link
                key={p.user_id}
                href={`/projects/${encodeURIComponent(p.user_id)}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                    p.scope === "user"
                      ? "text-pink-400 border-pink-500/30 bg-pink-500/10"
                      : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  }`}>
                    {p.scope}
                  </span>
                  <span className="text-sm font-mono text-zinc-300 truncate font-medium">
                    {p.name ?? shortId(p.user_id)}
                  </span>
                  {p.name && (
                    <span className="text-xs font-mono text-zinc-600 truncate hidden md:block">
                      {shortId(p.user_id)}
                    </span>
                  )}
                </div>
                <span className="text-sm font-mono text-zinc-500 shrink-0">{p.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Inline version of CostResetButton that accepts an onAfterReset callback
// instead of router.refresh() — works correctly inside a client component.
function CostResetButtonInline({ onAfterReset }: { onAfterReset: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirmReset() {
    setDialogOpen(false);
    setLoading(true);
    try {
      await fetch("/api/costs", { method: "POST" });
      onAfterReset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ConfirmDialogInline
        open={dialogOpen}
        title="Reset cost ledger?"
        description="This will zero out all accumulated token counts and USD totals. The action cannot be undone."
        confirmLabel="Reset"
        onConfirm={handleConfirmReset}
        onCancel={() => setDialogOpen(false)}
      />
      <button
        onClick={() => setDialogOpen(true)}
        disabled={loading}
        className="text-xs font-mono px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
      >
        {loading ? "resetting…" : "reset"}
      </button>
    </>
  );
}

// Minimal inline confirm dialog (avoids circular import with ConfirmDialog component)
function ConfirmDialogInline({
  open, title, description, confirmLabel, onConfirm, onCancel,
}: {
  open: boolean; title: string; description?: string;
  confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-base font-mono font-semibold text-white">{title}</h2>
          {description && <p className="text-sm font-mono text-zinc-400 leading-relaxed">{description}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="text-sm font-mono px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="text-sm font-mono px-4 py-2 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors">{confirmLabel ?? "Confirm"}</button>
        </div>
      </div>
    </div>
  );
}


