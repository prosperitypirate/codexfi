export function DocsBenchmarkPipeline() {
  return (
    <svg
      viewBox="0 0 640 100"
      width="100%"
      className="mx-auto w-full max-w-3xl"
      role="img"
      aria-label="Benchmark pipeline showing 5 phases: Ingest, Search, Answer, Evaluate, Report"
    >
      <title>DevMemBench Pipeline</title>
      <defs>
        <filter id="glow-bp">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrowhead-bp" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#a855f7" opacity="0.6" />
        </marker>
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            .node-bp {
              animation: fadeInNode-bp 0.5s ease-out forwards;
              opacity: 0;
            }
            .flow-arrow-bp {
              animation: dashFlow-bp 1s linear infinite;
              stroke-dasharray: 6 5;
            }
            .report-glow-bp {
              animation: glowPulse-bp 2s ease-in-out infinite alternate;
            }
            
            @keyframes fadeInNode-bp {
              from { opacity: 0; transform: translateY(5px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes dashFlow-bp {
              to { stroke-dashoffset: -11; }
            }
            @keyframes glowPulse-bp {
              from { filter: drop-shadow(0 0 2px rgba(74, 222, 128, 0.4)); }
              to { filter: drop-shadow(0 0 6px rgba(74, 222, 128, 0.8)); }
            }
          }
          
          @media (prefers-reduced-motion: reduce) {
            .node-bp { opacity: 1; }
            .flow-arrow-bp { stroke-dasharray: none; }
          }
        `}</style>
      </defs>

      <g fontFamily="var(--font-mono, monospace)">
        {/* Connecting Arrows */}
        <g stroke="#a855f7" strokeWidth="1.5" opacity="0.6" fill="none" markerEnd="url(#arrowhead-bp)" className="flow-arrow-bp">
          {/* Node 1 to 2 */}
          <line x1="106" y1="50" x2="114" y2="50" />
          {/* Node 2 to 3 */}
          <line x1="214" y1="50" x2="268" y2="50" />
          {/* Node 3 to 4 */}
          <line x1="368" y1="50" x2="422" y2="50" />
          {/* Node 4 to 5 */}
          <line x1="522" y1="50" x2="530" y2="50" />
        </g>

        {/* Nodes */}
        {/* Node 1: Ingest */}
        <g className="node-bp" style={{ animationDelay: '0s' }}>
          <rect x="10" y="32" width="96" height="36" rx="18" className="fill-card" stroke="#c084fc" strokeWidth="1.5" />
          <text x="58" y="54" fontSize="11" className="fill-foreground" textAnchor="middle" fontWeight="500">Ingest</text>
          <text x="58" y="81" fontSize="9" className="fill-muted-foreground" textAnchor="middle">50 sessions</text>
        </g>

        {/* Node 2: Search */}
        <g className="node-bp" style={{ animationDelay: '0.15s' }}>
          <rect x="118" y="32" width="96" height="36" rx="18" className="fill-card" stroke="#a855f7" strokeWidth="1.5" />
          <text x="166" y="54" fontSize="11" className="fill-foreground" textAnchor="middle" fontWeight="500">Search</text>
          <text x="166" y="81" fontSize="9" className="fill-muted-foreground" textAnchor="middle">200 queries</text>
        </g>

        {/* Node 3: Answer */}
        <g className="node-bp" style={{ animationDelay: '0.3s' }}>
          <rect x="272" y="32" width="96" height="36" rx="18" className="fill-card" stroke="#a855f7" strokeWidth="1.5" />
          <text x="320" y="54" fontSize="11" className="fill-foreground" textAnchor="middle" fontWeight="500">Answer</text>
          <text x="320" y="81" fontSize="9" className="fill-muted-foreground" textAnchor="middle">LLM only</text>
        </g>

        {/* Node 4: Evaluate */}
        <g className="node-bp" style={{ animationDelay: '0.45s' }}>
          <rect x="426" y="32" width="96" height="36" rx="18" className="fill-card" stroke="#c084fc" strokeWidth="1.5" />
          <text x="474" y="54" fontSize="11" className="fill-foreground" textAnchor="middle" fontWeight="500">Evaluate</text>
          <text x="474" y="81" fontSize="9" className="fill-muted-foreground" textAnchor="middle">judge LLM</text>
        </g>

        {/* Node 5: Report */}
        <g className="node-bp report-glow-bp" style={{ animationDelay: '0.6s' }}>
          <rect x="534" y="32" width="96" height="36" rx="18" className="fill-card" stroke="#4ade80" strokeWidth="2" filter="url(#glow-bp)" />
          <text x="582" y="54" fontSize="11" fill="#4ade80" textAnchor="middle" fontWeight="600">Report</text>
          <text x="582" y="81" fontSize="9" className="fill-muted-foreground" textAnchor="middle">report.json</text>
        </g>
      </g>
    </svg>
  )
}
