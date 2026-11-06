/**
 * RelevantToTaskCallout
 *
 * Highlights the "Relevant to Current Task" section of the [MEMORY] block —
 * the only section that re-runs semantic search on every prompt.
 *
 * SSR-safe: no "use client", no React hooks. Pure Tailwind + inline CSS.
 */
export function RelevantToTaskCallout() {
  return (
    <div className="not-prose mt-2 mb-6 ml-6 rounded-xl border border-[#a855f7]/30 bg-gradient-to-br from-[#a855f7]/[0.06] to-transparent p-5 shadow-[0_0_32px_-12px_rgba(168,85,247,0.3)]" style={{ borderLeft: "2px solid rgba(168,85,247,0.4)" }}>
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        {/* Live pulse indicator */}
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a855f7] opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#a855f7]" />
        </span>

        {/* Title */}
        <span
          className="text-base font-semibold"
          style={{
            background: "linear-gradient(135deg, #a855f7, #c084fc, #e879f9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Relevant to Current Task
        </span>

        {/* Badge */}
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-[#a855f7] border border-[#a855f7]/40 rounded-full px-2.5 py-0.5 bg-[#a855f7]/10 shrink-0">
          Live per prompt
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        The only section in the <code className="text-xs font-mono text-[#c084fc] bg-[#a855f7]/10 rounded px-1 py-0.5">[MEMORY]</code> block
        that runs on <em>every prompt</em>. All other sections — Project Brief, Architecture, Tech Context, etc. — are
        injected once at session start (and again after compaction). This section runs a fresh semantic search against your
        current prompt each time, so the right memories surface as topics shift mid-session.
      </p>

      {/* Sub-bullets */}
      <ul className="space-y-2.5">
        <li className="flex items-start gap-2.5 text-sm">
          <span className="mt-0.5 font-semibold text-[#a855f7] shrink-0">→</span>
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">Per-prompt re-search, never repeated</span> — as topics shift,
            different memories surface automatically, and anything already shown this session is skipped.
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-sm">
          <span className="mt-0.5 font-semibold text-[#a855f7] shrink-0">→</span>
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">Cross-scope</span> — merges project-scoped and user-scoped
            memories in a single ranked list by cosine similarity.
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-sm">
          <span className="mt-0.5 font-semibold text-[#a855f7] shrink-0">→</span>
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">Confidence-scored + source-traced</span> — each match shows
            a{" "}
            <code className="text-xs font-mono text-[#4ade80] bg-[#4ade80]/10 rounded px-1 py-0.5">[82%]</code>{" "}
            similarity score, and high-confidence matches include the source conversation snippet.
          </span>
        </li>
      </ul>
    </div>
  );
}
