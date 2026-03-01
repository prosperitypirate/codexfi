/**
 * Grid map of all 12 E2E test scenarios showing pass/warn status, with amber highlight on scenario 09.
 * @component
 */
export function DocsE2eScenarioMap() {
  const scenarios = [
    { num: '01', title: 'Cross-Session', status: 'PASS', col: 0, row: 0 },
    { num: '02', title: 'README Seeding', status: 'PASS', col: 1, row: 0 },
    { num: '03', title: 'Noise Guard', status: 'PASS', col: 2, row: 0 },
    { num: '04', title: 'Brief Always', status: 'PASS', col: 3, row: 0 },
    { num: '05', title: 'Memory Aging', status: 'PASS', col: 0, row: 1 },
    { num: '06', title: 'Codebase Init', status: 'PASS', col: 1, row: 1 },
    { num: '07', title: 'Hybrid Retrieval', status: 'PASS', col: 2, row: 1 },
    { num: '08', title: 'Cross-Synthesis', status: 'PASS', col: 3, row: 1 },
    { num: '09', title: 'Under Load', status: 'WARN', col: 0, row: 2 },
    { num: '10', title: 'Knowledge Update', status: 'PASS', col: 1, row: 2 },
    { num: '11', title: 'Prompt Injection', status: 'PASS', col: 2, row: 2 },
    { num: '12', title: 'Multi-Turn', status: 'PASS', col: 3, row: 2 },
  ];

  return (
    <svg
      viewBox="0 0 600 260"
      width="100%"
      className="mx-auto w-full max-w-3xl"
      role="img"
      aria-label="Grid of 12 E2E test scenarios showing 11 PASS and 1 WARN"
    >
      <title>E2E Scenario Map</title>
      <defs>
        <filter id="glowAmber-esm">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <style>{`
          .card-esm {
            /* opacity-only fade-in — no transform, preserves inline translate(x, y) from the SVG attribute */
          }
          
          @media (prefers-reduced-motion: no-preference) {
            .card-esm {
              animation: fadeInOpacity-esm 0.4s ease-out forwards;
              opacity: 0;
            }
            .warn-glow-esm {
              animation: fadeInOpacity-esm 0.4s ease-out forwards, glowAmber-esm 2.5s ease-in-out infinite alternate;
              animation-delay: 0.65s, 0.8s;
            }
            .summary-esm {
              animation: fadeInOpacity-esm 0.5s ease-out forwards;
              opacity: 0;
            }
            
            @keyframes fadeInOpacity-esm {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            
            @keyframes glowAmber-esm {
              from { filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.3)); }
              to { filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.7)); }
            }
          }
          
          @media (prefers-reduced-motion: reduce) {
            .card-esm, .summary-esm {
              opacity: 1;
            }
          }
        `}</style>
      </defs>

      <g fontFamily="var(--font-mono, monospace)">
        {scenarios.map((s, i) => {
          const x = s.col * 148;
          const y = 10 + s.row * 76;
          const delay = s.num === '09' ? '0.65s' : `${i * 0.05}s`;
          const isWarn = s.status === 'WARN';
          const strokeColor = isWarn ? '#f59e0b' : '#4ade80';
          const strokeOpacity = isWarn ? 0.7 : 0.5;
          const classNames = `card-esm ${isWarn ? 'warn-glow-esm' : ''}`;

          return (
            <g key={s.num} transform={`translate(${x}, ${y})`} className={classNames} style={{ animationDelay: delay }}>
              {/* Card bg */}
              <rect x="0" y="0" width="138" height="68" rx="8" className="fill-card" stroke={strokeColor} strokeWidth="1.5" strokeOpacity={strokeOpacity} />
              
              {/* Scenario Number */}
              <text x="10" y="20" fontSize="11" fontWeight="700" className="fill-muted-foreground">{s.num}</text>
              
              {/* Title */}
              <text x="69" y="36" fontSize="10" className="fill-foreground" textAnchor="middle">{s.title}</text>
              
              {/* Status Badge */}
              <g transform="translate(69, 54)">
                <rect x="-20" y="-8" width="40" height="14" rx="7" fill={strokeColor} opacity="0.15" />
                <rect x="-20" y="-8" width="40" height="14" rx="7" stroke={strokeColor} strokeWidth="1" fill="none" opacity="0.5" />
                <text x="0" y="1" fontSize="9" fill={strokeColor} textAnchor="middle">{s.status}</text>
              </g>
            </g>
          );
        })}

        {/* Summary Line */}
        <g className="summary-esm" style={{ animationDelay: '0.8s' }}>
          <text x="0" y="250" fontSize="12" fontWeight="600" fill="#4ade80">11 / 12 PASS</text>
          <text x="600" y="250" fontSize="9" className="fill-muted-foreground" textAnchor="end">scenario 09: non-deterministic</text>
        </g>
      </g>
    </svg>
  )
}
