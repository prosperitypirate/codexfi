export function DocsBenchmarkDataset() {
  return (
    <svg
      viewBox="0 0 560 160"
      width="100%"
      className="mx-auto w-full max-w-3xl"
      role="img"
      aria-label="Benchmark datasets: ecommerce-api vs dashboard-app"
    >
      <title>DevMemBench Datasets</title>
      <defs>
        <style>{`
          .card-left-bd {
            transform-box: fill-box;
          }
          .card-right-bd {
            transform-box: fill-box;
          }
          
          @media (prefers-reduced-motion: no-preference) {
            .card-left-bd {
              animation: slideInLeft-bd 0.6s ease-out forwards;
              transform: translateX(-20px);
              opacity: 0;
            }
            .card-right-bd {
              animation: slideInRight-bd 0.6s ease-out forwards;
              transform: translate(340px, 0); /* 320 + 20 */
              opacity: 0;
            }
            .tag-bd {
              animation: fadeInTag-bd 0.4s ease-out forwards;
              opacity: 0;
            }
            
            @keyframes slideInLeft-bd {
              from { transform: translateX(-20px); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideInRight-bd {
              from { transform: translate(340px, 0); opacity: 0; }
              to { transform: translate(320px, 0); opacity: 1; }
            }
            @keyframes fadeInTag-bd {
              from { opacity: 0; transform: translateY(2px); }
              to { opacity: 1; transform: translateY(0); }
            }
          }
          
          @media (prefers-reduced-motion: reduce) {
            .card-left-bd {
              transform: translateX(0);
              opacity: 1;
            }
            .card-right-bd {
              transform: translate(320px, 0);
              opacity: 1;
            }
            .tag-bd {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </defs>

      <g fontFamily="var(--font-mono, monospace)">
        {/* Left Card: ecommerce-api */}
        <g className="card-left-bd">
          <rect x="0" y="0" width="240" height="140" rx="10" className="fill-card" stroke="#a855f7" strokeWidth="1.5" />
          <path d="M 0 10 A 10 10 0 0 1 10 0 L 230 0 A 10 10 0 0 1 240 10 L 240 4 L 0 4 Z" fill="#a855f7" opacity="0.4" />
          
          <text x="20" y="36" fontSize="12" fontWeight="600" className="fill-foreground">ecommerce-api</text>
          
          {/* Tags */}
          <g transform="translate(20, 46)">
            <g className="tag-bd" style={{ animationDelay: '0.4s' }}>
              <rect x="0" y="0" width="56" height="16" rx="8" fill="#a855f7" opacity="0.15" />
              <rect x="0" y="0" width="56" height="16" rx="8" stroke="#a855f7" strokeWidth="1" fill="none" opacity="0.5" />
              <text x="28" y="11" fontSize="9" fill="#a855f7" textAnchor="middle">FastAPI</text>
            </g>
            <g className="tag-bd" style={{ animationDelay: '0.55s' }}>
              <rect x="62" y="0" width="70" height="16" rx="8" fill="#a855f7" opacity="0.15" />
              <rect x="62" y="0" width="70" height="16" rx="8" stroke="#a855f7" strokeWidth="1" fill="none" opacity="0.5" />
              <text x="97" y="11" fontSize="9" fill="#a855f7" textAnchor="middle">PostgreSQL</text>
            </g>
            <g className="tag-bd" style={{ animationDelay: '0.7s' }}>
              <rect x="138" y="0" width="48" height="16" rx="8" fill="#a855f7" opacity="0.15" />
              <rect x="138" y="0" width="48" height="16" rx="8" stroke="#a855f7" strokeWidth="1" fill="none" opacity="0.5" />
              <text x="162" y="11" fontSize="9" fill="#a855f7" textAnchor="middle">Stripe</text>
            </g>
          </g>
          
          <text x="20" y="80" fontSize="10" className="fill-muted-foreground">25 sessions</text>
          <text x="20" y="95" fontSize="9" className="fill-muted-foreground">Jan – Feb 2025</text>
          <text x="20" y="112" fontSize="9" className="fill-muted-foreground">auth · catalog · cart · checkout</text>
        </g>

        {/* Center VS */}
        <text x="280" y="80" fontSize="14" fontWeight="700" className="fill-muted-foreground" textAnchor="middle" opacity="0.4">VS</text>

        {/* Right Card: dashboard-app */}
        <g className="card-right-bd">
          <rect x="0" y="0" width="240" height="140" rx="10" className="fill-card" stroke="#c084fc" strokeWidth="1.5" />
          <path d="M 0 10 A 10 10 0 0 1 10 0 L 230 0 A 10 10 0 0 1 240 10 L 240 4 L 0 4 Z" fill="#c084fc" opacity="0.4" />
          
          <text x="20" y="36" fontSize="12" fontWeight="600" className="fill-foreground">dashboard-app</text>
          
          {/* Tags */}
          <g transform="translate(20, 46)">
            <g className="tag-bd" style={{ animationDelay: '0.4s' }}>
              <rect x="0" y="0" width="66" height="16" rx="8" fill="#c084fc" opacity="0.15" />
              <rect x="0" y="0" width="66" height="16" rx="8" stroke="#c084fc" strokeWidth="1" fill="none" opacity="0.5" />
              <text x="33" y="11" fontSize="9" fill="#c084fc" textAnchor="middle">Next.js 15</text>
            </g>
            <g className="tag-bd" style={{ animationDelay: '0.55s' }}>
              <rect x="72" y="0" width="60" height="16" rx="8" fill="#c084fc" opacity="0.15" />
              <rect x="72" y="0" width="60" height="16" rx="8" stroke="#c084fc" strokeWidth="1" fill="none" opacity="0.5" />
              <text x="102" y="11" fontSize="9" fill="#c084fc" textAnchor="middle">Recharts</text>
            </g>
            <g className="tag-bd" style={{ animationDelay: '0.7s' }}>
              <rect x="138" y="0" width="36" height="16" rx="8" fill="#c084fc" opacity="0.15" />
              <rect x="138" y="0" width="36" height="16" rx="8" stroke="#c084fc" strokeWidth="1" fill="none" opacity="0.5" />
              <text x="156" y="11" fontSize="9" fill="#c084fc" textAnchor="middle">SWR</text>
            </g>
          </g>
          
          <text x="20" y="80" fontSize="10" className="fill-muted-foreground">25 sessions</text>
          <text x="20" y="95" fontSize="9" className="fill-muted-foreground">Jan – Feb 2025</text>
          <text x="20" y="112" fontSize="9" className="fill-muted-foreground">analytics · charts · data fetching</text>
        </g>
      </g>
    </svg>
  )
}
