export function DocsBenchmarkScoreboard() {
  return (
    <svg
      viewBox="0 0 600 300"
      width="100%"
      className="mx-auto w-full max-w-3xl"
      role="img"
      aria-label="Benchmark scoreboard showing 94.5% overall score with 8 category breakdowns"
    >
      <title>DevMemBench Scoreboard</title>
      <defs>
        <linearGradient id="circleGrad-bs" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
        <style>{`
          .bar-fill-bs {
            transform-box: fill-box;
            transform-origin: left center;
          }
          
          @media (prefers-reduced-motion: no-preference) {
            .bar-fill-bs {
              animation: fillBar-bs 1s ease-out forwards;
              transform: scaleX(0);
            }
            .circle-stroke-bs {
              animation: drawCircle-bs 1.5s ease-out forwards;
              stroke-dasharray: 471;
              stroke-dashoffset: 471;
            }
            .score-text-bs {
              animation: fadeIn-bs 0.5s ease-out forwards;
              opacity: 0;
            }
            
            @keyframes fillBar-bs {
              from { transform: scaleX(0); }
              to { transform: scaleX(1); }
            }
            @keyframes drawCircle-bs {
              from { stroke-dashoffset: 471; }
              to { stroke-dashoffset: 26; } /* 471 * (1 - 0.945) = 25.905 */
            }
            @keyframes fadeIn-bs {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          }
          
          @media (prefers-reduced-motion: reduce) {
            .bar-fill-bs {
              transform: scaleX(1);
            }
            .circle-stroke-bs {
              stroke-dasharray: 471;
              stroke-dashoffset: 26;
            }
            .score-text-bs {
              opacity: 1;
            }
          }
        `}</style>
      </defs>

      <g fontFamily="var(--font-mono, monospace)">
        {/* Left Zone: Category Bars */}
        {/* Row 1: tech-stack */}
        <g transform="translate(0, 20)">
          <text x="0" y="14" fontSize="11" className="fill-muted-foreground">tech-stack</text>
          <rect x="155" y="4" width="210" height="18" rx="9" className="fill-muted" />
          <rect x="155" y="4" width="210" height="18" rx="9" fill="#4ade80" className="bar-fill-bs" style={{ animationDelay: '0s' }} />
          <text x="375" y="14" fontSize="11" className="fill-foreground">100%</text>
        </g>
        
        {/* Row 2: architecture */}
        <g transform="translate(0, 50)">
          <text x="0" y="14" fontSize="11" className="fill-muted-foreground">architecture</text>
          <rect x="155" y="4" width="210" height="18" rx="9" className="fill-muted" />
          <rect x="155" y="4" width="210" height="18" rx="9" fill="#4ade80" className="bar-fill-bs" style={{ animationDelay: '0.1s' }} />
          <text x="375" y="14" fontSize="11" className="fill-foreground">100%</text>
        </g>
        
        {/* Row 3: preference */}
        <g transform="translate(0, 80)">
          <text x="0" y="14" fontSize="11" className="fill-muted-foreground">preference</text>
          <rect x="155" y="4" width="210" height="18" rx="9" className="fill-muted" />
          <rect x="155" y="4" width="210" height="18" rx="9" fill="#4ade80" className="bar-fill-bs" style={{ animationDelay: '0.2s' }} />
          <text x="375" y="14" fontSize="11" className="fill-foreground">100%</text>
        </g>
        
        {/* Row 4: abstention */}
        <g transform="translate(0, 110)">
          <text x="0" y="14" fontSize="11" className="fill-muted-foreground">abstention</text>
          <rect x="155" y="4" width="210" height="18" rx="9" className="fill-muted" />
          <rect x="155" y="4" width="210" height="18" rx="9" fill="#4ade80" className="bar-fill-bs" style={{ animationDelay: '0.3s' }} />
          <text x="375" y="14" fontSize="11" className="fill-foreground">100%</text>
        </g>
        
        {/* Row 5: session-continuity */}
        <g transform="translate(0, 140)">
          <text x="0" y="14" fontSize="11" className="fill-muted-foreground">session-continuity</text>
          <rect x="155" y="4" width="210" height="18" rx="9" className="fill-muted" />
          <rect x="155" y="4" width="201.6" height="18" rx="9" fill="#a855f7" className="bar-fill-bs" style={{ animationDelay: '0.4s' }} />
          <text x="375" y="14" fontSize="11" className="fill-foreground">96%</text>
        </g>
        
        {/* Row 6: knowledge-update */}
        <g transform="translate(0, 170)">
          <text x="0" y="14" fontSize="11" className="fill-muted-foreground">knowledge-update</text>
          <rect x="155" y="4" width="210" height="18" rx="9" className="fill-muted" />
          <rect x="155" y="4" width="201.6" height="18" rx="9" fill="#a855f7" className="bar-fill-bs" style={{ animationDelay: '0.5s' }} />
          <text x="375" y="14" fontSize="11" className="fill-foreground">96%</text>
        </g>
        
        {/* Row 7: error-solution */}
        <g transform="translate(0, 200)">
          <text x="0" y="14" fontSize="11" className="fill-muted-foreground">error-solution</text>
          <rect x="155" y="4" width="210" height="18" rx="9" className="fill-muted" />
          <rect x="155" y="4" width="193.2" height="18" rx="9" fill="#c084fc" className="bar-fill-bs" style={{ animationDelay: '0.6s' }} />
          <text x="375" y="14" fontSize="11" className="fill-foreground">92%</text>
        </g>
        
        {/* Row 8: cross-session-synthesis */}
        <g transform="translate(0, 230)">
          <text x="0" y="14" fontSize="11" className="fill-muted-foreground">cross-session</text>
          <rect x="155" y="4" width="210" height="18" rx="9" className="fill-muted" />
          <rect x="155" y="4" width="151.2" height="18" rx="9" fill="#e879f9" className="bar-fill-bs" style={{ animationDelay: '0.7s' }} />
          <text x="375" y="14" fontSize="11" className="fill-foreground">72%</text>
        </g>

        {/* Separator Line */}
        <line x1="400" y1="20" x2="400" y2="280" className="stroke-border" strokeDasharray="4 4" />

        {/* Right Zone: Overall Score */}
        <g>
          {/* Base circle background (subtle) */}
          <circle cx="500" cy="160" r="75" className="stroke-border" strokeWidth="4" fill="none" opacity="0.3" />
          {/* Animated circle */}
          <circle 
            cx="500" cy="160" r="75" 
            stroke="url(#circleGrad-bs)" 
            strokeWidth="4" 
            fill="none" 
            strokeLinecap="round"
            transform="rotate(-90 500 160)"
            className="circle-stroke-bs"
            style={{ animationDelay: '0.8s' }}
          />
          
          {/* Score Text */}
          <g className="score-text-bs" style={{ animationDelay: '1.5s' }}>
            <text x="500" y="155" fontSize="28" fontWeight="700" className="fill-foreground" textAnchor="middle">
              94.5<tspan fontSize="16">%</tspan>
            </text>
            <text x="500" y="175" fontSize="9" letterSpacing="1.5" className="fill-muted-foreground" textAnchor="middle">OVERALL</text>
            <text x="500" y="190" fontSize="10" className="fill-muted-foreground" textAnchor="middle">189 / 200</text>
          </g>
        </g>
      </g>
    </svg>
  )
}
