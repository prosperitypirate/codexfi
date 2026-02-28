/**
 * Animated diagram of all 11 memory types organized by project scope versus user scope.
 * @component
 */
export function DocsMemoryTaxonomy() {
  return (
    <svg viewBox="0 0 600 280" width="100%" className="mx-auto w-full max-w-3xl" role="img" aria-label="A map of all 11 memory types organized by project scope versus user scope.">
      <title>Memory Taxonomy</title>
      <defs>
        <filter id="glow-mt">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <style>{`
          .badge-mt { opacity: 0; }
          .glow-badge-mt { opacity: 0; }
          
          @media (prefers-reduced-motion: no-preference) {
            .badge-mt { animation: fadeIn-mt 0.4s ease forwards; }
            .badge-0 { animation-delay: 0.0s; }
            .badge-1 { animation-delay: 0.1s; }
            .badge-2 { animation-delay: 0.2s; }
            .badge-3 { animation-delay: 0.3s; }
            .badge-4 { animation-delay: 0.4s; }
            .badge-5 { animation-delay: 0.5s; }
            .badge-6 { animation-delay: 0.6s; }
            .badge-7 { animation-delay: 0.7s; }
            .badge-8 { animation-delay: 0.8s; }
            .badge-9 { animation-delay: 0.9s; }
            
            .badge-user-mt { animation: fadeIn-mt 0.4s ease forwards; animation-delay: 1.2s; }
            .glow-badge-mt { animation: pulseGlow-mt 2s ease-in-out infinite alternate; animation-delay: 1.6s; }

            @keyframes fadeIn-mt {
              to { opacity: 1; }
            }
            @keyframes pulseGlow-mt {
              0% { filter: blur(2px); opacity: 0.5; }
              100% { filter: blur(5px); opacity: 1; }
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .badge-mt, .badge-user-mt, .glow-badge-mt { animation: none !important; opacity: 1; }
          }
        `}</style>
      </defs>

      {/* Dividers & Headers */}
      <line x1="450" y1="20" x2="450" y2="260" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="stroke-border" />
      <text x="30" y="24" fontSize="10" letterSpacing="1" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground">PROJECT SCOPE</text>
      <text x="460" y="24" fontSize="10" letterSpacing="1" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground">USER SCOPE</text>

      {/* Project Scope Badges */}
      {/* Col 1 */}
      <g className="badge-mt badge-0" transform="translate(30, 50)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#a855f7" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">project-brief</text>
      </g>
      <g className="badge-mt badge-2" transform="translate(30, 90)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#a855f7" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">tech-context</text>
      </g>
      <g className="badge-mt badge-4" transform="translate(30, 130)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#e879f9" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">progress</text>
      </g>
      <g className="badge-mt badge-6" transform="translate(30, 170)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#c084fc" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">error-solution</text>
      </g>
      <g className="badge-mt badge-8" transform="translate(30, 210)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#a855f7" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">project-config</text>
      </g>

      {/* Col 2 */}
      <g className="badge-mt badge-1" transform="translate(240, 50)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#a855f7" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">architecture</text>
      </g>
      <g className="badge-mt badge-3" transform="translate(240, 90)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#a855f7" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">product-context</text>
      </g>
      <g className="badge-mt badge-5" transform="translate(240, 130)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#e879f9" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">session-summary</text>
      </g>
      <g className="badge-mt badge-7" transform="translate(240, 170)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#c084fc" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">learned-pattern</text>
      </g>
      <g className="badge-mt badge-9" transform="translate(240, 210)">
        <rect width="180" height="28" rx="14" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#c084fc" />
        <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">conversation</text>
      </g>

      {/* User Scope */}
      <g transform="translate(460, 130)">
        <g className="glow-badge-mt" filter="url(#glow-mt)">
          <rect width="130" height="28" rx="14" className="fill-transparent stroke-[#4ade80]" strokeWidth="2" />
        </g>
        <g className="badge-user-mt badge-mt">
          <rect width="130" height="28" rx="14" className="fill-card stroke-[#4ade80]" strokeWidth="1.5" />
          <circle cx="14" cy="14" r="3" fill="#4ade80" />
          <text x="26" y="18" fontSize="11" fontFamily="var(--font-mono, monospace)" className="fill-foreground">preference</text>
          <text x="65" y="44" fontSize="9" fontStyle="italic" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">follows you across</text>
          <text x="65" y="56" fontSize="9" fontStyle="italic" fontFamily="var(--font-mono, monospace)" className="fill-muted-foreground" textAnchor="middle">all projects</text>
        </g>
      </g>
    </svg>
  );
}
