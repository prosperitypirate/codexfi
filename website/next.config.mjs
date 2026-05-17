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
    ];
  },
  async headers() {
    return [
      {
        // Allow prosperitypirate.com to embed the homepage in an iframe
        // for the project showcase on the portfolio site.
        // Uses modern CSP frame-ancestors (X-Frame-Options is deprecated).
        source: "/",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://prosperitypirate.com https://www.prosperitypirate.com",
          },
        ],
      },
    ];
  },
};

const withMDX = createMDX();
export default withMDX(config);
