"use client";

import { useState, useEffect, useRef } from "react";

interface ActivityEntry {
  ts: string;
  api: "xai" | "voyage";
  model: string;
  operation: string;
  prompt_tokens: number | null;
  cached_tokens: number | null;
  completion_tokens: number | null;
  tokens: number | null;
  cost_usd: number;
}

function fmtUSD(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.0001) return `$${n.toFixed(8)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgoShort(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [newCount, setNewCount] = useState(0);
  const prevLengthRef = useRef(0);
  const [, setTick] = useState(0); // forces re-render for relative timestamps

  async function fetchActivity() {
    try {
      const res = await fetch("/api/activity?limit=30");
      if (!res.ok) return;
      const data = await res.json();
      const incoming: ActivityEntry[] = data.entries ?? [];
      setEntries(incoming);
      const added = incoming.length - prevLengthRef.current;
      if (added > 0 && prevLengthRef.current > 0) {
        setNewCount((c) => c + added);
        setTimeout(() => setNewCount(0), 2000);
      }
      prevLengthRef.current = incoming.length;
    } catch {
      // silently ignore fetch errors
    }
  }

  useEffect(() => {
    fetchActivity();
    const pollInterval = setInterval(fetchActivity, 4000);
    const tickInterval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
    };
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-mono font-semibold text-zinc-400 uppercase tracking-wider">
            API Activity
          </h2>
          {/* Live pulse */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          {newCount > 0 && (
            <span className="text-xs font-mono text-emerald-400 animate-pulse">
              +{newCount} new
            </span>
          )}
        </div>
        <span className="text-xs font-mono text-zinc-600">
          polling every 4s · last {entries.length} calls
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs font-mono text-zinc-600 py-4 text-center">
          No API calls recorded yet this session.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          {/* Header */}
          <div className="grid grid-cols-[6rem_3.5rem_5.5rem_auto_5rem_5.5rem] gap-x-3 px-3 py-1.5 bg-zinc-800/50 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            <span>Time</span>
            <span>API</span>
            <span>Operation</span>
            <span>Tokens</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Model</span>
          </div>

          <div className="divide-y divide-zinc-800/50 max-h-72 overflow-y-auto">
            {entries.map((e, i) => (
              <div
                key={`${e.ts}-${i}`}
                className={`grid grid-cols-[6rem_3.5rem_5.5rem_auto_5rem_5.5rem] gap-x-3 px-3 py-2 text-xs font-mono transition-colors ${
                  i === 0 ? "bg-zinc-800/30" : "hover:bg-zinc-800/20"
                }`}
              >
                {/* Time */}
                <span className="text-zinc-500 truncate">{timeAgoShort(e.ts)}</span>

                {/* API badge */}
                <span className={`font-semibold ${
                  e.api === "xai" ? "text-amber-400" : "text-sky-400"
                }`}>
                  {e.api === "xai" ? "xAI" : "Voyage"}
                </span>

                {/* Operation */}
                <span className="text-zinc-400 truncate">{e.operation}</span>

                {/* Tokens detail */}
                <span className="text-zinc-500 truncate">
                  {e.api === "xai"
                    ? `${fmtTokens(e.prompt_tokens)} in · ${fmtTokens(e.cached_tokens)} cached · ${fmtTokens(e.completion_tokens)} out`
                    : `${fmtTokens(e.tokens)} tokens`
                  }
                </span>

                {/* Cost */}
                <span className={`text-right ${
                  e.api === "xai" ? "text-amber-400/80" : "text-sky-400/80"
                }`}>
                  {fmtUSD(e.cost_usd)}
                </span>

                {/* Model (truncated) */}
                <span className="text-zinc-600 text-right truncate" title={e.model}>
                  {e.model.split("-").slice(0, 3).join("-")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
