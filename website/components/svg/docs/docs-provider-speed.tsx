/**
 * Animated comparison chart of extraction speeds across Anthropic, xAI, and Google providers.
 * @component
 */
export function DocsProviderSpeed() {
  return (
    <svg viewBox="0 0 520 160" width="100%" className="mx-auto w-full max-w-3xl" role="img" aria-label="A comparison of extraction speeds across Anthropic, xAI, and Google providers.">
      <title>Provider Speed Comparison</title>
      <defs>
        <style>{`
          .bar-anthropic-ps { width: 0; }
          .bar-xai-ps { width: 0; }
          .bar-google-ps { width: 0; }
          
          @media (prefers-reduced-motion: no-preference) {
            .bar-anthropic-ps { animation: fillAnthropic-ps 4.5s ease-out infinite; }
            .bar-xai-ps { animation: fillXai-ps 4.5s ease-out infinite; }
            .bar-google-ps { animation: fillGoogle-ps 4.5s ease-out infinite; }
            
            @keyframes fillAnthropic-ps {
              0% { width: 0; }
              33%, 100% { width: 52px; }
            }
            @keyframes fillXai-ps {
              0% { width: 0; }
              33%, 100% { width: 19px; }
            }
            @keyframes fillGoogle-ps {
              0% { width: 0; }
              33%, 100% { width: 77px; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .bar-anthropic-ps, .bar-xai-ps, .bar-google-ps { animation: none !important; }
            .bar-anthropic-ps { width: 52px; }
            .bar-xai-ps { width: 19px; }
            .bar-google-ps { width: 77px; }
          }
        `}</style>
      </defs>

      {/* Card 1: Anthropic */}
      <rect x="10" y="15" width="150" height="130" rx="10" className="fill-card stroke-[#4ade80]" strokeWidth="2" />
      <text x="25" y="45" fontSize="12" fontWeight="600" fontFamily="var(--font-mono, monospace)" className="fill-foreground">Anthropic</text>
      <text x="25" y="59" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground">claude-haiku-4-5</text>
      <text x="25" y="90" fontSize="18" fontWeight="700" fontFamily="var(--font-mono, monospace)" fill="#a855f7">~14s</text>
      
      {/* Badge */}
      <rect x="25" y="115" width="60" height="16" rx="4" fill="#a855f7" fillOpacity="0.15" stroke="#a855f7" strokeWidth="1" />
      <text x="55" y="126" fontSize="8" fontFamily="var(--font-mono, monospace)" fill="#a855f7" textAnchor="middle">DEFAULT ★</text>
      
      {/* Speed Bar (max width 110px) */}
      <rect x="25" y="100" width="110" height="6" rx="3" className="fill-muted" />
      <rect x="25" y="100" height="6" rx="3" fill="#a855f7" className="bar-anthropic-ps" />

      {/* Card 2: xAI */}
      <rect x="185" y="15" width="150" height="130" rx="10" className="fill-card stroke-border" strokeWidth="1.5" />
      <text x="200" y="45" fontSize="12" fontWeight="600" fontFamily="var(--font-mono, monospace)" className="fill-foreground">xAI</text>
      <text x="200" y="59" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground">grok-4-1-fast</text>
      <text x="200" y="90" fontSize="22" fontWeight="700" fontFamily="var(--font-mono, monospace)" fill="#4ade80">~5s</text>
      
      {/* Badge */}
      <rect x="200" y="115" width="60" height="16" rx="4" fill="#4ade80" fillOpacity="0.15" stroke="#4ade80" strokeWidth="1" />
      <text x="230" y="126" fontSize="8" fontFamily="var(--font-mono, monospace)" fill="#4ade80" textAnchor="middle">⚡ FASTEST</text>
      
      {/* Speed Bar */}
      <rect x="200" y="100" width="110" height="6" rx="3" className="fill-muted" />
      <rect x="200" y="100" height="6" rx="3" fill="#4ade80" className="bar-xai-ps" />

      {/* Card 3: Google */}
      <rect x="360" y="15" width="150" height="130" rx="10" className="fill-card stroke-border" strokeWidth="1.5" />
      <text x="375" y="45" fontSize="12" fontWeight="600" fontFamily="var(--font-mono, monospace)" className="fill-foreground">Google</text>
      <text x="375" y="59" fontSize="9" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground">gemini-3-flash</text>
      <text x="375" y="90" fontSize="18" fontWeight="700" fontFamily="var(--font-mono, monospace)" fill="#c084fc">~21s</text>
      
      {/* Badge */}
      <rect x="375" y="115" width="55" height="16" rx="4" fill="#c084fc" fillOpacity="0.15" stroke="#c084fc" strokeWidth="1" />
      <text x="402" y="126" fontSize="8" fontFamily="var(--font-mono, monospace)" fill="#c084fc" textAnchor="middle">{ } JSON</text>
      
      {/* Speed Bar */}
      <rect x="375" y="100" width="110" height="6" rx="3" className="fill-muted" />
      <rect x="375" y="100" height="6" rx="3" fill="#c084fc" className="bar-google-ps" />
    </svg>
  );
}
