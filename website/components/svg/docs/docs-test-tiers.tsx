/**
 * Three-panel diagram showing the Unit, Integration, and E2E test tier architecture.
 * @component
 */
export function DocsTestTiers() {
  return (
    <svg
      viewBox="0 0 560 140"
      width="100%"
      className="mx-auto w-full max-w-3xl"
      role="img"
      aria-label="Three test tiers: Unit (fast, isolated), Integration, and E2E (slow, real)"
    >
      <title>Test Tiers Architecture</title>
      <defs>
        <filter id="glow-tt">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrowhead-tt" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" className="fill-muted-foreground" />
        </marker>
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            .panel-tt {
              animation: fadeInOpacity-tt 0.5s ease-out forwards;
              opacity: 0;
            }
            .panel-1 { animation-delay: 0s; }
            .panel-2 { animation-delay: 0.2s; }
            .panel-3 { animation-delay: 0.4s; }

            .glow-pulse-tt {
              animation: glowPulse-tt 3s ease-in-out infinite alternate;
              animation-delay: 0.9s;
            }

            .arrow-draw-tt {
              animation: drawArrow-tt 0.5s ease-out forwards;
              stroke-dasharray: 40;
              stroke-dashoffset: 40;
            }

            @keyframes fadeInOpacity-tt {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes glowPulse-tt {
              from { filter: drop-shadow(0 0 2px rgba(168, 85, 247, 0.3)); }
              to { filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.7)); }
            }
            @keyframes drawArrow-tt {
              to { stroke-dashoffset: 0; }
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .panel-tt { opacity: 1; }
            .arrow-draw-tt { stroke-dasharray: none; }
          }
        `}</style>
      </defs>

      <g fontFamily="var(--font-mono, monospace)">
        {/* Panel 1: Unit */}
        <g transform="translate(0, 0)" className="panel-tt panel-1">
          <rect x="0" y="0" width="160" height="110" rx="10" className="fill-card stroke-border" strokeWidth="1.5" />
          <text x="80" y="28" fontSize="10" fontWeight="700" letterSpacing="1.5" className="fill-muted-foreground" textAnchor="middle">UNIT</text>
          
          <rect x="62" y="47" width="36" height="16" rx="8" fill="#4ade80" opacity="0.15" />
          <rect x="62" y="47" width="36" height="16" rx="8" stroke="#4ade80" strokeWidth="1" fill="none" opacity="0.5" />
          <text x="80" y="58" fontSize="10" fill="#4ade80" textAnchor="middle">{"< 1s"}</text>
          
          <text x="80" y="76" fontSize="9" className="fill-muted-foreground" textAnchor="middle">isolated logic</text>
          <text x="80" y="90" fontSize="9" className="fill-muted-foreground" textAnchor="middle">mocked dependencies</text>
        </g>

        {/* Arrow 1 to 2 */}
        <line x1="166" y1="55" x2="184" y2="55" className="stroke-border arrow-draw-tt" strokeWidth="1.5" markerEnd="url(#arrowhead-tt)" style={{ animationDelay: '0.6s' }} />

        {/* Panel 2: Integration */}
        <g transform="translate(190, 0)" className="panel-tt panel-2">
          <rect x="0" y="0" width="160" height="110" rx="10" className="fill-card" stroke="#c084fc" strokeWidth="1.5" />
          <text x="80" y="28" fontSize="10" fontWeight="700" letterSpacing="1.5" fill="#c084fc" textAnchor="middle">INTEGRATION</text>
          
          <rect x="62" y="47" width="36" height="16" rx="8" fill="#c084fc" opacity="0.15" />
          <rect x="62" y="47" width="36" height="16" rx="8" stroke="#c084fc" strokeWidth="1" fill="none" opacity="0.5" />
          <text x="80" y="58" fontSize="10" fill="#c084fc" textAnchor="middle">~30s</text>
          
          <text x="80" y="76" fontSize="9" className="fill-muted-foreground" textAnchor="middle">real LanceDB</text>
          <text x="80" y="90" fontSize="9" className="fill-muted-foreground" textAnchor="middle">real embedder</text>
        </g>

        {/* Arrow 2 to 3 */}
        <line x1="356" y1="55" x2="374" y2="55" className="stroke-border arrow-draw-tt" strokeWidth="1.5" markerEnd="url(#arrowhead-tt)" style={{ animationDelay: '0.7s' }} />

        {/* Panel 3: E2E — fade-in on outer g, glow on inner g to avoid animation conflict */}
        <g transform="translate(380, 0)" className="panel-tt panel-3">
          <g className="glow-pulse-tt">
            <rect x="0" y="0" width="160" height="110" rx="10" className="fill-card" stroke="#a855f7" strokeWidth="2" filter="url(#glow-tt)" />
            <text x="80" y="28" fontSize="10" fontWeight="700" letterSpacing="1.5" fill="#a855f7" textAnchor="middle">E2E</text>
            
            <rect x="52" y="47" width="56" height="16" rx="8" fill="#a855f7" opacity="0.15" />
            <rect x="52" y="47" width="56" height="16" rx="8" stroke="#a855f7" strokeWidth="1" fill="none" opacity="0.5" />
            <text x="80" y="58" fontSize="10" fill="#a855f7" textAnchor="middle">5–10 min</text>
            
            <text x="80" y="76" fontSize="9" className="fill-muted-foreground" textAnchor="middle">real opencode</text>
            <text x="80" y="90" fontSize="9" className="fill-muted-foreground" textAnchor="middle">12 scenarios</text>
          </g>
        </g>

        {/* Bottom Axis */}
        <g>
          <line x1="0" y1="122" x2="560" y2="122" className="stroke-border" opacity="0.4" />
          <text x="80" y="136" fontSize="9" className="fill-muted-foreground" textAnchor="middle">fast · isolated</text>
          <text x="480" y="136" fontSize="9" className="fill-muted-foreground" textAnchor="middle">slow · real</text>
        </g>
      </g>
    </svg>
  )
}
