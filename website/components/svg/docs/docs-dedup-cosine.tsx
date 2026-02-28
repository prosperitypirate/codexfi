/**
 * Animated diagram demonstrating the cosine similarity check for deduplicating new memories.
 * @component
 */
export function DocsDedupCosine() {
  return (
    <svg viewBox="0 0 480 180" width="100%" className="mx-auto w-full max-w-3xl" role="img" aria-label="A diagram demonstrating the cosine similarity check for deduplicating new memories.">
      <title>Cosine Similarity Deduplication</title>
      <defs>
        <filter id="glow-dc-update">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="glow-dc-insert">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrow-update-dc" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#f59e0b" />
        </marker>
        <marker id="arrow-insert-dc" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#4ade80" />
        </marker>
        <style>{`
          .high-state-dc { opacity: 1; }
          .low-state-dc { opacity: 0; }
          .path-update-dc { opacity: 1; }
          .path-insert-dc { opacity: 0.25; }
          .glow-update-dc { opacity: 1; }
          .glow-insert-dc { opacity: 0; }
          
          @media (prefers-reduced-motion: no-preference) {
            .high-state-dc { animation: toggleHigh-dc 10s infinite; }
            .low-state-dc { animation: toggleLow-dc 10s infinite; }
            .path-update-dc { animation: pathUpdate-dc 10s infinite; }
            .path-insert-dc { animation: pathInsert-dc 10s infinite; }
            .glow-update-dc { animation: toggleHigh-dc 10s infinite; }
            .glow-insert-dc { animation: toggleLow-dc 10s infinite; }
            
            @keyframes toggleHigh-dc {
              0%, 45% { opacity: 1; }
              50%, 95% { opacity: 0; }
              100% { opacity: 1; }
            }
            @keyframes toggleLow-dc {
              0%, 45% { opacity: 0; }
              50%, 95% { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes pathUpdate-dc {
              0%, 45% { opacity: 1; }
              50%, 95% { opacity: 0.25; }
              100% { opacity: 1; }
            }
            @keyframes pathInsert-dc {
              0%, 45% { opacity: 0.25; }
              50%, 95% { opacity: 1; }
              100% { opacity: 0.25; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .high-state-dc, .low-state-dc, .path-update-dc, .path-insert-dc, .glow-update-dc, .glow-insert-dc { animation: none !important; }
            .high-state-dc { opacity: 1; }
            .low-state-dc { opacity: 0; }
            .path-update-dc { opacity: 1; }
            .path-insert-dc { opacity: 0.4; }
            .glow-update-dc { opacity: 1; }
            .glow-insert-dc { opacity: 0; }
          }
        `}</style>
      </defs>

      {/* Nodes */}
      <line x1="70" y1="70" x2="160" y2="115" className="stroke-border" strokeWidth="1.5" />
      
      <circle cx="70" cy="70" r="32" className="fill-card stroke-border" strokeWidth="1.5" />
      <text x="70" y="73" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle">Memory A</text>
      <text x="70" y="115" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">"JWT in httpOnly</text>
      <text x="70" y="127" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">cookies"</text>

      <circle cx="160" cy="115" r="32" className="fill-card stroke-border" strokeWidth="1.5" />
      <text x="160" y="118" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle">New Memory</text>
      <text x="160" y="160" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">"Auth uses</text>
      <text x="160" y="172" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">httpOnly JWT"</text>

      {/* Score Badge */}
      <rect x="85" y="81" width="60" height="22" rx="11" className="fill-card stroke-[#a855f7]" strokeWidth="1.5" />
      <text x="115" y="96" fontSize="11" fontWeight="600" fontFamily="var(--font-mono, monospace)" fill="#a855f7" textAnchor="middle" className="high-state-dc">0.89</text>
      <text x="115" y="96" fontSize="11" fontWeight="600" fontFamily="var(--font-mono, monospace)" fill="#a855f7" textAnchor="middle" className="low-state-dc">0.04</text>
      
      <text x="115" y="72" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">threshold: 0.12</text>

      {/* UPDATE Path */}
      <g className="path-update-dc">
        <path d="M 145,86 Q 190,50 240,50" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-update-dc)" />
        <text x="195" y="44" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">score &gt; threshold</text>
        
        <g filter="url(#glow-dc-update)" className="glow-update-dc">
          <rect x="250" y="36" width="90" height="28" rx="14" className="fill-transparent stroke-[#f59e0b]" strokeWidth="2" />
        </g>
        <rect x="250" y="36" width="90" height="28" rx="14" className="fill-card stroke-[#f59e0b]" strokeWidth="1.5" />
        <text x="295" y="54" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#f59e0b" textAnchor="middle">UPDATE</text>
        <text x="295" y="76" fontSize="8" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">text refreshed,</text>
        <text x="295" y="86" fontSize="8" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">timestamp updated</text>
      </g>

      {/* INSERT Path */}
      <g className="path-insert-dc">
        <path d="M 145,98 Q 190,135 240,135" fill="none" stroke="#4ade80" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-insert-dc)" />
        <text x="195" y="146" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">score &lt; threshold</text>
        
        <g filter="url(#glow-dc-insert)" className="glow-insert-dc">
          <rect x="250" y="121" width="90" height="28" rx="14" className="fill-transparent stroke-[#4ade80]" strokeWidth="2" />
        </g>
        <rect x="250" y="121" width="90" height="28" rx="14" className="fill-card stroke-[#4ade80]" strokeWidth="1.5" />
        <text x="295" y="139" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#4ade80" textAnchor="middle">INSERT</text>
        <text x="295" y="161" fontSize="8" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">new entry created</text>
      </g>
    </svg>
  );
}
