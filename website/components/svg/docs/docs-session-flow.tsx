/**
 * Animated diagram showing the full hook flow from user message through memory retrieval, LLM call, and auto-save storage.
 * @component
 */
export function DocsSessionFlow() {
  return (
    <svg viewBox="0 0 680 320" width="100%" className="mx-auto w-full max-w-3xl" role="img" aria-label="The full hook flow from user message through memory retrieval, LLM call, and auto-save storage.">
      <title>Session Flow Diagram</title>
      <defs>
        <filter id="glow-sf">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <marker id="arrow-flow-sf" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#c084fc" />
        </marker>
        <marker id="arrow-flow-bottom-sf" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#a855f7" />
        </marker>
        <marker id="arrow-return-sf" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#a855f7" opacity="0.4" />
        </marker>
        <style>{`
          .flow-line-sf { stroke-dasharray: 8 6; stroke: #c084fc; stroke-width: 2; }
          .flow-line-b-sf { stroke-dasharray: 8 6; stroke: #a855f7; stroke-width: 2; }
          @media (prefers-reduced-motion: no-preference) {
            .flow-line-sf { animation: dashFlow-sf 1s linear infinite; }
            .flow-line-b-sf { animation: dashFlow-sf 1s linear infinite; animation-delay: 0.5s; }
            .pulse-sf { animation: glowPulse-sf 2s ease-in-out infinite alternate; }
            
            /* Path drawn Right-to-Left. Animating to negative offset moves dashes FORWARD (Right-to-Left) */
            .return-arc-sf { animation: dashFlowReturn-sf 2s linear infinite; stroke-dasharray: 10 8; }
            
            @keyframes dashFlow-sf { to { stroke-dashoffset: -14; } }
            @keyframes dashFlowReturn-sf { to { stroke-dashoffset: -18; } }
            
            @keyframes glowPulse-sf {
              0% { filter: blur(2px); opacity: 0.8; }
              100% { filter: blur(6px); opacity: 1; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .flow-line-sf, .flow-line-b-sf, .pulse-sf, .return-arc-sf { animation: none !important; }
            .return-arc-sf { stroke-dasharray: none; }
          }
        `}</style>
      </defs>

      {/* Dividing line */}
      <line x1="20" y1="175" x2="660" y2="175" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="stroke-border" />
      <text x="340" y="172" fontSize="10" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">after assistant turn</text>

      {/* Cycle arrow (from Right to Left) */}
      <path className="return-arc-sf" d="M 615,106 Q 615,240 500,240 L 135,240" fill="none" stroke="#a855f7" strokeWidth="2" strokeOpacity="0.4" markerEnd="url(#arrow-return-sf)" />

      {/* Top Lane Arrows */}
      <line x1="130" y1="90" x2="155" y2="90" className="flow-line-sf" markerEnd="url(#arrow-flow-sf)" />
      <line x1="270" y1="90" x2="295" y2="90" className="flow-line-sf" markerEnd="url(#arrow-flow-sf)" />
      <line x1="420" y1="90" x2="445" y2="90" className="flow-line-sf" markerEnd="url(#arrow-flow-sf)" />
      <line x1="530" y1="90" x2="555" y2="90" className="flow-line-sf" markerEnd="url(#arrow-flow-sf)" />

      {/* Turn 1 / 2+ branch label */}
      <text x="235" y="120" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">Turn 1: full fetch / Turn 2+: refresh</text>

      {/* Bottom Lane Arrows */}
      <line x1="130" y1="240" x2="155" y2="240" className="flow-line-b-sf" markerEnd="url(#arrow-flow-bottom-sf)" />
      <line x1="260" y1="240" x2="285" y2="240" className="flow-line-b-sf" markerEnd="url(#arrow-flow-bottom-sf)" />
      <line x1="390" y1="240" x2="415" y2="240" className="flow-line-b-sf" markerEnd="url(#arrow-flow-bottom-sf)" />

      {/* Extraction sub-steps */}
      <text x="340" y="272" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">extract · embed · dedup · age</text>

      {/* Top Lane Nodes */}
      <rect x="20" y="74" width="110" height="32" rx="8" className="fill-muted stroke-border" strokeWidth="1" />
      <text x="75" y="94" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">User Message</text>

      <rect x="160" y="74" width="110" height="32" rx="8" className="fill-card stroke-[#c084fc]" strokeWidth="2" />
      <text x="215" y="94" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">chat.message</text>

      <rect x="300" y="74" width="120" height="32" rx="8" className="fill-card stroke-[#a855f7]" strokeWidth="2" />
      <text x="360" y="94" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">system.transform</text>

      <g filter="url(#glow-sf)" className="pulse-sf">
        <rect x="450" y="74" width="80" height="32" rx="8" className="fill-card stroke-[#4ade80]" strokeWidth="2" />
      </g>
      <rect x="450" y="74" width="80" height="32" rx="8" className="fill-card stroke-[#4ade80]" strokeWidth="2" />
      <text x="490" y="94" fontSize="11" fontFamily="var(--font-mono, monospace)" fill="#4ade80" textAnchor="middle" alignmentBaseline="middle">[MEMORY]</text>

      <rect x="560" y="74" width="110" height="32" rx="8" className="fill-card stroke-border" strokeWidth="2" />
      <text x="615" y="94" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">LLM Response</text>

      {/* Bottom Lane Nodes */}
      <rect x="20" y="224" width="110" height="32" rx="8" className="fill-muted stroke-border" strokeWidth="1" />
      <text x="75" y="244" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">Assistant turn</text>

      <rect x="160" y="224" width="100" height="32" rx="8" className="fill-card stroke-[#c084fc]" strokeWidth="2" />
      <text x="210" y="244" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">event hook</text>

      <rect x="290" y="224" width="100" height="32" rx="8" className="fill-card stroke-[#c084fc]" strokeWidth="2" />
      <text x="340" y="244" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">auto-save</text>

      <rect x="420" y="224" width="100" height="32" rx="8" className="fill-card stroke-[#a855f7]" strokeWidth="2" />
      <text x="470" y="244" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground" textAnchor="middle" alignmentBaseline="middle">LanceDB</text>
    </svg>
  );
}
