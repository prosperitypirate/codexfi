# codexfi.com

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Fumadocs](https://img.shields.io/badge/Fumadocs-v16-6B21A8?style=flat)](https://fumadocs.vercel.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![pnpm](https://img.shields.io/badge/pnpm-package_manager-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?style=flat&logo=vercel&logoColor=white)](https://vercel.com/)

-----

The documentation and landing site for [codexfi](https://www.npmjs.com/package/codexfi) — the OpenCode memory plugin.

Live at **[codexfi.com](https://codexfi.com)**.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| Docs engine | [Fumadocs v16](https://fumadocs.vercel.app/) + MDX |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) (CSS-first config) |
| Animations | [Motion](https://motion.dev/) (`motion/react`) |
| Search | Fumadocs Orama (built-in, no external service) |
| Deployment | [Vercel](https://vercel.com/) (auto-deploy on push to `main`) |
| Package manager | [pnpm](https://pnpm.io/) |
| Node | 22+ required |

## Development

```bash
pnpm install
pnpm dev      # http://localhost:3000
```

## Build

```bash
pnpm build    # must produce zero errors and zero warnings
```

## Structure

```
website/
├── app/
│   ├── (home)/          # Landing page
│   ├── docs/            # Documentation layout
│   ├── api/search/      # Fumadocs search API route
│   ├── icon.svg         # Favicon
│   ├── opengraph-image.tsx
│   └── twitter-image.tsx
├── components/
│   └── landing/         # Hero, Features, HowItWorks, Footer
├── content/
│   └── docs/            # MDX documentation pages
├── lib/
│   ├── animations.ts    # Motion scroll-reveal presets
│   └── source.ts        # Fumadocs content loader
└── public/              # Static assets
```

## Design decisions

- **`--color-brand-*` theme tokens** — namespaced to avoid collisions with shadcn/ui's default palette
- **`motion/react`** (not `framer-motion`) — correct package for Motion v12
- **CSS-only animations in SVG hero** — `@keyframes` with `prefers-reduced-motion` support, no JS dependency
- **Edge runtime for OG images** — `ImageResponse` in `opengraph-image.tsx` and `twitter-image.tsx`

## Content

All documentation lives in `content/docs/` as MDX files. Sidebar order is controlled by `meta.json` files in each section directory.

See the [design document](../.github/designs/005-website-codexfi-com.md) for full architecture decisions and phase history.
