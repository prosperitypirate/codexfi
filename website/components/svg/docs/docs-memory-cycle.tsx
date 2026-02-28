/**
 * Animated diagram showing the perpetual loop of codexfi turning conversations into memories and back.
 * @component
 */
export function DocsMemoryCycle() {
  return (
    <svg viewBox="0 0 640 160" width="100%" className="mx-auto w-full max-w-3xl" role="img" aria-label="A diagram showing the perpetual loop of codexfi turning conversations into memories and back.">
      <title>Memory Cycle Diagram</title>
      <defs>
        <filter id="glow-mc">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="grad-mc" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
        <marker id="arrow-flow-mc" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#c084fc" />
        </marker>
        <marker id="arrow-return-mc" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#4ade80" opacity="0.5" />
        </marker>
        <style>{`
          .flow-line-mc { stroke-dasharray: 8 6; }
          .tag-mc { opacity: 0; }
          @media (prefers-reduced-motion: no-preference) {
            .flow-line-mc { animation: dashFlow-mc 1.2s linear infinite; }
            .tag-1-mc { animation: slideTag-mc 6s linear infinite; animation-delay: 0s; }
            .tag-2-mc { animation: slideTag-mc 6s linear infinite; animation-delay: 2s; }
            .tag-3-mc { animation: slideTag-mc 6s linear infinite; animation-delay: 4s; }
            .pulse-mc { animation: glowPulse-mc 2s ease-in-out infinite alternate; }
            
            /* The path is drawn Right-to-Left. Animating to a negative offset moves dashes FORWARD along the path (Right-to-Left). */
            .return-arc-mc { animation: dashFlowReturn-mc 1.5s linear infinite; stroke-dasharray: 10 8; }
            
            @keyframes dashFlow-mc { to { stroke-dashoffset: -14; } }
            @keyframes dashFlowReturn-mc { to { stroke-dashoffset: -18; } }
            
            @keyframes slideTag-mc {
              0% { transform: translate(110px, 50px); opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { transform: translate(530px, 50px); opacity: 0; }
            }
            @keyframes glowPulse-mc {
              0% { filter: blur(2px); opacity: 0.8; }
              100% { filter: blur(6px); opacity: 1; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .flow-line-mc, .return-arc-mc, .pulse-mc, .tag-1-mc, .tag-2-mc, .tag-3-mc { animation: none !important; }
            .tag-1-mc { transform: translate(180px, 50px); opacity: 1; }
            .tag-2-mc { transform: translate(300px, 50px); opacity: 1; }
            .tag-3-mc { transform: translate(420px, 50px); opacity: 1; }
            .return-arc-mc { stroke-dasharray: none; }
          }
        `}</style>
      </defs>
      
      {/* Return Arc (from [MEMORY] to Conversation) - path goes from x=570 down, left, and up to x=60 */}
      <path className="return-arc-mc" d="M 570,88 Q 570,140 500,140 L 140,140 Q 60,140 60,94" fill="none" stroke="#4ade80" strokeWidth="2" strokeOpacity="0.5" markerEnd="url(#arrow-return-mc)" />
      
      {/* Flow Lines */}
      <line x1="110" y1="70" x2="155" y2="70" stroke="url(#grad-mc)" strokeWidth="2" className="flow-line-mc" markerEnd="url(#arrow-flow-mc)" />
      <line x1="230" y1="70" x2="275" y2="70" stroke="url(#grad-mc)" strokeWidth="2" className="flow-line-mc" markerEnd="url(#arrow-flow-mc)" />
      <line x1="350" y1="70" x2="395" y2="70" stroke="url(#grad-mc)" strokeWidth="2" className="flow-line-mc" markerEnd="url(#arrow-flow-mc)" />
      <line x1="470" y1="70" x2="525" y2="70" stroke="url(#grad-mc)" strokeWidth="2" className="flow-line-mc" markerEnd="url(#arrow-flow-mc)" />

      {/* Tags */}
      <g className="tag-mc tag-1-mc">
        <rect x="-40" y="-10" width="80" height="16" rx="8" fill="#a855f7" />
        <text x="0" y="2" fontSize="9" fontFamily="var(--font-mono, monospace)" fill="#fff" textAnchor="middle" alignmentBaseline="middle">architecture</text>
      </g>
      <g className="tag-mc tag-2-mc">
        <rect x="-35" y="-10" width="70" height="16" rx="8" fill="#e879f9" />
        <text x="0" y="2" fontSize="9" fontFamily="var(--font-mono, monospace)" fill="#fff" textAnchor="middle" alignmentBaseline="middle">progress</text>
      </g>
      <g className="tag-mc tag-3-mc">
        <rect x="-40" y="-10" width="80" height="16" rx="8" fill="#c084fc" />
        <text x="0" y="2" fontSize="9" fontFamily="var(--font-mono, monospace)" fill="#fff" textAnchor="middle" alignmentBaseline="middle">tech-context</text>
      </g>

      {/* Nodes */}
      <rect x="10" y="52" width="100" height="36" rx="18" className="fill-card stroke-[#a855f7]" strokeWidth="2" />
      <text x="60" y="74" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">Conversation</text>
      
      <rect x="160" y="52" width="70" height="36" rx="18" className="fill-card stroke-[#c084fc]" strokeWidth="2" />
      <text x="195" y="74" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">Extract</text>
      
      <rect x="280" y="52" width="70" height="36" rx="18" className="fill-card stroke-[#c084fc]" strokeWidth="2" />
      <text x="315" y="74" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">Embed</text>

      <rect x="400" y="52" width="70" height="36" rx="18" className="fill-card stroke-[#c084fc]" strokeWidth="2" />
      <text x="435" y="74" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">Store</text>

      <g filter="url(#glow-mc)" className="pulse-mc">
        <rect x="530" y="52" width="80" height="36" rx="18" className="fill-card stroke-[#4ade80]" strokeWidth="2" />
      </g>
      <rect x="530" y="52" width="80" height="36" rx="18" className="fill-card stroke-[#4ade80]" strokeWidth="2" />
      <text x="570" y="74" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#4ade80" textAnchor="middle" alignmentBaseline="middle">[MEMORY]</text>

      {/* System prompt text */}
      <text x="320" y="132" fontSize="10" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">injected into system prompt ◄</text>
    </svg>
  );
}
