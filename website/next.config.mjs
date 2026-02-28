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
};

const withMDX = createMDX();
export default withMDX(config);
