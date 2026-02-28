/**
 * Animated diagram showing how progress and session-summary memory types age automatically over time.
 * @component
 */
export function DocsAgingRules() {
  return (
    <svg viewBox="0 0 560 200" width="100%" className="mx-auto w-full max-w-3xl" role="img" aria-label="A diagram showing how progress and session-summary memory types age automatically over time.">
      <title>Aging Rules Diagram</title>
      <defs>
        <filter id="glow-ar">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrow-down-ar" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#a855f7" />
        </marker>
        <marker id="arrow-right-ar" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#c084fc" />
        </marker>
        <style>{`
          .prog-3-ar { opacity: 0; transform: translateY(-20px); }
          .prog-old-ar { opacity: 1; }
          .prog-cross-ar { stroke-dasharray: 220; stroke-dashoffset: 220; }
          
          .sum-1-ar { transform-origin: 300px 65px; }
          .lp-badge-ar { opacity: 0; }
          .sum-shift-ar { transform: translateY(0); }
          
          @media (prefers-reduced-motion: no-preference) {
            .prog-3-ar { animation: slideDown-ar 6s ease forwards infinite; }
            .prog-old-ar { animation: fadeOld-ar 6s ease forwards infinite; }
            .prog-cross-ar { animation: crossDraw-ar 6s ease forwards infinite; }
            
            .sum-1-ar { animation: sum1-ar 8s ease forwards infinite; }
            .lp-badge-ar { animation: lpFade-ar 8s ease forwards infinite; }
            .sum-shift-ar { animation: sumShift-ar 8s ease forwards infinite; }
            
            /* Left Panel: 6s loop */
            @keyframes slideDown-ar {
              0%, 25% { opacity: 0; transform: translateY(-20px); }
              41%, 100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes fadeOld-ar {
              0%, 41% { opacity: 1; }
              66%, 100% { opacity: 0.3; }
            }
            @keyframes crossDraw-ar {
              0%, 41% { stroke-dashoffset: 220; }
              66%, 100% { stroke-dashoffset: 0; }
            }
            
            /* Right Panel: 8s loop */
            @keyframes sum1-ar {
              0%, 25% { transform: scale(1) translate(0, 0); opacity: 1; }
              37.5% { transform: scale(0.7) translate(100px, 0); opacity: 0; }
              100% { transform: scale(0.7) translate(100px, 0); opacity: 0; }
            }
            @keyframes lpFade-ar {
              0%, 37.5% { opacity: 0; }
              56%, 100% { opacity: 1; }
            }
            @keyframes sumShift-ar {
              0%, 56% { transform: translateY(0); }
              75%, 100% { transform: translateY(-45px); }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .prog-3-ar, .prog-old-ar, .prog-cross-ar, .sum-1-ar, .lp-badge-ar, .sum-shift-ar { animation: none !important; }
            .prog-3-ar { opacity: 1; transform: translateY(0); }
            .prog-old-ar { opacity: 0.3; }
            .prog-cross-ar { stroke-dashoffset: 0; }
            .sum-1-ar { opacity: 0; }
            .lp-badge-ar { opacity: 1; }
            .sum-shift-ar { transform: translateY(-45px); }
          }
        `}</style>
      </defs>

      {/* Divider */}
      <line x1="280" y1="20" x2="280" y2="180" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="stroke-border" />

      {/* Left Panel: Progress */}
      <text x="140" y="24" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#e879f9" textAnchor="middle">progress</text>
      
      <g className="prog-old-ar">
        {/* Progress 1 */}
        <rect x="30" y="50" width="220" height="30" rx="6" className="fill-card stroke-border" strokeWidth="1" />
        <text x="45" y="69" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">progress #1</text>
        <line x1="35" y1="65" x2="245" y2="65" stroke="#e879f9" strokeWidth="1.5" className="prog-cross-ar" />
        
        {/* Progress 2 */}
        <rect x="30" y="95" width="220" height="30" rx="6" className="fill-card stroke-border" strokeWidth="1" />
        <text x="45" y="114" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">progress #2</text>
        <line x1="35" y1="110" x2="245" y2="110" stroke="#e879f9" strokeWidth="1.5" className="prog-cross-ar" />
      </g>

      <g className="prog-3-ar">
        {/* NEW arrow */}
        <text x="140" y="130" fontSize="9" fontFamily="var(--font-mono, monospace)" fill="#a855f7" textAnchor="middle">NEW</text>
        <line x1="140" y1="133" x2="140" y2="138" stroke="#a855f7" strokeWidth="1" markerEnd="url(#arrow-down-ar)" />
        
        {/* Progress 3 */}
        <g filter="url(#glow-ar)">
          <rect x="30" y="140" width="220" height="30" rx="6" className="fill-card stroke-[#a855f7]" strokeWidth="1.5" />
        </g>
        <rect x="30" y="140" width="220" height="30" rx="6" className="fill-card stroke-[#a855f7]" strokeWidth="1.5" />
        <rect x="30" y="140" width="4" height="30" rx="2" fill="#a855f7" />
        <text x="45" y="159" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">progress #3</text>
      </g>

      <text x="140" y="185" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">only latest survives</text>

      {/* Right Panel: Session Summary */}
      <text x="420" y="24" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#c084fc" textAnchor="middle">session-summary</text>

      <g className="sum-1-ar">
        <rect x="300" y="50" width="130" height="30" rx="6" className="fill-card stroke-border" strokeWidth="1" />
        <text x="315" y="69" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">summary #1</text>
      </g>
      
      <g className="sum-shift-ar">
        <rect x="300" y="95" width="130" height="30" rx="6" className="fill-card stroke-border" strokeWidth="1" />
        <text x="315" y="114" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">summary #2</text>
        
        <rect x="300" y="140" width="130" height="30" rx="6" className="fill-card stroke-border" strokeWidth="1" />
        <text x="315" y="159" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">summary #3</text>
      </g>

      <g className="lp-badge-ar">
        <text x="390" y="63" fontSize="9" fontFamily="var(--font-mono, monospace)" fill="#c084fc" textAnchor="middle">condense</text>
        <line x1="375" y1="67" x2="405" y2="67" stroke="#c084fc" strokeWidth="1" markerEnd="url(#arrow-right-ar)" />
        
        <rect x="420" y="53" width="130" height="24" rx="12" className="fill-card stroke-[#4ade80]" strokeWidth="1.5" />
        <text x="485" y="69" fontSize="10" fontFamily="var(--font-mono, monospace)" fill="#4ade80" textAnchor="middle">learned-pattern</text>
      </g>

      <text x="420" y="185" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">oldest → learned-pattern</text>
    </svg>
  );
}
