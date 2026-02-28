export function MemoryFlowSVG() {
  return (
    <svg
      viewBox="0 0 1000 500"
      className="mx-auto w-full max-w-5xl"
      role="img"
      aria-label="Visualization of codexfi memory extraction and retrieval cycle"
    >
      <title>
        codexfi memory flow — conversations are extracted into typed memories,
        stored in a vector database, and retrieved for future sessions
      </title>
      
      <defs>
        <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0.2" />
        </linearGradient>
        
        <linearGradient id="retrievalGrad" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.1" />
        </linearGradient>

        <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <filter id="glow-subtle">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        
        <style>
          {`
            @media (prefers-reduced-motion: no-preference) {
              .flow-line {
                stroke-dasharray: 8 6;
                animation: dashFlow 1s linear infinite;
              }
              .retrieval-line {
                stroke-dasharray: 12 12;
                animation: dashFlowRev 1s linear infinite;
              }
              
              @keyframes dashFlow {
                to { stroke-dashoffset: -14; }
              }
              @keyframes dashFlowRev {
                to { stroke-dashoffset: -24; }
              }

              .slide-node {
                animation: slideRight 8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                opacity: 0;
              }
              
              .delay-0 { animation-delay: 0s; }
              .delay-1 { animation-delay: 1.6s; }
              .delay-2 { animation-delay: 3.2s; }
              .delay-3 { animation-delay: 4.8s; }
              .delay-4 { animation-delay: 6.4s; }

              @keyframes slideRight {
                0% { transform: translateX(290px); opacity: 0; }
                10% { opacity: 1; }
                80% { opacity: 1; }
                100% { transform: translateX(670px); opacity: 0; }
              }

              .pulse {
                animation: pulseOpacity 3s ease-in-out infinite alternate;
              }
              .pulse-alt {
                animation: pulseOpacity 4s ease-in-out infinite alternate-reverse;
              }

              @keyframes pulseOpacity {
                0% { opacity: 0.3; }
                100% { opacity: 0.9; }
              }

              .float {
                animation: floatUp 6s ease-in-out infinite alternate;
              }
              @keyframes floatUp {
                0% { transform: translateY(0px); }
                100% { transform: translateY(-8px); }
              }

              .chat-appear {
                animation: popIn 8s infinite;
                opacity: 0;
              }
              @keyframes popIn {
                0%, 5% { opacity: 0; transform: translateY(10px); }
                10%, 90% { opacity: 1; transform: translateY(0); }
                95%, 100% { opacity: 0; transform: translateY(-10px); }
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .slide-node { opacity: 1; transform: translateX(480px); animation: none !important; }
              .delay-0 { transform: translateX(330px); }
              .delay-1 { transform: translateX(410px); }
              .delay-2 { transform: translateX(490px); }
              .delay-3 { transform: translateX(570px); }
              .delay-4 { transform: translateX(650px); }
              .chat-appear { opacity: 1; transform: none; animation: none !important; }
              * { animation: none !important; }
            }
          `}
        </style>
      </defs>

      {/* BACKGROUND ELEMENTS */}
      {/* Grid lines to make it feel like a technical workspace */}
      <g className="stroke-border" strokeWidth="1" strokeOpacity="0.3">
        <line x1="175" y1="0" x2="175" y2="500" strokeDasharray="4 4" />
        <line x1="500" y1="0" x2="500" y2="500" strokeDasharray="4 4" />
        <line x1="825" y1="0" x2="825" y2="500" strokeDasharray="4 4" />
        <line x1="0" y1="215" x2="1000" y2="215" strokeDasharray="4 4" />
      </g>

      {/* RETRIEVAL PATH (BOTTOM) */}
      <g>
        {/* Base Path */}
        <path 
          d="M 825 350 Q 825 450 725 450 L 275 450 Q 175 450 175 350" 
          fill="none" 
          className="stroke-border" 
          strokeWidth="2" 
        />
        {/* Animated Highlight Path */}
        <path 
          d="M 825 350 Q 825 450 725 450 L 275 450 Q 175 450 175 350" 
          fill="none" 
          stroke="url(#retrievalGrad)" 
          strokeWidth="3"
          className="retrieval-line"
          filter="url(#glow-green)"
        />
        
        {/* Retrieval Node */}
        <g className="float" style={{ transformOrigin: "500px 450px" }}>
          <rect x="420" y="434" width="160" height="32" rx="16" fill="#111" stroke="#4ade80" strokeWidth="1.5" filter="url(#glow-green)" />
          <text x="500" y="455" textAnchor="middle" fill="#4ade80" fontSize="12" fontFamily="var(--font-mono, monospace)" fontWeight="600" letterSpacing="0.5">
            [MEMORY] injected
          </text>
        </g>
      </g>

      {/* CENTRAL EXTRACTION FLOW */}
      <g>
        {/* 5 flow paths */}
        {[85, 125, 165, 205, 245].map((y, i) => (
          <line 
            key={i} 
            x1="300" 
            y1={y} 
            x2="700" 
            y2={y} 
            stroke="url(#flowGrad)" 
            strokeWidth="1.5" 
            className="flow-line" 
            opacity={0.6 - (i * 0.1)}
          />
        ))}

        {/* Sliding Memory Nodes */}
        {[
          { text: "architecture", y: 85, cls: "delay-0", color: "#a855f7" },
          { text: "tech-context", y: 125, cls: "delay-1", color: "#c084fc" },
          { text: "progress", y: 165, cls: "delay-2", color: "#e879f9" },
          { text: "learned-pattern", y: 205, cls: "delay-3", color: "#a855f7" },
          { text: "preference", y: 245, cls: "delay-4", color: "#c084fc" },
        ].map((node, i) => (
          <g key={i} className={`slide-node ${node.cls}`} style={{ transformOrigin: `0px ${node.y}px` }}>
            <rect 
              x="0" 
              y={node.y - 12} 
              width={node.text.length * 8 + 20} 
              height="24" 
              rx="12" 
              fill="#1a1a1a" 
              stroke={node.color} 
              strokeWidth="1"
              filter="url(#glow-subtle)"
            />
            <text 
              x={(node.text.length * 8 + 20) / 2} 
              y={node.y + 4} 
              textAnchor="middle" 
              fill={node.color} 
              fontSize="11" 
              fontFamily="var(--font-mono, monospace)"
            >
              {node.text}
            </text>
          </g>
        ))}
      </g>

      {/* LEFT: CONVERSATION (OpenCode) */}
      <g>
        <rect x="50" y="40" width="250" height="310" rx="12" className="fill-card stroke-border" strokeWidth="1.5" />
        
        {/* Editor Top Bar */}
        <path d="M 50 52 Q 50 40 62 40 L 288 40 Q 300 40 300 52 L 300 64 L 50 64 Z" className="fill-muted" />
        <circle cx="70" cy="52" r="4" fill="#ff5f56" />
        <circle cx="85" cy="52" r="4" fill="#ffbd2e" />
        <circle cx="100" cy="52" r="4" fill="#27c93f" />
        <text x="175" y="55" textAnchor="middle" className="fill-muted-foreground" fontSize="10" fontWeight="500">OpenCode Agent</text>

        {/* Chat Bubbles */}
        {/* User bubble 1 */}
        <g className="chat-appear" style={{ animationDelay: "0s" }}>
          <rect x="130" y="80" width="150" height="36" rx="8" className="fill-secondary stroke-border" strokeWidth="1" />
          <text x="142" y="98" className="fill-foreground" fontSize="11">Implement Auth flow</text>
          <text x="142" y="110" className="fill-muted-foreground" fontSize="9">using NextAuth.js</text>
        </g>

        {/* AI bubble 1 */}
        <g className="chat-appear" style={{ animationDelay: "2s" }}>
          <rect x="70" y="130" width="160" height="48" rx="8" className="fill-muted stroke-border" strokeWidth="1" />
          <text x="82" y="148" className="fill-foreground" fontSize="11">I'll set up the providers.</text>
          <text x="82" y="160" fill="#a855f7" fontSize="10" fontFamily="var(--font-mono, monospace)">[Extracting architecture]</text>
        </g>

        {/* User bubble 2 */}
        <g className="chat-appear" style={{ animationDelay: "4s" }}>
          <rect x="110" y="190" width="170" height="36" rx="8" className="fill-secondary stroke-border" strokeWidth="1" />
          <text x="122" y="208" className="fill-foreground" fontSize="11">Also use JWT strategy.</text>
          <text x="122" y="220" className="fill-muted-foreground" fontSize="9">It's a strict requirement.</text>
        </g>

        {/* AI bubble 2 */}
        <g className="chat-appear" style={{ animationDelay: "6s" }}>
          <rect x="70" y="240" width="150" height="48" rx="8" className="fill-muted stroke-border" strokeWidth="1" />
          <text x="82" y="258" className="fill-foreground" fontSize="11">Updated config to JWT.</text>
          <text x="82" y="270" fill="#a855f7" fontSize="10" fontFamily="var(--font-mono, monospace)">[Extracting tech-context]</text>
        </g>

        <rect x="70" y="310" width="210" height="24" rx="12" className="fill-secondary stroke-border" strokeWidth="1" />
        <text x="85" y="326" className="fill-muted-foreground" fontSize="10" fontFamily="var(--font-mono, monospace)">Type a message...</text>
      </g>

      {/* RIGHT: VECTOR DATABASE (LanceDB) */}
      <g>
        <rect x="700" y="40" width="250" height="310" rx="12" className="fill-card stroke-border" strokeWidth="1.5" />
        
        {/* DB Top Bar */}
        <path d="M 700 52 Q 700 40 712 40 L 938 40 Q 950 40 950 52 L 950 64 L 700 64 Z" className="fill-muted" />
        <text x="825" y="55" textAnchor="middle" className="fill-foreground" fontSize="12" fontWeight="600">LanceDB Vector Store</text>

        {/* Hexagon Grid Cluster (Embeddings) */}
        <g transform="translate(787, 117.5)">
          {/* Hexagon points: M 0 -20 L 17.32 -10 L 17.32 10 L 0 20 L -17.32 10 L -17.32 -10 Z */}
          {[
            { cx: 0, cy: 0, cl: "pulse" },
            { cx: 38, cy: 0, cl: "pulse-alt" },
            { cx: 76, cy: 0, cl: "pulse" },
            { cx: -19, cy: 33, cl: "pulse-alt" },
            { cx: 19, cy: 33, cl: "pulse" },
            { cx: 57, cy: 33, cl: "pulse-alt" },
            { cx: 95, cy: 33, cl: "pulse" },
            { cx: 0, cy: 66, cl: "pulse-alt" },
            { cx: 38, cy: 66, cl: "pulse" },
            { cx: 76, cy: 66, cl: "pulse-alt" },
            { cx: 19, cy: 99, cl: "pulse" },
            { cx: 57, cy: 99, cl: "pulse-alt" },
          ].map((hex, i) => (
            <path 
              key={i}
              d="M 0 -16 L 13.8 -8 L 13.8 8 L 0 16 L -13.8 8 L -13.8 -8 Z"
              transform={`translate(${hex.cx}, ${hex.cy})`}
              fill="#a855f7"
              stroke="#c084fc"
              strokeWidth="0.5"
              className={hex.cl}
              filter="url(#glow-subtle)"
            />
          ))}
          
          {/* Constellation connection lines */}
          <path d="M 0 0 L 19 33 L 38 0 L 57 33 L 76 0" fill="none" stroke="#e879f9" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
          <path d="M -19 33 L 0 66 L 19 99 L 38 66 L 57 99 L 76 66 L 95 33" fill="none" stroke="#e879f9" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
          <path d="M 19 33 L 38 66 L 57 33" fill="none" stroke="#e879f9" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
        </g>

        {/* Database Status */}
        <rect x="740" y="270" width="170" height="60" rx="6" className="fill-secondary stroke-border" strokeWidth="1" />
        <circle cx="760" cy="285" r="4" fill="#4ade80" filter="url(#glow-green)" />
        <text x="775" y="289" className="fill-foreground" fontSize="11" fontWeight="600">Storage Active</text>
        <text x="750" y="308" className="fill-muted-foreground" fontSize="9" fontFamily="var(--font-mono, monospace)">DIMENSIONS: 1024</text>
        <text x="750" y="320" className="fill-muted-foreground" fontSize="9" fontFamily="var(--font-mono, monospace)">INDEX: HNSW</text>
      </g>
    </svg>
  );
}
