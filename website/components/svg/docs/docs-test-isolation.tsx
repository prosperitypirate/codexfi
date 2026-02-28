export function DocsTestIsolation() {
  return (
    <svg
      viewBox="0 0 560 140"
      width="100%"
      className="mx-auto w-full max-w-3xl"
      role="img"
      aria-label="Test isolation lifecycle showing tmp dir, run, assert, and cleanup"
    >
      <title>Test Isolation Mechanics</title>
      <defs>
        <filter id="glowGreen-ti">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrowhead-ti" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#a855f7" opacity="0.5" />
        </marker>
        <style>{`
          .travel-dot-ti {
            transform-box: fill-box;
          }
          
          @media (prefers-reduced-motion: no-preference) {
            .travel-dot-ti {
              animation: travelPulse-ti 4s ease-in-out infinite;
            }
            .cleanup-glow-ti {
              animation: flashGlow-ti 4s ease-in-out infinite;
            }
            .arrow-pulse-ti {
              animation: arrowPulse-ti 4s ease-in-out infinite;
            }
            
            @keyframes travelPulse-ti {
              0% { transform: translate(75px, 50px); opacity: 1; }
              25% { transform: translate(215px, 50px); opacity: 1; }
              50% { transform: translate(355px, 50px); opacity: 1; }
              75% { transform: translate(495px, 50px); opacity: 1; }
              90% { transform: translate(495px, 50px); opacity: 0; }
              95% { transform: translate(75px, 50px); opacity: 0; }
              100% { transform: translate(75px, 50px); opacity: 1; }
            }
            @keyframes flashGlow-ti {
              0%, 70% { filter: none; }
              75% { filter: drop-shadow(0 0 6px rgba(74, 222, 128, 0.8)); }
              85%, 100% { filter: none; }
            }
            @keyframes arrowPulse-ti {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 0.7; }
            }
          }
          
          @media (prefers-reduced-motion: reduce) {
            .travel-dot-ti {
              transform: translate(215px, 50px);
              opacity: 1;
            }
          }
        `}</style>
      </defs>

      <g fontFamily="var(--font-mono, monospace)">
        {/* Above pipeline: repeats indicator */}
        <text x="490" y="20" fontSize="12" className="fill-muted-foreground" opacity="0.3">↺</text>
        <text x="510" y="20" fontSize="12" className="fill-muted-foreground" opacity="0.3">↺</text>
        <text x="530" y="20" fontSize="12" className="fill-muted-foreground" opacity="0.3">↺</text>

        {/* Bounding Box below pipeline */}
        <rect x="10" y="85" width="540" height="45" rx="6" className="fill-none stroke-border" strokeDasharray="4 3" opacity="0.6" />
        <text x="280" y="112" fontSize="9" className="fill-muted-foreground" textAnchor="middle">each scenario — fully isolated</text>

        {/* Arrows */}
        <g stroke="#a855f7" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead-ti)" className="arrow-pulse-ti">
          <line x1="130" y1="50" x2="152" y2="50" />
          <line x1="270" y1="50" x2="292" y2="50" />
          <line x1="410" y1="50" x2="432" y2="50" />
        </g>

        {/* Nodes */}
        {/* Node 1 */}
        <g>
          <rect x="20" y="30" width="110" height="40" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
          <text x="75" y="46" fontSize="11" fontWeight="600" className="fill-foreground" textAnchor="middle">tmp dir</text>
          <text x="75" y="60" fontSize="8" className="fill-muted-foreground" textAnchor="middle">/oc-test-...-uuid</text>
        </g>

        {/* Node 2 */}
        <g>
          <rect x="160" y="30" width="110" height="40" rx="8" className="fill-card" stroke="#a855f7" strokeWidth="1.5" />
          <text x="215" y="46" fontSize="11" fontWeight="600" className="fill-foreground" textAnchor="middle">opencode run</text>
          <text x="215" y="60" fontSize="8" className="fill-muted-foreground" textAnchor="middle">real process</text>
        </g>

        {/* Node 3 */}
        <g>
          <rect x="300" y="30" width="110" height="40" rx="8" className="fill-card" stroke="#c084fc" strokeWidth="1.5" />
          <text x="355" y="46" fontSize="11" fontWeight="600" className="fill-foreground" textAnchor="middle">assert</text>
          <text x="355" y="60" fontSize="8" className="fill-muted-foreground" textAnchor="middle">memory store</text>
        </g>

        {/* Node 4 */}
        <g className="cleanup-glow-ti">
          <rect x="440" y="30" width="110" height="40" rx="8" className="fill-card" stroke="#4ade80" strokeWidth="1.5" filter="url(#glowGreen-ti)" />
          <text x="495" y="46" fontSize="11" fontWeight="600" className="fill-foreground" textAnchor="middle">cleanup</text>
          <text x="495" y="60" fontSize="8" className="fill-muted-foreground" textAnchor="middle">memories deleted</text>
        </g>

        {/* Traveling Dot */}
        <circle cx="0" cy="0" r="5" fill="#a855f7" className="travel-dot-ti" />
      </g>
    </svg>
  )
}
