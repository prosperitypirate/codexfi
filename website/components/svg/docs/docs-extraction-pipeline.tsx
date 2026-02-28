/**
 * Animated diagram showing the 7-step pipeline from message snapshot to extraction, embedding, and storage.
 * @component
 */
export function DocsExtractionPipeline() {
  const steps = [
    { y: 40, n: 1, name: "Message Snapshot", sub: "last 8 messages", color: "#c084fc" },
    { y: 96, n: 2, name: "LLM Extraction", sub: "returns JSON facts", color: "#a855f7" },
    { y: 152, n: 3, name: "Embedding", sub: "voyage-code-3, 1024d", color: "#a855f7" },
    { y: 208, n: 4, name: "Deduplication", sub: "cosine similarity check", color: "#c084fc" },
    { y: 264, n: 5, name: "Storage", sub: "insert into LanceDB", color: "#a855f7" },
    { y: 320, n: 6, name: "Aging Rules", sub: "progress / summaries", color: "#c084fc" },
    { y: 376, n: 7, name: "Contradiction Detection", sub: "supersede stale facts", color: "#e879f9" },
  ];

  return (
    <svg viewBox="0 0 340 400" width="100%" className="mx-auto w-full max-w-sm" role="img" aria-label="The 7-step extraction pipeline shown as a vertical sequence.">
      <title>Extraction Pipeline</title>
      <defs>
        <filter id="glow-ep">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrow-down-ep" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#c084fc" opacity="0.4" />
        </marker>
        <style>{`
          .active-ep { opacity: 0; }
          .travel-dot-ep { stroke-dasharray: 6 500; stroke-dashoffset: 0; stroke: #a855f7; stroke-width: 4; stroke-linecap: round; }
          
          @media (prefers-reduced-motion: no-preference) {
            .active-ep { animation: stepGlow-ep 14s ease-in-out infinite; }
            .delay-0 { animation-delay: 0s; }
            .delay-1 { animation-delay: 1.8s; }
            .delay-2 { animation-delay: 3.6s; }
            .delay-3 { animation-delay: 5.4s; }
            .delay-4 { animation-delay: 7.2s; }
            .delay-5 { animation-delay: 9.0s; }
            .delay-6 { animation-delay: 10.8s; }
            
            .travel-dot-ep { animation: drop-ep 12.6s linear infinite; }

            @keyframes stepGlow-ep {
              0%, 15% { opacity: 0; }
              2%, 11% { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes drop-ep {
              0% { stroke-dashoffset: 40; }
              100% { stroke-dashoffset: -340; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .active-ep, .travel-dot-ep { animation: none !important; }
            .active-ep { opacity: 1; }
            .travel-dot-ep { opacity: 0; }
          }
        `}</style>
      </defs>

      {/* Connecting Arrows */}
      <line x1="30" y1="58" x2="30" y2="78" stroke="#c084fc" strokeWidth="2" strokeOpacity="0.4" markerEnd="url(#arrow-down-ep)" />
      <line x1="30" y1="114" x2="30" y2="134" stroke="#c084fc" strokeWidth="2" strokeOpacity="0.4" markerEnd="url(#arrow-down-ep)" />
      <line x1="30" y1="170" x2="30" y2="190" stroke="#c084fc" strokeWidth="2" strokeOpacity="0.4" markerEnd="url(#arrow-down-ep)" />
      <line x1="30" y1="226" x2="30" y2="246" stroke="#c084fc" strokeWidth="2" strokeOpacity="0.4" markerEnd="url(#arrow-down-ep)" />
      <line x1="30" y1="282" x2="30" y2="302" stroke="#c084fc" strokeWidth="2" strokeOpacity="0.4" markerEnd="url(#arrow-down-ep)" />
      <line x1="30" y1="338" x2="30" y2="358" stroke="#c084fc" strokeWidth="2" strokeOpacity="0.4" markerEnd="url(#arrow-down-ep)" />

      {/* Traveling Dot */}
      <line x1="30" y1="40" x2="30" y2="376" className="travel-dot-ep" fill="none" />

      {/* Steps */}
      {steps.map((s, i) => (
        <g key={i}>
          {/* Base Inactive State */}
          <circle cx="30" cy={s.y} r="18" className="fill-muted stroke-border" strokeWidth="2" />
          <text x="30" y={s.y + 4} fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">{s.n}</text>
          <text x="60" y={s.y - 2} fontSize="12" fontWeight="600" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground">{s.name}</text>
          <text x="60" y={s.y + 12} fontSize="10" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground">{s.sub}</text>
          
          {/* Active Overlay State */}
          <g className={`active-ep delay-${i}`}>
            <g filter="url(#glow-ep)">
              <circle cx="30" cy={s.y} r="18" fill="transparent" stroke={s.color} strokeWidth="2" />
            </g>
            <circle cx="30" cy={s.y} r="18" className="fill-card" stroke={s.color} strokeWidth="2" />
            <text x="30" y={s.y + 4} fontSize="11" fontFamily="var(--font-mono, monospace)" fill={s.color} textAnchor="middle">{s.n}</text>
            <text x="60" y={s.y - 2} fontSize="12" fontWeight="600" fontFamily="var(--font-mono, monospace)" className="fill-foreground">{s.name}</text>
            <text x="60" y={s.y + 12} fontSize="10" fontFamily="var(--font-mono, monospace)" fill={s.color}>{s.sub}</text>
          </g>
        </g>
      ))}
    </svg>
  );
}
