/**
 * Animated terminal window showing the three-step codexfi installation process.
 * @component
 */
export function DocsInstallSteps() {
  return (
    <svg viewBox="0 0 560 130" width="100%" className="mx-auto w-full max-w-2xl" role="img" aria-label="A terminal window showing the three-step codexfi installation process.">
      <title>Installation Steps</title>
      <defs>
        <style>{`
          .line2-is { opacity: 0; }
          .line3-is { opacity: 0; }
          .cursor-wrapper-is { opacity: 1; }
          .cursor-blink-is { opacity: 1; }
          
          @media (prefers-reduced-motion: no-preference) {
            .line2-is { animation: showL2-is 8s ease forwards infinite; }
            .line3-is { animation: showL3-is 8s ease forwards infinite; }
            .cursor-wrapper-is { animation: hideCursor-is 8s step-end infinite; }
            .cursor-blink-is { animation: blink-is 1s step-end infinite; }
            
            @keyframes blink-is {
              50% { opacity: 0; }
            }
            @keyframes hideCursor-is {
              0%, 37.5% { opacity: 1; }
              37.6%, 100% { opacity: 0; }
            }
            @keyframes showL2-is {
              0%, 12.5% { opacity: 0; }
              15%, 100% { opacity: 1; }
            }
            @keyframes showL3-is {
              0%, 31.25% { opacity: 0; }
              33.75%, 100% { opacity: 1; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .line2-is, .line3-is, .cursor-wrapper-is, .cursor-blink-is { animation: none !important; }
            .line2-is { opacity: 1; }
            .line3-is { opacity: 1; }
            .cursor-wrapper-is { opacity: 1; }
          }
        `}</style>
      </defs>

      {/* Terminal Base */}
      <rect x="0" y="0" width="560" height="130" rx="10" fill="#0d0d0d" className="stroke-border" strokeWidth="1" />
      
      {/* Terminal Chrome */}
      <rect x="0" y="0" width="560" height="28" rx="10" className="fill-muted" />
      <rect x="0" y="18" width="560" height="10" className="fill-muted" />
      
      {/* Traffic Lights */}
      <circle cx="18" cy="14" r="5" fill="#ff5f56" />
      <circle cx="34" cy="14" r="5" fill="#ffbd2e" />
      <circle cx="50" cy="14" r="5" fill="#27c93f" />
      
      {/* Title */}
      <text x="280" y="18" fontSize="10" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">Terminal</text>
      
      {/* Divider */}
      <line x1="0" y1="28" x2="560" y2="28" className="stroke-border" strokeWidth="1" />

      {/* Terminal Body */}
      {/* Line 1 */}
      <text x="20" y="55" fontSize="12" fontFamily="var(--font-mono, monospace)">
        <tspan fill="#4ade80">$</tspan>
        <tspan fill="#c084fc"> bunx codexfi install</tspan>
      </text>
      <g className="cursor-wrapper-is">
        <text x="175" y="55" fontSize="12" fontFamily="var(--font-mono, monospace)" fill="#4ade80" className="cursor-blink-is"> ▊</text>
      </g>

      {/* Line 2 */}
      <g className="line2-is">
        <text x="20" y="82" fontSize="12" fontFamily="var(--font-mono, monospace)">
          <tspan fill="#a855f7">  › </tspan>
          <tspan fill="#888888">Enter Voyage AI key: </tspan>
          <tspan className="fill-muted-foreground">••••••••••••</tspan>
        </text>
      </g>

      {/* Line 3 */}
      <g className="line3-is">
        <text x="20" y="105" fontSize="12" fontFamily="var(--font-mono, monospace)">
          <tspan fill="#4ade80">  ✓ </tspan>
          <tspan fill="#888888">Registered. Restart OpenCode to activate.</tspan>
        </text>
      </g>
    </svg>
  );
}
