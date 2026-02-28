/**
 * Animated diagram showing four simultaneous database fetches fanning out from a user message on Turn 1.
 * @component
 */
export function DocsParallelFetch() {
  return (
    <svg viewBox="0 0 520 220" width="100%" className="mx-auto w-full max-w-3xl" role="img" aria-label="A diagram showing four simultaneous database fetches fanning out from a user message on Turn 1.">
      <title>Parallel Fetch Diagram</title>
      <defs>
        <filter id="glow-pf">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrow-pf-1" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#c084fc" />
        </marker>
        <marker id="arrow-pf-2" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#a855f7" />
        </marker>
        <marker id="arrow-pf-3" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#4ade80" />
        </marker>
        <style>{`
          .fan-line-1-pf { stroke-dasharray: 8 6; stroke: #c084fc; stroke-width: 1.5; }
          .fan-line-2-pf { stroke-dasharray: 8 6; stroke: #a855f7; stroke-width: 1.5; }
          .conv-line-pf { stroke-dasharray: 8 6; stroke: #4ade80; stroke-width: 1.5; opacity: 0.7; }
          @media (prefers-reduced-motion: no-preference) {
            .fan-line-1-pf, .fan-line-2-pf { animation: dashFlow-pf 0.8s linear infinite; }
            .conv-line-pf { animation: dashFlow-pf 0.8s linear infinite; animation-delay: 0.4s; }
            .pulse-pf { animation: glowPulse-pf 1.6s ease-in-out infinite alternate; animation-delay: 0.8s; }
            @keyframes dashFlow-pf { to { stroke-dashoffset: -14; } }
            @keyframes glowPulse-pf {
              0% { filter: blur(1px); opacity: 0.9; }
              100% { filter: blur(4px); opacity: 1; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .fan-line-1-pf, .fan-line-2-pf, .conv-line-pf, .pulse-pf { animation: none !important; }
          }
        `}</style>
      </defs>

      {/* Fan-out arrows */}
      <path className="fan-line-1-pf" d="M 120,110 Q 160,110 160,75 T 195,40" fill="none" markerEnd="url(#arrow-pf-1)" />
      <path className="fan-line-1-pf" d="M 120,110 Q 160,110 160,100 T 195,90" fill="none" markerEnd="url(#arrow-pf-1)" />
      <path className="fan-line-2-pf" d="M 120,110 Q 160,110 160,125 T 195,140" fill="none" markerEnd="url(#arrow-pf-2)" />
      <path className="fan-line-2-pf" d="M 120,110 Q 160,110 160,150 T 195,190" fill="none" markerEnd="url(#arrow-pf-2)" />

      {/* Converging arrows */}
      <path className="conv-line-pf" d="M 340,40 Q 380,40 380,75 T 415,110" fill="none" markerEnd="url(#arrow-pf-3)" />
      <path className="conv-line-pf" d="M 340,90 Q 380,90 380,100 T 415,110" fill="none" markerEnd="url(#arrow-pf-3)" />
      <path className="conv-line-pf" d="M 340,140 Q 380,140 380,125 T 415,110" fill="none" markerEnd="url(#arrow-pf-3)" />
      <path className="conv-line-pf" d="M 340,190 Q 380,190 380,150 T 415,110" fill="none" markerEnd="url(#arrow-pf-3)" />

      {/* Annotation */}
      <text x="160" y="210" fontSize="9" fontFamily="var(--font-mono, monospace)" fontStyle="italic" fill="#a855f7" textAnchor="middle">all 4 fire simultaneously</text>

      {/* Left Node */}
      <rect x="10" y="92" width="110" height="36" rx="18" className="fill-muted stroke-border" strokeWidth="1.5" />
      <text x="65" y="114" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">User Message</text>

      {/* Result Nodes */}
      <rect x="200" y="26" width="140" height="28" rx="14" className="fill-card stroke-[#c084fc]" strokeWidth="1.5" />
      <text x="270" y="44" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">User Profile</text>

      <rect x="200" y="76" width="140" height="28" rx="14" className="fill-card stroke-[#c084fc]" strokeWidth="1.5" />
      <text x="270" y="94" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">User Semantic</text>

      <rect x="200" y="126" width="140" height="28" rx="14" className="fill-card stroke-[#a855f7]" strokeWidth="1.5" />
      <text x="270" y="144" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">Project List</text>

      <rect x="200" y="176" width="140" height="28" rx="14" className="fill-card stroke-[#a855f7]" strokeWidth="1.5" />
      <text x="270" y="194" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">Project Semantic</text>

      {/* Memory Cache Node */}
      <g filter="url(#glow-pf)" className="pulse-pf">
        <rect x="420" y="92" width="90" height="36" rx="18" className="fill-card stroke-[#4ade80]" strokeWidth="2" />
      </g>
      <rect x="420" y="92" width="90" height="36" rx="18" className="fill-card stroke-[#4ade80]" strokeWidth="2" />
      <text x="465" y="114" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#4ade80" textAnchor="middle" alignmentBaseline="middle">Memory Cache</text>
    </svg>
  );
}
