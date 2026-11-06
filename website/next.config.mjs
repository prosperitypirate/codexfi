import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/install",
        destination:
          "https://raw.githubusercontent.com/prosperitypirate/codexfi/main/install",
        permanent: false, // 307 — raw GitHub URLs can shift; keep flexible
      },
      {
        // codexfi 1.0 is Claude Code–only; the OpenCode guide was replaced.
        source: "/docs/guides/opencode-setup",
        destination: "/docs/guides/claude-code-setup",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Allow prosperitypirate.com and luminexor.com to embed the homepage
        // in an iframe for the project showcase on the portfolio sites.
        // Uses modern CSP frame-ancestors (X-Frame-Options is deprecated).
        source: "/",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://prosperitypirate.com https://www.prosperitypirate.com https://luminexor.com https://www.luminexor.com http://localhost:3000",
          },
        ],
      },
    ];
  },
};

const withMDX = createMDX();
export default withMDX(config);
