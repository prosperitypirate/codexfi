"use client";

import { useState } from "react";
import { TypeBadge } from "./TypeBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { timeAgo } from "@/lib/utils";
import type { Memory, SearchResult } from "@/lib/types";

type Item = Memory | SearchResult;

function isSearchResult(item: Item): item is SearchResult {
  return "score" in item;
}

export function MemoryCard({
  item,
  onDelete,
}: {
  item: Item;
  onDelete?: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const type = item.metadata?.type ?? "unknown";
  const score = isSearchResult(item) ? item.score : undefined;
  const date = isSearchResult(item) ? item.created_at : (item as Memory).updated_at;

  async function handleConfirmDelete() {
    setDialogOpen(false);
    setDeleting(true);
    try {
      await fetch(`/api/memories/${item.id}`, { method: "DELETE" });
      onDelete?.(item.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        open={dialogOpen}
        title="Delete this memory?"
        description={`"${item.memory.slice(0, 120)}${item.memory.length > 120 ? "…" : ""}"`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDialogOpen(false)}
      />

      <div className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <TypeBadge type={type} />
            {score !== undefined && (
              <span className="text-xs font-mono text-zinc-500">
                {Math.round(score * 100)}% match
              </span>
            )}
            <span className="text-xs text-zinc-600 font-mono">{timeAgo(date)}</span>
          </div>

          {onDelete && (
            <button
              onClick={() => setDialogOpen(true)}
              disabled={deleting}
              className="shrink-0 text-xs font-mono px-2 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/50 transition-colors opacity-0 group-hover:opacity-100"
            >
              {deleting ? "…" : "delete"}
            </button>
          )}
        </div>

        <p className="mt-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
          {item.memory}
        </p>

        <div className="mt-2 text-xs text-zinc-600 font-mono truncate" title={item.id}>
          {item.id}
        </div>
      </div>
    </>
  );
}
