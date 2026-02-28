import React from "react";

const IconAutomatic = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-foreground" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 42L42 22" className="stroke-[#a855f7]" strokeWidth="3" />
    <path d="M18 46l4 4" strokeWidth="3" />
    <g className="kf-sparkle-1 text-[#4ade80]">
      <path d="M46 10v6m-3-3h6" />
    </g>
    <g className="kf-sparkle-2 text-[#c084fc]">
      <path d="M52 26v4m-2-2h4" />
    </g>
    <g className="kf-sparkle-3 text-[#e879f9]">
      <path d="M26 12v4m-2-2h4" />
    </g>
  </svg>
);

const IconSelfHosted = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-foreground">
    <rect x="12" y="18" width="40" height="24" rx="2" className="stroke-border" />
    <path d="M8 46h48l-4-4H12z" className="stroke-border fill-muted" />
    <g className="kf-db-pulse">
      <ellipse cx="32" cy="24" rx="6" ry="2" className="stroke-[#4ade80]" />
      <path d="M26 24v8c0 1.1 2.7 2 6 2s6-.9 6-2v-8" className="stroke-[#4ade80]" />
      <path d="M26 28c0 1.1 2.7 2 6 2s6-.9 6-2" className="stroke-[#4ade80]" />
    </g>
    <path d="M46 14l6 6M52 14l-6 6" className="stroke-muted-foreground opacity-50 kf-cloud-cross" />
  </svg>
);

const IconEmbeddings = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-foreground">
    <path d="M20 20l-8 12 8 12" className="stroke-[#c084fc]" />
    <path d="M44 20l8 12-8 12" className="stroke-[#c084fc]" />
    <rect x="26" y="26" width="12" height="12" rx="2" className="stroke-[#a855f7]" />
    <line x1="26" y1="32" x2="38" y2="32" strokeWidth="3" className="stroke-[#4ade80] kf-embed-line" />
  </svg>
);

const IconProviders = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-foreground">
    <circle cx="16" cy="18" r="4" className="stroke-[#c084fc]" />
    <circle cx="16" cy="32" r="4" className="stroke-[#4ade80]" />
    <circle cx="16" cy="46" r="4" className="stroke-[#a855f7]" />
    
    <path d="M20 18 Q 34 18 34 32" className="kf-flow-dash stroke-[#c084fc]" />
    <path d="M20 32 L 36 32" className="kf-flow-dash stroke-[#4ade80]" />
    <path d="M20 46 Q 34 46 34 32" className="kf-flow-dash stroke-[#a855f7]" />
    
    <circle cx="44" cy="32" r="8" className="stroke-foreground fill-card kf-pulse-node" />
  </svg>
);

const IconTyped = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-foreground">
    <rect x="14" y="16" width="36" height="8" rx="4" className="fill-card stroke-[#a855f7] kf-type-1" />
    <rect x="14" y="28" width="28" height="8" rx="4" className="fill-card stroke-[#e879f9] kf-type-2" />
    <rect x="14" y="40" width="32" height="8" rx="4" className="fill-card stroke-[#c084fc] kf-type-3" />
  </svg>
);

const IconDedup = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-foreground">
    <rect x="16" y="20" width="20" height="24" rx="4" className="stroke-border kf-dedup-left" />
    <rect x="28" y="20" width="20" height="24" rx="4" className="stroke-[#4ade80] fill-card kf-dedup-right" />
    <path d="M33 32 L 36 35 L 42 27" className="stroke-[#4ade80] kf-dedup-check" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconVersioning = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-foreground" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 20h12l6 6v14a2 2 0 01-2 2H16a2 2 0 01-2-2V22a2 2 0 012-2z" className="stroke-muted-foreground kf-vers-old" />
    <path d="M30 24h12l6 6v14a2 2 0 01-2 2H30a2 2 0 01-2-2V26a2 2 0 012-2z" className="fill-card stroke-[#f59e0b] kf-vers-new" />
    <path d="M22 36 L 28 36 M 26 34 L 28 36 L 26 38" className="stroke-[#f59e0b] kf-vers-arrow" />
  </svg>
);

const IconCompaction = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-foreground" strokeLinecap="round">
    <rect x="18" y="16" width="28" height="12" rx="3" className="fill-card stroke-[#a855f7] kf-compact-mem" />
    <path d="M26 22h12" className="stroke-[#a855f7] kf-compact-mem" />
    <line x1="20" y1="36" x2="44" y2="36" className="stroke-muted-foreground kf-compact-line-1" />
    <line x1="20" y1="44" x2="40" y2="44" className="stroke-muted-foreground kf-compact-line-2" />
    <line x1="20" y1="52" x2="44" y2="52" className="stroke-muted-foreground kf-compact-line-3" />
  </svg>
);

const IconPrivacy = () => (
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-foreground" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 32l-6-6 6-6" className="stroke-border" />
    <path d="M46 32l6-6-6-6" className="stroke-border" />
    <rect x="24" y="30" width="16" height="12" rx="2" className="fill-card stroke-[#4ade80]" />
    <path d="M28 30v-4a4 4 0 018 0v4" className="stroke-[#4ade80] kf-privacy-lock" />
  </svg>
);

export function DocsKeyFeatures() {
  const features = [
    {
      title: "Fully automatic",
      desc: "Memories save after every assistant turn with zero user action.",
      icon: <IconAutomatic />,
    },
    {
      title: "Self-hosted",
      desc: "All data stays on your machine; no cloud, no Docker, no separate server.",
      icon: <IconSelfHosted />,
    },
    {
      title: "Code-optimized embeddings",
      desc: "Voyage voyage-code-3 (1024 dimensions), purpose-built for code.",
      icon: <IconEmbeddings />,
    },
    {
      title: "Multi-provider extraction",
      desc: "Anthropic Claude Haiku (default), xAI Grok (fastest), Google Gemini.",
      icon: <IconProviders />,
    },
    {
      title: "Typed memory system",
      desc: "11 memory types for structured knowledge organization.",
      icon: <IconTyped />,
    },
    {
      title: "Smart deduplication",
      desc: "Cosine similarity prevents storing duplicate memories.",
      icon: <IconDedup />,
    },
    {
      title: "Relational versioning",
      desc: "Contradicting memories are automatically superseded.",
      icon: <IconVersioning />,
    },
    {
      title: "Compaction-proof",
      desc: "Memory lives in the system prompt, surviving context window truncation.",
      icon: <IconCompaction />,
    },
    {
      title: "Privacy filter",
      desc: "Wrap content in <private>...</private> to exclude it from extraction.",
      icon: <IconPrivacy />,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 my-8">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .kf-sparkle-1 { animation: pulse-opacity-kf 1.5s infinite alternate; animation-delay: 0s; }
          .kf-sparkle-2 { animation: pulse-opacity-kf 1.5s infinite alternate; animation-delay: 0.5s; }
          .kf-sparkle-3 { animation: pulse-opacity-kf 1.5s infinite alternate; animation-delay: 1s; }
          .kf-db-pulse { animation: float-kf 3s ease-in-out infinite; }
          .kf-embed-line { stroke-dasharray: 4 4; animation: dash-kf 1s linear infinite; }
          .kf-flow-dash { stroke-dasharray: 4 4; animation: dash-kf 1s linear infinite; }
          .kf-pulse-node { animation: pulse-opacity-kf 1.5s infinite alternate; }
          
          .kf-type-1 { animation: slide-in-kf 4s infinite; animation-delay: 0s; }
          .kf-type-2 { animation: slide-in-kf 4s infinite; animation-delay: 0.2s; }
          .kf-type-3 { animation: slide-in-kf 4s infinite; animation-delay: 0.4s; }
          
          .kf-dedup-left { animation: dedup-left-kf 4s infinite; }
          .kf-dedup-check { stroke-dasharray: 15; animation: dedup-check-kf 4s infinite; }
          
          .kf-vers-old { animation: vers-old-kf 4s infinite; }
          .kf-vers-new { animation: vers-new-kf 4s infinite; }
          .kf-vers-arrow { stroke-dasharray: 10; animation: vers-arrow-kf 4s infinite; }
          
          .kf-compact-line-1 { animation: compact-line-kf 4s infinite; animation-delay: 0s; }
          .kf-compact-line-2 { animation: compact-line-kf 4s infinite; animation-delay: 0.2s; }
          .kf-compact-line-3 { animation: compact-line-kf 4s infinite; animation-delay: 0.4s; }
          .kf-compact-mem { animation: pulse-stroke-kf 2s infinite alternate; }
          
          .kf-privacy-lock { animation: lock-kf 4s infinite; }
          
          @keyframes pulse-opacity-kf { 0% { opacity: 0.2; } 100% { opacity: 1; } }
          @keyframes pulse-stroke-kf { 0% { opacity: 0.6; stroke-width: 2px; } 100% { opacity: 1; stroke-width: 2.5px; filter: drop-shadow(0 0 4px #a855f7); } }
          @keyframes float-kf { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
          @keyframes dash-kf { to { stroke-dashoffset: -8; } }
          
          @keyframes slide-in-kf {
            0%, 10% { opacity: 0; transform: translateX(-4px); }
            20%, 90% { opacity: 1; transform: translateX(0); }
            100% { opacity: 0; transform: translateX(4px); }
          }
          
          @keyframes dedup-left-kf {
            0%, 20% { opacity: 1; transform: translateX(0); }
            40%, 80% { opacity: 0; transform: translateX(12px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          @keyframes dedup-check-kf {
            0%, 30% { opacity: 0; stroke-dashoffset: 15; }
            50%, 80% { opacity: 1; stroke-dashoffset: 0; }
            100% { opacity: 0; stroke-dashoffset: 15; }
          }
          
          @keyframes vers-old-kf {
            0%, 30% { opacity: 1; transform: translateY(0) scale(1); }
            50%, 100% { opacity: 0; transform: translateY(4px) scale(0.95); }
          }
          @keyframes vers-new-kf {
            0%, 30% { opacity: 0; transform: translateY(-4px) scale(0.95); }
            50%, 100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes vers-arrow-kf {
            0%, 40% { stroke-dashoffset: 10; opacity: 0; }
            60%, 100% { stroke-dashoffset: 0; opacity: 1; }
          }
          
          @keyframes compact-line-kf {
            0%, 40% { opacity: 1; stroke-dasharray: 24; stroke-dashoffset: 0; }
            60%, 100% { opacity: 0.1; stroke-dasharray: 24; stroke-dashoffset: 24; }
          }
          
          @keyframes lock-kf {
            0%, 20% { transform: translateY(-3px); }
            30%, 80% { transform: translateY(0); }
            90%, 100% { transform: translateY(-3px); }
          }
        }
      `}</style>
      
      {features.map((f, i) => (
        <div 
          key={i} 
          className="group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm transition-all duration-300 hover:border-border/80 hover:shadow-md hover:bg-card/80"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/50 transition-colors group-hover:bg-muted">
            {f.icon}
          </div>
          <div>
            <h3 className="font-semibold leading-tight mb-1.5">{f.title}</h3>
            <p className="text-sm text-muted-foreground leading-snug">{f.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
