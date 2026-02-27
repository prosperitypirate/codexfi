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

## Local development

### Prerequisites

- **Node 22** — use [nvm](https://github.com/nvm-sh/nvm) (`.nvmrc` is included)
- **pnpm 9+** — install via `npm install -g pnpm` or `corepack enable`

```bash
# Run from the website/ directory
source ~/.nvm/nvm.sh && nvm use && pnpm install && pnpm dev
# → http://localhost:3000
```

> The `.nvmrc` lives in `website/` — `nvm use` must be run from that directory, not the repo root.
>
> If you don't have nvm, install Node 22 directly from [nodejs.org](https://nodejs.org/).

### Build

```bash
pnpm build    # must produce zero errors and zero warnings
```

A clean build with zero warnings is required before merging any PR.

---

## Developing with OpenCode

This project is built and maintained using [OpenCode](https://opencode.ai) as the primary coding agent. If you're using OpenCode to work on the website, here's what the agent needs to know.

### Key rules for the agent

- **Package manager:** always use `pnpm` for the website — never `npm` or `bun`
- **Node version:** Node 22 is required — run `nvm use` before any commands
- **Build gate:** every change must pass `pnpm build` with zero warnings before committing
- **No direct pushes to `main`** — always branch + PR
- **Squash commit prefix:** use `feat(website):` or `fix(website):` for website-only changes (does not trigger an npm release)

### Starting a session

When opening OpenCode in this repo, give it this context up front:

```
We are working on the codexfi.com website (website/ directory).
Package manager: pnpm. Node: 22 (run `nvm use` first).
Dev server: pnpm dev → http://localhost:3000
Build check: pnpm build (must be zero warnings).
Do not push to main — branch + PR only.
```

### Shell environment note

OpenCode's bash tool runs in a **non-interactive shell** — it does not source `~/.zshrc` or `~/.zprofile`. This means `nvm` and any PATH additions from your shell profile are not available by default.

To ensure the correct Node version and pnpm are available, run from `website/`:

```bash
source ~/.nvm/nvm.sh && nvm use && pnpm dev
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
