/**
 * Animated diagram showing that the memory block in the system prompt survives when the conversation history is truncated during compaction.
 * @component
 */
export function DocsCompactionSurvival() {
  return (
    <svg viewBox="0 0 520 200" width="100%" className="mx-auto w-full max-w-3xl" role="img" aria-label="A diagram showing that the memory block in the system prompt survives when the conversation history is truncated during compaction.">
      <title>Compaction Survival Diagram</title>
      <defs>
        <filter id="glow-cs">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrow-green-cs" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#4ade80" />
        </marker>
        <marker id="arrow-red-cs" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#e879f9" />
        </marker>
        <style>{`
          .compaction-text-cs { transform-origin: 260px 100px; opacity: 0; }
          .after-conv-cs { opacity: 1; }
          .cross-out-cs { opacity: 0; stroke-dasharray: 300; stroke-dashoffset: 300; }
          .after-glow-cs { opacity: 0; }
          
          @media (prefers-reduced-motion: no-preference) {
            .compaction-text-cs { animation: flash-cs 8s infinite; }
            .after-conv-cs { animation: fade-cs 8s infinite; }
            .cross-out-cs { animation: cross-cs 8s infinite; }
            .after-glow-cs { animation: glow-cs 8s infinite; }
            
            @keyframes flash-cs {
              0%, 25% { opacity: 0; transform: scale(0.9); }
              30% { opacity: 1; transform: scale(1.1); }
              35%, 100% { opacity: 1; transform: scale(1); }
            }
            @keyframes fade-cs {
              0%, 35% { opacity: 1; }
              50%, 100% { opacity: 0.15; }
            }
            @keyframes cross-cs {
              0%, 40% { opacity: 0; stroke-dashoffset: 300; }
              50%, 100% { opacity: 1; stroke-dashoffset: 0; }
            }
            @keyframes glow-cs {
              0%, 60% { opacity: 0; }
              70%, 100% { opacity: 1; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .compaction-text-cs, .after-conv-cs, .cross-out-cs, .after-glow-cs { animation: none !important; }
            .compaction-text-cs { opacity: 1; transform: scale(1); }
            .after-conv-cs { opacity: 0.15; }
            .cross-out-cs { opacity: 1; stroke-dashoffset: 0; }
            .after-glow-cs { opacity: 1; }
          }
        `}</style>
      </defs>

      {/* Column Headers */}
      <text x="80" y="10" fontSize="10" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">BEFORE</text>
      <text x="430" y="10" fontSize="10" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">AFTER</text>

      {/* BEFORE Column */}
      <rect x="10" y="20" width="140" height="28" rx="6" className="fill-muted stroke-border" strokeWidth="1" />
      <text x="80" y="38" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#4ade80" textAnchor="middle" alignmentBaseline="middle">[MEMORY]</text>

      <rect x="10" y="60" width="140" height="100" rx="6" className="fill-card stroke-border" strokeWidth="1" />
      <rect x="20" y="75" width="100" height="14" rx="4" className="fill-muted" />
      <rect x="50" y="100" width="90" height="14" rx="4" className="fill-muted" />
      <rect x="20" y="125" width="110" height="14" rx="4" className="fill-muted" />

      {/* EVENT Column */}
      <g className="compaction-text-cs">
        <text x="260" y="96" fontSize="12" fontWeight="600" fontFamily="var(--font-mono, monospace)" fill="#e879f9" textAnchor="middle" alignmentBaseline="middle">COMPACTION</text>
        <text x="260" y="124" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">context window truncated</text>
      </g>
      
      {/* Event Arrows */}
      <line x1="160" y1="34" x2="350" y2="34" stroke="#4ade80" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-green-cs)" />
      <line x1="160" y1="110" x2="350" y2="110" stroke="#e879f9" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-red-cs)" />

      {/* AFTER Column */}
      {/* Glow under the box */}
      <g filter="url(#glow-cs)" className="after-glow-cs">
        <rect x="360" y="20" width="140" height="28" rx="6" className="fill-muted stroke-[#4ade80]" strokeWidth="1" />
      </g>
      <rect x="360" y="20" width="140" height="28" rx="6" className="fill-muted stroke-border" strokeWidth="1" />
      <text x="430" y="38" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#4ade80" textAnchor="middle" alignmentBaseline="middle">[MEMORY] ✓</text>

      <g>
        <rect x="360" y="60" width="140" height="100" rx="6" className="fill-card stroke-border" strokeWidth="1" />
        <g className="after-conv-cs">
          <rect x="370" y="75" width="100" height="14" rx="4" className="fill-muted" />
          <rect x="400" y="100" width="90" height="14" rx="4" className="fill-muted" />
          <rect x="370" y="125" width="110" height="14" rx="4" className="fill-muted" />
        </g>
        {/* Strikethrough X */}
        <path className="cross-out-cs" d="M 370,70 L 490,150 M 490,70 L 370,150" stroke="#e879f9" strokeWidth="2" strokeOpacity="0.6" fill="none" />
      </g>
    </svg>
  );
}
