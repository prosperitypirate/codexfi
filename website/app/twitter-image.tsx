import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "codexfi — Persistent memory for AI coding agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0a0a",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle glow backdrop */}
        <div
          style={{
            position: "absolute",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />

        {/* Diamond icon */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 32 32"
          fill="none"
          style={{ marginBottom: 32 }}
        >
          <rect width="32" height="32" rx="8" fill="#0a0a0a" />
          <polygon points="16,4 28,16 16,28 4,16" fill="#a855f7" />
          <polygon
            points="16,8 24,16 16,24 8,16"
            fill="#c084fc"
            opacity="0.4"
          />
          <circle cx="16" cy="16" r="3" fill="#e879f9" />
        </svg>

        {/* Wordmark */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#f5f5f5",
            letterSpacing: "-2px",
            marginBottom: 20,
          }}
        >
          codexfi
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "#a0a0a0",
            textAlign: "center",
            maxWidth: 800,
            lineHeight: 1.4,
          }}
        >
          Persistent memory for AI coding agents
        </div>

        {/* Install hint */}
        <div
          style={{
            marginTop: 48,
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 12,
            padding: "14px 32px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ color: "#4ade80", fontFamily: "monospace", fontSize: 20 }}>
            $
          </span>
          <span
            style={{
              color: "#f5f5f5",
              fontFamily: "monospace",
              fontSize: 20,
            }}
          >
            curl -fsSL https://codexfi.com/install | bash
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
