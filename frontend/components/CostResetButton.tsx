"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./ConfirmDialog";

export function CostResetButton() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirmReset() {
    setDialogOpen(false);
    setLoading(true);
    try {
      await fetch("/api/costs", { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ConfirmDialog
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
