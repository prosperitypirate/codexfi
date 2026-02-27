export function MemoryFlowSVG() {
  return (
    <svg
      viewBox="0 0 800 400"
      className="mx-auto w-full max-w-4xl"
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
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0.4" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Conversation node */}
      <g>
        <rect
          x="40"
          y="120"
          width="160"
          height="160"
          rx="12"
          fill="#1a1a1a"
          stroke="#2a2a2a"
          strokeWidth="1"
        />
        <text x="120" y="155" textAnchor="middle" fill="#f5f5f5" fontSize="14" fontWeight="600">
          Conversation
        </text>
        <rect x="60" y="170" width="120" height="8" rx="4" fill="#2a2a2a" />
        <rect x="60" y="186" width="90" height="8" rx="4" fill="#2a2a2a" />
        <rect x="60" y="202" width="110" height="8" rx="4" fill="#2a2a2a" />
        <rect x="60" y="218" width="80" height="8" rx="4" fill="#2a2a2a" />
        <rect x="60" y="234" width="100" height="8" rx="4" fill="#2a2a2a" />
        <rect x="60" y="250" width="70" height="8" rx="4" fill="#2a2a2a" />
      </g>

      {/* Flow arrow: extraction */}
      <line
        x1="210"
        y1="200"
        x2="300"
        y2="200"
        stroke="url(#flowGrad)"
        strokeWidth="2"
        strokeDasharray="6 4"
        filter="url(#glow)"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;-20"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </line>
      <text x="255" y="190" textAnchor="middle" fill="#c084fc" fontSize="10">
        extract
      </text>

      {/* Memory types node */}
      <g>
        <rect
          x="310"
          y="100"
          width="180"
          height="200"
          rx="12"
          fill="#1a1a1a"
          stroke="#a855f7"
          strokeWidth="1"
          strokeOpacity="0.4"
        />
        <text x="400" y="135" textAnchor="middle" fill="#f5f5f5" fontSize="14" fontWeight="600">
          Memory Types
        </text>
        {[
          "architecture",
          "tech-context",
          "progress",
          "product-context",
          "learned-pattern",
        ].map((type, i) => (
          <g key={type}>
            <rect
              x="325"
              y={152 + i * 26}
              width={type.length * 8.5 + 16}
              height="20"
              rx="10"
              fill="#a855f7"
              fillOpacity="0.15"
              stroke="#a855f7"
              strokeWidth="0.5"
              strokeOpacity="0.3"
            />
            <text
              x="335"
              y={166 + i * 26}
              fill="#c084fc"
              fontSize="11"
              fontFamily="monospace"
            >
              {type}
            </text>
          </g>
        ))}
      </g>

      {/* Flow arrow: store */}
      <line
        x1="500"
        y1="200"
        x2="580"
        y2="200"
        stroke="url(#flowGrad)"
        strokeWidth="2"
        strokeDasharray="6 4"
        filter="url(#glow)"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;-20"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </line>
      <text x="540" y="190" textAnchor="middle" fill="#c084fc" fontSize="10">
        store
      </text>

      {/* Vector DB node */}
      <g>
        <rect
          x="590"
          y="130"
          width="160"
          height="140"
          rx="12"
          fill="#1a1a1a"
          stroke="#2a2a2a"
          strokeWidth="1"
        />
        <text x="670" y="165" textAnchor="middle" fill="#f5f5f5" fontSize="14" fontWeight="600">
          LanceDB
        </text>
        <text x="670" y="183" textAnchor="middle" fill="#a0a0a0" fontSize="11">
          vector database
        </text>
        {/* Vector dots cluster */}
        {[
          [640, 210],
          [660, 205],
          [680, 215],
          [700, 208],
          [650, 225],
          [670, 230],
          [690, 222],
          [655, 242],
          [675, 248],
          [695, 238],
        ].map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="4"
            fill="#a855f7"
            fillOpacity={0.3 + (i % 3) * 0.2}
            filter="url(#glow)"
          />
        ))}
      </g>

      {/* Retrieval path (bottom) */}
      <path
        d="M 590 270 C 590 340, 210 340, 210 280"
        fill="none"
        stroke="#4ade80"
        strokeWidth="1.5"
        strokeDasharray="6 4"
        strokeOpacity="0.5"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;20"
          dur="2s"
          repeatCount="indefinite"
        />
      </path>
      <text x="400" y="350" textAnchor="middle" fill="#4ade80" fontSize="10" fillOpacity="0.7">
        retrieve → [MEMORY] block
      </text>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          animate {
            animation: none !important;
          }
        }
      `}</style>
    </svg>
  );
}
