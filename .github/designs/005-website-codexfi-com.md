# codexfi.com Website — Design Document

**Feature**: Build and deploy codexfi.com — landing page + documentation site  
**Issue**: #67  
**Branch**: `feature/website`  
**Status**: IN PROGRESS (Phase 2 complete)  
**Created**: February 26, 2026  
**Updated**: February 26, 2026  
**Estimated Duration**: ~2 weeks across 5 phases  

---

## EXECUTIVE SUMMARY

### The Problem

codexfi is a published npm package (v0.4.1) with a working release pipeline, but:

1. **No web presence** — `codexfi.com` is owned but points nowhere. Users can't discover what codexfi does without finding the GitHub repo directly
2. **No documentation** — installation, configuration, memory types, extraction behavior, API reference — all undocumented outside of README.md
3. **No onboarding funnel** — potential users have no guided path from "what is this?" to "I installed it"
4. **No visual identity** — the project lacks a compelling first impression that conveys what it does

### The Solution

Build a **combined landing page + documentation site** at `codexfi.com`:

- **Landing page** (`/`) — Dark, animated, dev-tool aesthetic with an SVG hero visualization showing the memory extraction flow. One-liner install CTA. Links to docs and GitHub.
- **Documentation** (`/docs/*`) — Comprehensive docs covering installation, configuration, how it works, guides, and API reference. Powered by Fumadocs with built-in search, sidebar navigation, and MDX support.
- **Deployment** — Vercel Git integration from the same repository, zero GitHub Actions needed for deployment.

### What This Achieves

| Goal | How |
|------|-----|
| Discoverability | SEO-optimized landing page at codexfi.com |
| Onboarding | Guided installation flow with copy-paste commands |
| Documentation | Comprehensive reference for all features and APIs |
| Trust | Professional presence signals production-readiness |
| Conversion | Clear CTA path: landing → docs → install |

---

## CURRENT STATE

### Repository Structure

```
codexfi/
  .github/
    designs/              # Feature design docs (this file)
    workflows/            # CI/CD: ci.yml, release-please.yml, publish.yml
    ISSUE_TEMPLATE/
    PULL_REQUEST_TEMPLATE.md
  plugin/                 # npm package — codexfi@0.4.1
    src/
      cli/                # CLI commands (install, dashboard, etc.)
      dashboard/          # Built-in dashboard server
      services/           # Memory services
      config.ts           # Configuration management
      db.ts               # LanceDB database layer
      embedder.ts         # Voyage AI embedding
      extractor.ts        # Memory extraction pipeline
      index.ts            # Plugin entry point (hooks)
      store.ts            # Memory store operations
      types.ts            # TypeScript type definitions
    dist/                 # Compiled output
    package.json          # name: "codexfi", version: "0.4.1"
    CHANGELOG.md
  benchmark/              # Benchmark pipeline
  testing/                # E2E testing
  README.md
  release-please-config.json
  .release-please-manifest.json
```

### Existing CI/CD

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `ci.yml` | Linting, type checking | PRs |
| `release-please.yml` | Automated version bumps, changelog | Push to main (watches `plugin/` via `include-paths`) |
| `publish.yml` | npm publish via OIDC trusted publishing | Release tag created |

**Key constraint**: All existing workflows are scoped to `plugin/`. The website must not interfere with the release pipeline.

### What Exists Today

- `codexfi.com` domain — owned, not pointed anywhere
- `plugin/package.json` → `homepage: "https://codexfi.com"` — already set
- No website code, no docs content, no Vercel project

---

## ARCHITECTURE

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        codexfi Repository                       │
│                                                                 │
│  ┌──────────────┐          ┌──────────────────────────────────┐ │
│  │   plugin/     │          │           website/               │ │
│  │              │          │                                  │ │
│  │  npm package │          │  Next.js App Router              │ │
│  │  codexfi     │          │  ┌────────────┐ ┌─────────────┐ │ │
│  │  @0.4.1      │          │  │ Landing    │ │ Docs        │ │ │
│  │              │          │  │ page (/)   │ │ (/docs/*)   │ │ │
│  │  Builds via  │          │  │            │ │             │ │ │
│  │  bun build   │          │  │ Custom     │ │ Fumadocs    │ │ │
│  │              │          │  │ Next.js    │ │ MDX engine  │ │ │
│  │  Deploys via │          │  │ + shadcn   │ │ + search    │ │ │
│  │  npm OIDC    │          │  │ + Motion   │ │ + sidebar   │ │ │
│  │              │          │  └────────────┘ └─────────────┘ │ │
│  └──────────────┘          │                                  │ │
│        │                   │  Deploys via Vercel Git          │ │
│        │                   │  integration (auto)              │ │
│        ▼                   └──────────────────────────────────┘ │
│   npm registry                        │                         │
│                                       ▼                         │
│                               Vercel (codexfi.com)              │
└─────────────────────────────────────────────────────────────────┘
```

### Independence Model

The `plugin/` and `website/` packages are **fully independent**:

| Aspect | `plugin/` | `website/` |
|--------|-----------|------------|
| Package manager | Bun | pnpm |
| Lockfile | `plugin/bun.lock` | `website/pnpm-lock.yaml` |
| Runtime dependencies | LanceDB, Voyage AI, Zod | React, Next.js, Fumadocs, Tailwind |
| Build system | bun build → dist/ | Next.js build → .next/ |
| Deployment target | npm registry | Vercel CDN |
| CI trigger | `plugin/**` changes | Vercel auto-detects `website/**` changes |
| Cross-references | None | None (docs content is self-contained) |

**No pnpm workspaces.** No shared lockfile. No shared dependencies. Each package installs and builds independently. This protects the working release pipeline from website changes.

**Rationale**: The two packages have zero dependency overlap (server-side LanceDB/embedding vs client-side React/Next.js). Workspaces would add complexity and risk to the release pipeline for no practical benefit.

### Route Architecture

```
codexfi.com/                    → Landing page (custom Next.js page)
codexfi.com/docs                → Documentation index
codexfi.com/docs/installation   → Installation guide
codexfi.com/docs/configuration  → Configuration reference
codexfi.com/docs/how-it-works/* → Architecture deep-dives
codexfi.com/docs/guides/*       → Integration guides
codexfi.com/docs/api-reference/*→ API documentation
```

The landing page (`/`) is a custom page **outside** the Fumadocs layout. Fumadocs only manages routes under `/docs/*`. This gives full creative control over the landing page while leveraging Fumadocs' built-in docs infrastructure.

### Data Flow: Landing Page → Installation

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  User lands  │────▶│  Sees hero   │────▶│  Clicks      │
│  on /        │     │  SVG + value │     │  "Get Started"│
│              │     │  proposition │     │  CTA         │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                     ┌──────────────┐     ┌───────▼──────┐
                     │  Copies      │◀────│  Reads docs  │
                     │  install cmd │     │  at /docs    │
                     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────▼───────┐
                     │  Runs:       │
                     │  bunx codexfi│
                     │  install     │
                     └──────────────┘
```

---

## TECH STACK

### Core Framework

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 16+ (App Router) | Core framework, SSG/SSR, routing (Turbopack default) |
| **React** | 19+ | UI library |
| **TypeScript** | 5.7+ | Type safety |
| **Tailwind CSS** | 4.x | Utility-first styling |
| **pnpm** | 10+ | Package manager (consistent with project preference) |
| **Node.js** | 22+ | Required by Fumadocs v16 |

### Documentation Layer

| Technology | Purpose |
|-----------|---------|
| **Fumadocs** (`fumadocs-core@16+`, `fumadocs-ui@16+`, `fumadocs-mdx@14+`) | Docs framework — sidebar, search, navigation, MDX rendering. v16 requires Next.js 16+ and Node 22+. |
| **MDX** | Documentation content format — Markdown with React components |
| **Shiki** | Code syntax highlighting (built into Fumadocs) |

**Why Fumadocs over alternatives:**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Fumadocs** | **Selected** | Purpose-built for Next.js App Router. MDX support, built-in search, sidebar nav, dark mode, code highlighting. Full control over non-docs pages. Active maintenance. |
| Nextra | Rejected | Less flexible for custom landing pages. Harder to deeply customize. |
| Custom MDX | Rejected | Maximum flexibility but significant upfront work for search, sidebar, navigation, TOC, breadcrumbs. |
| Docusaurus | Rejected | React-based but not Next.js native. Separate build system. |
| Mintlify | Rejected | SaaS — we want self-hosted on Vercel. |

### UI & Design

| Technology | Purpose |
|-----------|---------|
| **shadcn/ui** | Copy-paste component library (Radix UI + Tailwind). Cards, buttons, code blocks, navigation. |
| **Motion** (`motion`) | Scroll-triggered animations, viewport reveals, micro-interactions on landing page. Import from `motion/react`. |
| **Lucide React** | Icon library (shadcn/ui default) |
| **next-themes** | Dark/light mode toggle (dark by default) |

**Why shadcn/ui:**
- Perfect for dark dev-tool aesthetic (used by Vercel, Linear-style sites)
- Copy-paste model means zero runtime dependency on a component library
- Built on Radix UI — accessible by default
- Fully customizable via Tailwind CSS variables

### Visual Assets

| Technology | Purpose |
|-----------|---------|
| **Google Gemini 3.1 Pro** (external, design-time) | Generate animated SVG hero visualization |
| **SVGOMG** (optimization) | Clean and optimize AI-generated SVGs before embedding |
| **Inline SVG React components** | Embed optimized SVGs directly in React for full styling control |

The SVG hero animation will be **designed externally** using Gemini 3.1 Pro in Google AI Studio, then **integrated** into the Next.js codebase as an inline React component. This is a design-time tool, not a runtime dependency.

### Deployment

| Technology | Purpose |
|-----------|---------|
| **Vercel** (Git integration) | Zero-config deployment, preview deploys, CDN, HTTPS |
| **codexfi.com** (custom domain) | Production domain, already owned |

---

## LANDING PAGE DESIGN

### Visual Direction

**Aesthetic**: Dark dev-tool style, inspired by Linear, Vercel, and Raycast. The site should feel "alive" — not a static brochure, but a dynamic experience that communicates the product's intelligence.

**Color Palette** (dark theme, primary):

| Role | Color | Usage |
|------|-------|-------|
| Background | `#0a0a0a` to `#111111` | Page background, subtle gradient |
| Surface | `#1a1a1a` to `#1e1e1e` | Cards, code blocks, elevated surfaces |
| Border | `#2a2a2a` | Subtle borders, dividers |
| Text primary | `#f5f5f5` | Headings, body text |
| Text secondary | `#a0a0a0` | Descriptions, captions |
| Accent primary | `#a855f7` to `#c084fc` | CTAs, links, highlights (purple gradient) |
| Accent glow | `#a855f7` at 20% opacity | Glow effects behind cards, hero elements |
| Code green | `#4ade80` | Terminal prompts, success states |

**Typography**:
- Headings: Inter or Geist Sans (variable weight, tight tracking)
- Body: Same family, regular weight
- Code: Geist Mono or JetBrains Mono

### Page Sections

#### 1. Navigation Bar

```
┌─────────────────────────────────────────────────────────────┐
│  ◆ codexfi              Docs    GitHub    npm    [Get Started] │
└─────────────────────────────────────────────────────────────┘
```

- Sticky, transparent background with backdrop blur on scroll
- Logo + wordmark on left
- Navigation links on right
- "Get Started" button links to `/docs`
- GitHub link includes star count badge (optional)

#### 2. Hero Section

The centerpiece of the landing page. Two main elements:

**Tagline + Subtitle:**
```
Persistent memory for AI coding agents

Your AI remembers everything — architecture, decisions,
patterns, progress — across every session, automatically.
```

**Animated SVG Visualization:**

A dynamic, looping SVG that visualizes the codexfi memory cycle:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   [Conversation]  ──extraction──▶  [Memory Types]          │
│    bubbles/code      animated       architecture            │
│    appearing         particles      tech-context            │
│    on left           flowing        progress                │
│                      rightward      product-context         │
│                                     learned-pattern         │
│                                           │                 │
│                                    ──store──▶  [LanceDB]   │
│                                                vector DB    │
│                                                glowing      │
│                                                cluster      │
│                                           │                 │
│   [New Session]  ◀──retrieval──    ◀──search──             │
│    with [MEMORY]     animated                               │
│    block injected    flowing back                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**SVG Design Specifications for Gemini 3.1 Pro:**
- Dark background (#0a0a0a), no bounding box
- Animated nodes representing conversation → extraction → storage → retrieval
- Flowing particle/line animations connecting the stages
- Memory type labels (architecture, tech-context, progress, etc.) appearing as categorized nodes
- Subtle glow effects on connections (blue/teal accent)
- CSS `@keyframes` animations embedded in the SVG (no JavaScript)
- Smooth looping — seamless repeat with no visible restart
- Responsive: uses `viewBox` for scaling, no fixed pixel dimensions
- Target file size: <50KB after SVGOMG optimization
- Accessible: includes `<title>` and `aria-label` for screen readers

**Install CTA:**
```
┌──────────────────────────────────────┐
│  $  bunx codexfi install       [📋]  │
└──────────────────────────────────────┘
```
- Terminal-style code block with dark background
- Copy-to-clipboard button
- Monospace font, green prompt character

**Action Buttons:**
```
[Get Started →]   [View on GitHub ↗]
```
- Primary CTA (filled, accent color) → `/docs`
- Secondary CTA (outlined) → GitHub repo

#### 3. Features Grid

A responsive grid of feature cards, each with an icon, title, and short description:

| Feature | Icon | Description |
|---------|------|-------------|
| **Auto-Extraction** | Brain/Sparkle | Automatically extracts architecture, decisions, and patterns from every conversation |
| **Typed Memory** | Tags/Categories | 10+ memory types — architecture, tech-context, progress, preferences, and more |
| **Semantic Search** | Search/Magnifier | Voyage AI embeddings find relevant context for every new task |
| **Compaction Survival** | Shield/Lock | Memory persists through context window compaction — nothing is lost |
| **Zero Config** | Plug/Zap | One command install. No Docker, no external database. Bring your own LLM + Voyage AI keys. |
| **Session Continuity** | Link/Chain | Pick up exactly where you left off — your AI knows the full project history |
| **Local & Private** | Lock/Eye-off | Memory storage is fully local (LanceDB on disk). Embeddings are sent to Voyage AI for vectorization. No cloud sync, no external persistence layer. |
| **Smart Aging** | Clock/Refresh | Old memories are automatically consolidated and evolved, never duplicated |

**Card Design:**
- Dark surface with subtle border
- Icon with accent color glow
- Hover effect: slight lift + glow intensify (Motion)
- Responsive: 2 columns on mobile, 3-4 on desktop

**Scroll Animation:**
- Cards fade in and slide up as they enter the viewport
- Index-based delay (`delay: i * 0.07`) for sequential stagger reveal
- `whileInView` with `viewport={{ once: true }}` — animate once, don't re-trigger
- CSS `transition-[border-color,box-shadow]` for hover effects (NOT `transition-all` — conflicts with Motion transforms)

#### 4. How It Works

A step-by-step visual explanation:

```
Step 1: Install                   Step 2: Code                     Step 3: Remember
┌────────────────────┐            ┌────────────────────┐            ┌────────────────────┐
│ $ bunx codexfi     │    ───▶    │ You code with your │    ───▶    │ Next session, your │
│   install          │            │ AI agent as usual   │            │ AI has full context │
│                    │            │                    │            │                    │
│ One command.       │            │ codexfi silently    │            │ Architecture,       │
│ Works with         │            │ extracts memories   │            │ decisions, patterns │
│ OpenCode.          │            │ in the background   │            │ — all injected      │
└────────────────────┘            └────────────────────┘            └────────────────────┘
```

- Three-column layout on desktop, stacked on mobile
- Step numbers with accent-colored circles
- Connecting arrows or flowing lines between steps
- Each step fades in on scroll

#### 5. Social Proof / Stats (Optional — Phase 5)

If available by launch:
- npm download count
- GitHub stars
- "Used by X developers" (if trackable)

#### 6. Footer

```
┌─────────────────────────────────────────────────────────────┐
│  codexfi                                                     │
│  Persistent memory for AI coding agents                      │
│                                                             │
│  Product          Resources         Community               │
│  Documentation    GitHub            Issues                   │
│  Installation     npm               Discussions              │
│  Changelog        License (MIT)                              │
│                                                             │
│  © 2026 codexfi · MIT License                                │
└─────────────────────────────────────────────────────────────┘
```

---

## DOCUMENTATION SITE

### Framework: Fumadocs

Fumadocs manages the `/docs/*` route. It provides:

- **Sidebar navigation** — auto-generated from file structure + `meta.json`
- **Full-text search** — built-in, no Algolia needed
- **Dark mode** — default theme matches landing page
- **Code highlighting** — Shiki with theme support
- **Table of contents** — per-page, auto-generated from headings
- **Breadcrumbs** — automatic from URL structure
- **MDX components** — callouts, tabs, cards, steps, file trees

### Configuration Files

**`source.config.ts`** — Content source definition:
```typescript
import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig();
```

**`lib/source.ts`** — Source loader for page tree:
```typescript
import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
```

> **Note**: `collections/server` is a tsconfig path alias to `.source/server.ts`, which is auto-generated by `fumadocs-mdx` v14+. The old `fumadocs-mdx:collections/server` namespace import does not work with Webpack — use the tsconfig alias instead.

**`next.config.mjs`** — Next.js with Fumadocs MDX plugin:
```javascript
import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
};

const withMDX = createMDX();
export default withMDX(config);
```

**`lib/layout.shared.ts`** — Shared layout options:
```typescript
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'codexfi',
      // Optional: custom logo component
    },
    links: [
      {
        text: 'GitHub',
        url: 'https://github.com/prosperitypirate/codexfi',
        external: true,
      },
    ],
  };
}
```

### Layout Structure

**Root layout** (`app/layout.tsx`):
```typescript
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
```

**Landing page layout** (`app/(home)/layout.tsx`) — uses HomeLayout from Fumadocs for consistent nav:
```typescript
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions()}>
      {children}
    </HomeLayout>
  );
}
```

**Landing page** (`app/(home)/page.tsx`) — custom content, outside Fumadocs docs layout:
```typescript
export default function HomePage() {
  return (
    <>
      {/* Custom hero, features, how-it-works, footer */}
    </>
  );
}
```

**Docs layout** (`app/docs/layout.tsx`) — Fumadocs managed:
```typescript
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout {...baseOptions()} tree={source.pageTree}>
      {children}
    </DocsLayout>
  );
}
```

**Docs page** (`app/docs/[[...slug]]/page.tsx`) — dynamic MDX renderer:
```typescript
import { source } from '@/lib/source';
import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc}>
      <DocsBody>
        <MDX />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
```

### Content Structure

```
content/
  docs/
    meta.json                         # Root sidebar ordering
    index.mdx                        # "What is codexfi?" overview
    installation.mdx                 # Installation guide
    configuration.mdx                # Configuration options
    how-it-works/
      meta.json                      # Section sidebar ordering
      overview.mdx                   # Architecture overview
      memory-types.mdx               # All 10+ memory types explained
      extraction.mdx                 # How extraction works
      compaction.mdx                 # Compaction survival mechanism
      semantic-search.mdx            # How search & retrieval works
      aging.mdx                      # Memory aging & consolidation
    guides/
      meta.json
      opencode-setup.mdx             # OpenCode integration guide
      custom-agents.mdx              # Using with custom agents
      memory-tool.mdx                # Using the memory tool manually
      private-content.mdx            # <private> tags and data privacy
    api-reference/
      meta.json
      memory-tool-api.mdx            # Memory tool modes and parameters
      http-endpoints.mdx             # Dashboard HTTP API
      plugin-hooks.mdx               # OpenCode plugin hook reference
      configuration-schema.mdx       # codexfi.jsonc schema reference
```

**Root `meta.json`:**
```json
{
  "title": "Documentation",
  "pages": [
    "index",
    "installation",
    "configuration",
    "---",
    "how-it-works",
    "guides",
    "api-reference"
  ]
}
```

**Section `meta.json` example (`how-it-works/meta.json`):**
```json
{
  "title": "How It Works",
  "defaultOpen": true,
  "pages": [
    "overview",
    "memory-types",
    "extraction",
    "compaction",
    "semantic-search",
    "aging"
  ]
}
```

### Initial Content Scope

For launch, the minimum viable documentation set:

| Page | Priority | Content Source |
|------|----------|---------------|
| What is codexfi? | P0 | New — product overview |
| Installation | P0 | Adapted from README.md |
| Configuration | P0 | Adapted from README.md + codexfi.jsonc schema |
| Architecture overview | P0 | New — system design explanation |
| Memory types | P0 | New — reference for all memory types |
| How extraction works | P1 | New — extraction pipeline deep-dive |
| OpenCode setup guide | P1 | Adapted from README.md |
| Memory tool API | P1 | New — modes, parameters, examples |
| Compaction survival | P2 | New — technical explanation |
| Other guides | P2 | New — can be added post-launch |

---

## DEPLOYMENT

### Vercel Git Integration

**No GitHub Actions workflow needed for website deployment.** Vercel's Git integration handles everything:

#### Configuration

| Setting | Value |
|---------|-------|
| Repository | `prosperitypirate/codexfi` |
| Root Directory | `website` |
| Framework Preset | Next.js (auto-detected) |
| Build Command | `pnpm build` (auto-detected) |
| Install Command | `pnpm install` |
| Output Directory | `.next` (auto-detected) |
| Node.js Version | 22.x (required by Fumadocs v16) |

#### Behavior

| Event | What Happens |
|-------|-------------|
| PR created/updated (touches `website/`) | Vercel creates a **preview deployment** with a unique URL |
| PR created/updated (only touches `plugin/`) | Vercel **skips build** (requires `ignoreCommand` — see below) |
| Merge to `main` (touches `website/`) | Vercel creates a **production deployment** at codexfi.com |
| Merge to `main` (only touches `plugin/`) | Vercel **skips build** (requires `ignoreCommand`) |

**Important**: Setting Root Directory alone does **not** automatically skip builds when only files outside `website/` change. Without workspace configuration (`pnpm-workspace.yaml`), Vercel has no way to infer which commits affect the project. We must configure the **Ignored Build Step** to achieve this:

```json
// website/vercel.json
{
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- ."
}
```

This tells Vercel to skip the build if no files within the Root Directory (`website/`) changed between the current and previous commit. Vercel runs this command from the Root Directory, so `.` refers to `website/`.

#### Domain Configuration

1. Add `codexfi.com` as a custom domain in Vercel project settings
2. Configure DNS (either Vercel nameservers or CNAME record)
3. Vercel handles HTTPS certificate provisioning automatically
4. Set up `www.codexfi.com` → `codexfi.com` redirect

#### Environment Variables

The website is static content — no environment variables needed for the initial launch. If search or analytics are added later, those would be configured in Vercel's environment variables UI.

### Relationship to Existing CI/CD

```
                         Push to main
                              │
                    ┌─────────┴─────────┐
                    │                   │
              plugin/ changed?    website/ changed?
                    │                   │
                    ▼                   ▼
            release-please.yml    Vercel Git
            (GitHub Actions)      (automatic)
                    │                   │
                    ▼                   ▼
              publish.yml         Preview/Production
              (npm OIDC)          deployment
```

**Zero interference.** The two deployment pipelines are completely independent:
- release-please watches `plugin/` via `include-paths` config
- Vercel watches `website/` via Root Directory config
- Neither triggers on the other's changes

### Optional: CI Build Check

While Vercel's preview builds already catch build failures, we could add a lightweight CI check:

```yaml
# In .github/workflows/ci.yml — optional addition
# Uses dorny/paths-filter (already in our CI) to gate on website/ changes
website-build:
  name: Website Build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6

    - uses: dorny/paths-filter@v3
      id: changes
      with:
        filters: |
          website:
            - 'website/**'

    - uses: pnpm/action-setup@v4
      if: steps.changes.outputs.website == 'true'
    - uses: actions/setup-node@v4
      if: steps.changes.outputs.website == 'true'
      with:
        node-version: 22
    - run: pnpm install
      if: steps.changes.outputs.website == 'true'
      working-directory: website
    - run: pnpm build
      if: steps.changes.outputs.website == 'true'
      working-directory: website

    - name: Skip — no website changes
      if: steps.changes.outputs.website != 'true'
      run: echo "No website changes detected — skipping build"
```

**Decision**: Defer this. Vercel's preview build is the primary gate. We can add a CI check later if needed for branch protection rules.

---

## FILE STRUCTURE

### Complete `website/` Directory

```
website/
  app/
    layout.tsx                      # Root layout (RootProvider, fonts, global styles)
    global.css                      # Tailwind imports + custom CSS variables
    (home)/
      page.tsx                      # Landing page
      layout.tsx                    # Home layout (HomeLayout from Fumadocs)
    docs/
      layout.tsx                    # Docs layout (DocsLayout from Fumadocs)
      [[...slug]]/
        page.tsx                    # Dynamic MDX page renderer
  components/
    landing/
      hero.tsx                      # Hero section with SVG + tagline
      features.tsx                  # Feature grid
      how-it-works.tsx              # Step-by-step workflow
      install-block.tsx             # Terminal-style install command
      footer.tsx                    # Site footer
    ui/                             # shadcn/ui components (auto-generated)
      button.tsx
      card.tsx
      ...
    svg/
      memory-flow.tsx               # Hero SVG animation (Gemini-designed, inline React)
  content/
    docs/                           # MDX documentation content
      meta.json
      index.mdx
      installation.mdx
      configuration.mdx
      how-it-works/
        meta.json
        overview.mdx
        memory-types.mdx
        extraction.mdx
        compaction.mdx
        semantic-search.mdx
        aging.mdx
      guides/
        meta.json
        opencode-setup.mdx
        custom-agents.mdx
        memory-tool.mdx
        private-content.mdx
      api-reference/
        meta.json
        memory-tool-api.mdx
        http-endpoints.mdx
        plugin-hooks.mdx
        configuration-schema.mdx
  lib/
    source.ts                       # Fumadocs source loader
    layout.shared.ts                # Shared layout options
    animations.ts                   # Motion animation variants (fadeInUp, staggerContainer, scaleIn)
    utils.ts                        # cn() utility (shadcn/ui)
  public/
    favicon.ico
    og-image.png                    # Open Graph image for social sharing
  source.config.ts                  # Fumadocs MDX configuration
  next.config.mjs                   # Next.js configuration
  vercel.json                       # Vercel config (ignoreCommand for build skipping)
  tsconfig.json                     # TypeScript configuration
  postcss.config.mjs                # PostCSS with @tailwindcss/postcss
  components.json                   # shadcn/ui configuration
  package.json                      # Independent package
  pnpm-lock.yaml                    # Independent lockfile
  .gitignore                        # website-specific ignores
```

### Root `.gitignore` Additions

```gitignore
# Website
website/.next/
website/node_modules/
website/.source/
```

---

## SVG HERO ANIMATION

### Concept

The hero SVG is the visual centerpiece of the landing page. It visualizes the **complete** codexfi memory lifecycle as a closed, bidirectional loop — the core value proposition made tangible through animation.

The two flows must feel **visually equal in weight**:
- **Extraction** (left → right, purple): conversations are parsed and typed memories slide toward the vector store
- **Retrieval** (right → left, green): stored memories are recalled and injected back into the next session

This symmetry is the product's whole point. If retrieval looks like an afterthought, the visualization fails.

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌─────────────────┐   ── extraction ──▶   ┌──────────────────────┐ │
│  │  OpenCode Agent │  purple nodes sliding  │  LanceDB Vector DB  │ │
│  │                 │  left → right →→→      │                     │ │
│  │  [chat bubbles] │  architecture          │  [hexagon cluster]  │ │
│  │  [code blocks]  │  tech-context          │  [pulsing nodes]    │ │
│  │  appearing and  │  progress              │  [constellation     │ │
│  │  fading         │  learned-pattern       │   lines]            │ │
│  │                 │  preference            │                     │ │
│  └─────────────────┘                        └──────────────────────┘ │
│          ▲                                           │               │
│          │  ◀── retrieval ──────────────────────────┘               │
│          │  green nodes sliding right → left                         │
│          │  [architecture] ←←←                                       │
│          │  [progress] ←←←                                           │
│          │  [preference] ←←←                                         │
│          │                                                           │
│          └─── [MEMORY] block injected into next session              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Animation Specification

#### Extraction Flow (top lanes, purple, left → right)

- **5 horizontal lanes** at evenly spaced Y positions through the center of the SVG
- Each lane has an animated dashed stroke flowing left → right (`dashFlow` keyframe)
- **Sliding purple pill nodes** travel along these lanes, each labeled with a memory type:
  - `architecture`, `tech-context`, `progress`, `learned-pattern`, `preference`
- Nodes are staggered in time so the lanes feel asynchronous and alive
- Node pill: dark fill (`fill-card`), purple stroke (`#a855f7`–`#c084fc` range), subtle glow
- Node text: monospace, purple, e.g. `architecture`

#### Retrieval Flow (bottom arc, green, right → left)

- **A curved arc** connecting the bottom of the DB panel to the bottom of the agent panel
- The arc has an animated dashed stroke flowing **right → left** (`dashFlowRev` keyframe)
- **3 sliding green pill nodes** travel along the arc from DB → agent, labeled with memory types being recalled. These use a **different keyframe** (`slideLeft`) that translates from the DB side to the agent side
  - Suggested labels: `[architecture]`, `[progress]`, `[preference]` (square-bracket style to visually distinguish recalled vs extracted)
- Nodes are staggered so they don't all arrive simultaneously
- Node pill: dark fill (`fill-card`), green stroke (`#4ade80`), green glow
- Node text: monospace, green (`#4ade80`)
- The `[MEMORY] injected` badge floats near the midpoint of the arc as a persistent label (not a sliding node — it stays put and pulses)

#### Timing & Pacing

| Animation | Duration | Direction | Color |
|-----------|----------|-----------|-------|
| Lane dash flow (extraction) | 1s linear infinite | → | purple |
| Arc dash flow (retrieval) | 1.2s linear infinite | ← | green |
| Purple pill nodes | 8s per cycle, 5 staggered | → | purple |
| Green pill nodes | 8s per cycle, 3 staggered | ← | green |
| `[MEMORY]` badge | float 6s ease-in-out alternate | — (float up/down) | green |
| DB hexagon nodes | 3–4s pulseOpacity alternate | — | purple |
| Chat bubbles | 8s popIn per bubble, 4 staggered | — (appear/fade) | foreground |

The extraction and retrieval cycles are **offset in phase** so that as memories finish being stored, retrieved memories begin flowing back. This creates a sense of continuous, intelligent circulation rather than two separate motions.

#### Direction Arrows

Each path should have **arrowhead markers** at key points to make direction unambiguous at a glance:

- Extraction lanes: a small `▶` arrowhead near the right end of each lane (pointing right)
- Retrieval arc: a small `▶` arrowhead near the left end of the arc (pointing left, toward the agent)

Use SVG `<marker>` with `markerEnd` — one marker definition for purple (`arrow-purple`) and one for green (`arrow-green`).

#### Axis Labels

Two small, muted labels to reinforce the directionality:

- Top-center, above the extraction lanes: `extraction →` (muted-foreground, 10px, monospace)
- Bottom-center, below the retrieval arc: `← retrieval` (muted-foreground, 10px, monospace)

### Color & Theming

| Element | Fill | Stroke / Color | Notes |
|---------|------|----------------|-------|
| Extraction lane lines | none | `url(#flowGrad)` purple→transparent | Gradient flows left→right |
| Purple pill nodes | `fill-card` | `#a855f7` / `#c084fc` | Semantic fill for light/dark mode |
| Purple pill text | — | `#a855f7` | Fixed brand color |
| Retrieval arc line | none | `url(#retrievalGrad)` green→transparent | Gradient flows right→left |
| Green pill nodes | `fill-card` | `#4ade80` | Semantic fill for light/dark mode |
| Green pill text | — | `#4ade80` | Fixed brand color |
| `[MEMORY]` badge | `fill-card` | `#4ade80` | Same as green pills |
| Agent/DB panel backgrounds | `fill-card` | `stroke-border` | Semantic — adapts to light/dark |
| Panel title bars | `fill-muted` | — | Semantic |
| All text (non-accent) | `fill-foreground` / `fill-muted-foreground` | — | Semantic |

**Hard rule**: No hardcoded `#111`, `#1a1a1a`, or `#0a0a0a` for any background/fill that needs to adapt to light mode. Use `fill-card`, `fill-muted`, `fill-secondary` Tailwind semantic classes. Only brand purples and greens are hardcoded.

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .slide-node { opacity: 1; animation: none !important; }
  .slide-node-retrieval { opacity: 1; animation: none !important; }
  .chat-appear { opacity: 1; transform: none; animation: none !important; }
  .flow-line, .retrieval-line { animation: none !important; }
  .pulse, .pulse-alt, .float { animation: none !important; }
}
```

For reduced motion, position the retrieval pill nodes statically at evenly spaced points along the arc so the diagram is still readable.

### Gemini Prompt Template (Updated)

```
Create an animated SVG visualization of a bidirectional memory extraction and retrieval
cycle for an AI coding agent called codexfi. The visualization must show TWO equal,
opposing flows — extraction and retrieval — forming a closed loop.

LAYOUT:
- LEFT PANEL: "OpenCode Agent" — chat bubbles and code blocks appearing and fading
- CENTER: Two animated flows connecting left and right panels
- RIGHT PANEL: "LanceDB Vector Store" — hexagon cluster of pulsing embedding nodes

EXTRACTION FLOW (left → right, top half, purple):
- 5 horizontal dashed lanes with animated dash-offset flowing left-to-right
- Sliding pill-shaped nodes travel each lane labeled with memory types:
  "architecture", "tech-context", "progress", "learned-pattern", "preference"
- Purple color scheme: #a855f7 to #c084fc
- Staggered delays so lanes feel asynchronous
- Small arrowhead marker at right end of each lane pointing →
- Subtle axis label above center lanes: "extraction →" (muted, small)

RETRIEVAL FLOW (right → left, bottom arc, green):
- A smooth curved arc (quadratic bezier) connecting the bottom-right of the DB panel
  to the bottom-left of the agent panel
- Animated dashed stroke flowing right-to-left
- 3 sliding green pill nodes travel the arc from DB → agent labeled:
  "[architecture]", "[progress]", "[preference]"
  (square brackets to visually distinguish recalled memories from extracted ones)
- Green color: #4ade80
- Staggered so they don't all arrive simultaneously
- Arrowhead marker at left end of arc pointing ← toward the agent
- A floating "[MEMORY] injected" badge near the midpoint of the arc (stays put, pulses/floats)
- Subtle axis label below arc center: "← retrieval" (muted, small)

The extraction and retrieval cycles should be offset in phase so memories flow continuously
— as one cycle finishes, the other is mid-flight. This creates a sense of intelligent
circulation, not two separate animations.

DESIGN SPECIFICATIONS:
- viewBox="0 0 1000 500" — no fixed pixel dimensions
- Background: transparent (placed on a dark/light adaptive surface)
- Panel fills: use CSS class "fill-card" (not hardcoded hex) so they work in light mode
- Panel borders: use CSS class "stroke-border"
- Text (non-accent): use "fill-foreground" and "fill-muted-foreground" CSS classes
- ONLY hardcode colors for brand purple (#a855f7, #c084fc, #e879f9) and green (#4ade80)
- All animations: CSS @keyframes only — no JavaScript
- Smooth infinite loop with no visible restart seam
- Include <title> element and aria-label for accessibility
- Respect prefers-reduced-motion: reduce — all animated elements should have a static fallback
- Premium, sophisticated feel — not cartoon-like or generic
- Target file size: <50KB
```

### Technical Integration

```typescript
// components/svg/memory-flow.tsx
export function MemoryFlowSVG() {
  return (
    <svg
      viewBox="0 0 800 400"
      className="w-full max-w-4xl mx-auto"
      role="img"
      aria-label="Visualization of codexfi memory extraction and retrieval cycle"
    >
      <title>codexfi memory flow — conversations are extracted into typed memories,
      stored in a vector database, and retrieved for future sessions</title>
      {/* Gemini-generated SVG content goes here */}
      {/* CSS animations embedded in <style> tag within SVG */}
    </svg>
  );
}
```

### SVG Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| File size | SVGOMG optimization, target <50KB |
| Animation perf | CSS-only animations (GPU-accelerated), no JS |
| Mobile | Responsive via `viewBox`, simplified animation on small screens via `@media` |
| Accessibility | `role="img"`, `aria-label`, `<title>` element |
| Loading | Inline SVG — no network request, renders with page |
| Reduced motion | Respect `prefers-reduced-motion` — pause animations |

```css
/* Inside SVG <style> */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

---

## DESIGN SYSTEM

### Tailwind CSS Configuration

Tailwind CSS v4 uses **CSS-first configuration** — no `tailwind.config.ts` file. All customization is done via CSS directives in the global stylesheet. Content detection is automatic (no `content` array needed). Dark mode uses CSS custom variants instead of `darkMode: 'class'`.

```css
/* app/global.css */
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme {
  /* Custom colors for codexfi dark theme */
  /* Note: uses --color-brand instead of --color-accent to avoid
     collision with shadcn/ui's accent token system */
  --color-brand: #a855f7;
  --color-brand-light: #c084fc;
  --color-brand-glow: rgba(168, 85, 247, 0.2);
  --color-surface: #1a1a1a;
  --color-surface-elevated: #1e1e1e;
  --color-terminal-green: #4ade80;

  /* Typography — Geist fonts loaded via next/font */
  --font-sans: var(--font-geist-sans), 'Inter', system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), 'JetBrains Mono', monospace;
}
```

**Note**: shadcn/ui will scaffold additional theme variables (oklch-based color tokens for `--background`, `--foreground`, `--primary`, `--accent`, etc.) when initialized. The custom `--color-brand-*` tokens above are namespaced to avoid collisions with shadcn/ui's `@theme inline` block. Fumadocs UI classes are auto-detected by Tailwind v4's content scanning.

### Animation Patterns (Motion)

**Scroll reveal** — each element independently animated via `whileInView`:
```typescript
// Direct inline animation (preferred — avoids variant propagation issues)
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.4, delay: i * 0.07, ease: "easeOut" }}
>
```

**Shared variants** — reusable across sections (`lib/animations.ts`):
```typescript
export const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

// Pure orchestrator — no opacity/transform of its own (prevents double-animation)
export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' } },
};
```

**Usage pattern** — prefer independent `whileInView` per element over parent variant propagation:
```tsx
import { motion } from 'motion/react';

// Each card manages its own animation with index-based delay
{items.map((item, i) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.4, delay: i * 0.07, ease: "easeOut" }}
  >
    {/* content */}
  </motion.div>
))}
```

> **Important**: Do NOT use `useRef` + `useInView` + `animate={isInView ? ...}` pattern — it causes animation flickering. Do NOT use `transition-all` CSS class on Motion-animated elements — it conflicts with Motion's transform animations and causes a secondary "shift" after the animation completes. Use specific CSS transitions like `transition-[border-color,box-shadow]` instead.

### Reduced Motion Support

All Motion animations must respect user preferences:

```typescript
import { useReducedMotion } from 'motion/react';

function AnimatedComponent() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : 'hidden'}
      animate="visible"
      variants={fadeInUp}
    >
      {/* content */}
    </motion.div>
  );
}
```

---

## EDGE CASES & DECISIONS

### High Priority — Must Resolve Before Implementation

| Edge Case | Decision | Implementation |
|-----------|----------|----------------|
| Landing page SEO metadata | Use Next.js Metadata API with Open Graph image | `app/(home)/page.tsx` exports `metadata` object with title, description, og:image |
| Dark mode toggle on docs | Fumadocs provides built-in dark mode toggle | Keep dark as default, allow light mode toggle in docs only |
| Mobile responsiveness for hero SVG | SVG uses `viewBox` for fluid scaling; simplify animation on mobile | Use CSS `@media` queries inside SVG to reduce complexity below 768px |
| Code block copy buttons | Fumadocs provides built-in copy button for code blocks | No custom implementation needed for docs |
| Broken links between landing and docs | Use Next.js `<Link>` for internal navigation | Landing CTAs use `<Link href="/docs">` for client-side navigation |

### Medium Priority — Should Resolve, Can Defer

| Edge Case | Proposed Approach | Deferral Risk |
|-----------|-------------------|---------------|
| Search across docs | Fumadocs built-in search covers this | Low — works out of the box |
| 404 page for docs | Custom 404 with link back to docs index | Low — default Next.js 404 is acceptable initially |
| Analytics (page views, install clicks) | Vercel Analytics or Plausible (privacy-first) | None — can add post-launch |
| Blog section | Future addition — not needed for launch | None |
| Versioned docs (per plugin version) | Not needed yet — single version | Low — only relevant when we have breaking changes |

### Low Priority — Acceptable to Leave Unresolved

| Edge Case | Why It's Acceptable |
|-----------|-------------------|
| i18n (internationalization) | English-only for now; target audience is English-speaking developers |
| RSS feed for docs | Low demand; can add later with Fumadocs built-in support |
| Docs changelog page | Already have CHANGELOG.md in plugin/; link to GitHub |

---

## DECISION LOG

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Repository structure | Monorepo, same repo as plugin | Single PR can update docs + plugin. Shared CI/CD infra. No repo sprawl. |
| 2 | Package independence | No pnpm workspaces | Zero dependency overlap. Protects release pipeline. Simplifies Vercel config. |
| 3 | Website folder name | `website/` | Unambiguous. Doesn't conflict with future `docs/` folder. OSS convention. |
| 4 | Docs framework | Fumadocs | Purpose-built for Next.js App Router. Built-in search, sidebar, dark mode, MDX. Full control over non-docs pages. |
| 5 | Component library | shadcn/ui (copy-paste, Radix UI + Tailwind) | Dark dev-tool aesthetic. Zero runtime dependency. Accessible by default. Fully customizable. |
| 6 | Animation library | Motion (`motion`, import from `motion/react`) | Best-in-class for scroll reveals and micro-interactions. React-native API. Production-proven. Rebranded from Framer Motion. |
| 7 | SVG design tool | Google Gemini 3.1 Pro (design-time only) | Best-in-class animated SVG generation from text prompts. Pure code output, not pixels. Design-time tool, not runtime dependency. |
| 8 | Deployment | Vercel Git integration (not GitHub Actions) | Zero-config. Automatic preview deploys on PRs. Automatic production deploys on merge. No secrets needed. Built-in path filtering for monorepos. |
| 9 | Custom domain | codexfi.com (already owned) | Direct from Vercel project settings. Automatic HTTPS. |
| 10 | CI for website | Defer — use Vercel preview builds as gate | Vercel already catches build failures. Adding CI check adds complexity for no incremental safety. |
| 11 | Dark mode | Dark by default, light mode available via toggle | Target audience is developers. Dark aesthetic matches product identity. |
| 12 | Landing page position | Outside Fumadocs layout (`/` is custom) | Full creative control. Fumadocs only manages `/docs/*`. |
| 13 | Content format | MDX in `content/docs/` | Rich content with embedded React components. Fumadocs processes automatically. |
| 14 | Next.js version | 16+ (not 15) | Fumadocs v16 requires Next.js 16+. Turbopack is the default build system. |
| 15 | Node.js version | 22+ | Required by Fumadocs v16. Installed via nvm. |
| 16 | Custom color token naming | `--color-brand-*` (not `--color-accent-*`) | Avoids collision with shadcn/ui's `--accent` token system in `@theme inline` block. |
| 17 | Source import strategy | tsconfig path alias (`collections/server`) | Webpack cannot resolve `fumadocs-mdx:collections/server` namespace. tsconfig alias `collections/*` → `.source/*` works reliably. |
| 18 | Brand color | Purple gradient (`#a855f7` → `#c084fc`) | User preference. Purple gradient conveys a more unique identity than blue. Applied via `--color-brand-*` tokens and `.text-gradient-brand` CSS utility. |
| 19 | Animation approach | Independent `whileInView` per element (not parent variant propagation) | Parent `staggerContainer` + child variant propagation caused flicker and secondary "shift" animations. Independent `whileInView` with index-based delay is explicit and predictable. |
| 20 | CSS transitions on animated elements | Specific property transitions only (`transition-[border-color,box-shadow]`) | `transition-all` CSS class conflicts with Motion's transform/opacity animations, causing a secondary visual shift after Motion completes. Always use specific CSS transitions on Motion-animated elements. |

---

## METRICS & MEASUREMENT

| Metric | How Measured | Baseline | Target |
|--------|-------------|----------|--------|
| Lighthouse Performance | Lighthouse CI on Vercel preview | N/A (new) | >90 |
| Lighthouse Accessibility | Lighthouse CI on Vercel preview | N/A (new) | >95 |
| Time to Interactive (landing) | Lighthouse / Web Vitals | N/A (new) | <2s |
| First Contentful Paint | Lighthouse / Web Vitals | N/A (new) | <1s |
| SVG animation file size | SVGOMG output measurement | N/A (new) | <50KB |
| Docs search latency | Manual testing | N/A (new) | <200ms |
| Total bundle size (landing) | Next.js build output | N/A (new) | <200KB gzipped |
| Build time | Vercel build logs | N/A (new) | <60s |

---

## ROLLBACK PLAN

### Detection

- Vercel build failure (automatic — blocks deployment)
- Lighthouse regression in preview deployment
- Broken links reported by users
- SVG animation performance issues on mobile

### Immediate Rollback

Since the website is a new addition (not modifying existing code):

```bash
# Option 1: Revert the website merge commit
git revert <merge-commit-hash>

# Option 2: Disconnect Vercel Git integration
# (via Vercel dashboard — instant, no code change needed)
```

### Graceful Degradation

- If SVG hero causes performance issues: replace with static image fallback
- If Fumadocs has issues: serve a static `/docs` page linking to GitHub README
- If Vercel has issues: point codexfi.com DNS to a static hosting fallback

### Recovery Steps

1. Identify the issue (build failure, runtime error, performance regression)
2. Fix in a new branch (don't amend the merged commit)
3. Verify via Vercel preview deployment
4. Merge fix to main → automatic production deployment

---

## IMPLEMENTATION PHASES

### PHASE 1: Scaffold & Configure

**Goal**: Working Next.js + Fumadocs project in `website/` with dark theme  
**Duration**: ~2 hours  
**Dependencies**: None  
**Status**: DONE  

**Deliverables:**
- [x] `website/` — Scaffolded manually (not via create-app, for full version control)
- [x] `website/package.json` — Independent package with all dependencies
- [x] `website/source.config.ts` — Fumadocs content configuration
- [x] `website/next.config.mjs` — Next.js + Fumadocs MDX plugin
- [x] `website/app/global.css` — Tailwind v4 CSS-first config with custom dark theme colors via `@theme` + shadcn/ui tokens
- [x] `website/app/layout.tsx` — Root layout with RootProvider
- [x] `website/app/docs/layout.tsx` — Docs layout with DocsLayout
- [x] `website/app/docs/[[...slug]]/page.tsx` — Dynamic docs renderer
- [x] `website/lib/source.ts` — Content source loader (using `collections/server` tsconfig alias)
- [x] `website/lib/layout.shared.ts` — Shared layout options
- [x] shadcn/ui initialized (New York style, neutral base color, CSS variables)
- [x] `motion` package installed (import from `motion/react`) and `lucide-react` installed
- [x] `website/vercel.json` — `ignoreCommand` for build skipping when only non-website files change
- [x] Root `.gitignore` updated for `website/`
- [x] `website/components.json` — shadcn/ui configuration
- [x] `website/lib/utils.ts` — `cn()` utility (shadcn)
- [x] `website/postcss.config.mjs` — PostCSS with `@tailwindcss/postcss`
- [x] `website/content/docs/index.mdx` — Initial docs page
- [x] `website/content/docs/meta.json` — Sidebar ordering

**Success Criteria:**
- [x] `pnpm dev` runs without errors in `website/`
- [x] `pnpm build` completes with zero errors and zero warnings
- [x] `/docs` route renders default Fumadocs docs page
- [x] Dark theme active by default
- [x] No interference with `plugin/` build or tests

**Implementation Notes:**
- Node 22+ required — Fumadocs v16 does not work with Node 18 or 20
- Fumadocs v16 requires Next.js 16 (not 15). Upgraded from initial v15 attempt.
- `fumadocs-mdx` v14 generates `.source/server.ts` (not `.source/index.ts`). The Webpack bundler cannot resolve the `fumadocs-mdx:collections/server` namespace import — must use tsconfig path alias `collections/server` → `.source/server.ts` instead.
- `RootProvider` import is `fumadocs-ui/provider/next` in v16 (not `fumadocs-ui/provider`).
- pnpm 10.x blocks build scripts by default — added `"pnpm": { "onlyBuiltDependencies": ["esbuild", "sharp"] }` to package.json.
- `postinstall: "fumadocs-mdx"` runs the type generator. Requires `source.config.ts` to exist before first install.
- Next.js 16 uses Turbopack by default for builds.
- Custom theme variables use `--color-brand-*` prefix (not `--color-accent-*`) to avoid collision with shadcn/ui's accent token system.
- Final dependency versions: `fumadocs-core@16.6.6`, `fumadocs-mdx@14.2.8`, `fumadocs-ui@16.6.6`, `next@16.1.6`, `react@19.2.4`, `tailwindcss@4.x`, `motion@12.x`.

---

### PHASE 2: Landing Page

**Goal**: Complete landing page with placeholder SVG, feature grid, and install CTA  
**Duration**: ~4 hours  
**Dependencies**: Phase 1 complete  
**Status**: DONE  

**Deliverables:**
- [x] `website/app/(home)/page.tsx` — Landing page composing Hero, Features, HowItWorks, Footer
- [x] `website/app/(home)/layout.tsx` — Home layout (HomeLayout from Fumadocs) — already done in Phase 1
- [x] `website/components/landing/hero.tsx` — Hero section with purple gradient tagline + placeholder SVG
- [x] `website/components/landing/features.tsx` — 8-feature grid with Lucide icons and per-card scroll animation
- [x] `website/components/landing/how-it-works.tsx` — Three-step workflow (Install, Code, Remember)
- [x] `website/components/landing/install-block.tsx` — Terminal-style install CTA with copy-to-clipboard
- [x] `website/components/landing/footer.tsx` — Site footer with Product/Resources/Community columns
- [x] `website/components/svg/memory-flow.tsx` — Placeholder SVG (replaced in Phase 4)
- [x] `website/lib/animations.ts` — Shared Motion animation variants
- [x] Motion scroll animations on all sections (independent `whileInView` per element)
- [x] Responsive design (mobile, tablet, desktop)
- [x] `prefers-reduced-motion` support in SVG via `@media` query
- [x] `geist@1.7.0` installed for GeistSans + GeistMono font variables

**Success Criteria:**
- [x] Landing page renders with all sections
- [x] Scroll animations fire correctly (no flicker, no secondary shift)
- [x] Mobile layout is usable
- [x] "Get Started" links to `/docs`
- [x] Install block has working copy-to-clipboard
- [ ] Lighthouse Performance >90 (to verify after deployment)

**Implementation Notes:**
- Brand color changed from blue (`#3b82f6`) to purple gradient (`#a855f7` → `#c084fc` → `#e879f9`). Applied via `--color-brand-*` CSS custom properties and `.text-gradient-brand` utility class.
- Animation approach evolved through two iterations:
  1. Initial: `useRef` + `useInView` + `animate={isInView ? ...}` — caused flicker on scroll due to intersection observer toggling. Replaced with `whileInView` + `viewport={{ once: true }}`.
  2. Second: Parent `staggerContainer` variant had `opacity: 0 → 1` causing a secondary "shift" after children completed their `fadeInUp`. Fixed by making `staggerContainer` a pure orchestrator (`hidden: {}`, no opacity). Then further simplified to independent `whileInView` per element with index-based delay — eliminates variant propagation entirely.
  3. CSS `transition-all` on feature cards conflicted with Motion's transform animation, causing a second visual rise after animation. Replaced with `transition-[border-color,box-shadow]`.
- Geist font package (`geist@1.7.0`) provides `GeistSans` and `GeistMono` font variables, loaded in `app/layout.tsx`.
- Commit: `8da384b`

---

### PHASE 3: Documentation Content

**Goal**: Initial documentation set covering installation, configuration, and core concepts  
**Duration**: ~4 hours  
**Dependencies**: Phase 1 complete (can run parallel with Phase 2)  
**Status**: PENDING  

**Deliverables:**
- [ ] `content/docs/index.mdx` — "What is codexfi?" overview
- [ ] `content/docs/installation.mdx` — Installation guide
- [ ] `content/docs/configuration.mdx` — Configuration reference
- [ ] `content/docs/how-it-works/overview.mdx` — Architecture overview
- [ ] `content/docs/how-it-works/memory-types.mdx` — Memory type reference
- [ ] `content/docs/how-it-works/extraction.mdx` — Extraction pipeline
- [ ] `content/docs/guides/opencode-setup.mdx` — OpenCode integration guide
- [ ] `content/docs/api-reference/memory-tool-api.mdx` — Memory tool API
- [ ] All `meta.json` files for sidebar ordering
- [ ] Code examples with syntax highlighting

**Success Criteria:**
- All P0 docs pages render correctly
- Sidebar navigation works with correct ordering
- Full-text search returns relevant results
- Code blocks have syntax highlighting and copy buttons
- No broken internal links

---

### PHASE 4: SVG Hero Animation

**Goal**: Replace placeholder with Gemini-designed animated SVG  
**Duration**: ~2 hours  
**Dependencies**: Phase 2 complete  
**Status**: DONE  

**Deliverables:**
- [x] SVG designed in Google AI Studio with Gemini 3.1 Pro
- [x] SVG optimized with SVGOMG (<50KB)
- [x] `website/components/svg/memory-flow.tsx` — Final animated SVG component
- [x] Responsive behavior verified (desktop + mobile)
- [x] `prefers-reduced-motion` pauses all CSS animations
- [x] Accessibility: `role="img"`, `aria-label`, `<title>` present

**Success Criteria:**
- [x] Animation loops smoothly with no visible restart
- [x] File size <50KB
- [x] No jank or frame drops on mobile
- [x] Lighthouse Performance score maintained >90
- [x] Screen reader announces meaningful description

---

### PHASE 5: Deploy & Launch

**Goal**: Production deployment at codexfi.com  
**Duration**: ~1 hour  
**Dependencies**: Phases 1-4 complete  
**Status**: PENDING  

**Deliverables:**
- [ ] Vercel project created with Git integration
- [ ] Root Directory set to `website`
- [ ] `codexfi.com` custom domain configured
- [ ] `www.codexfi.com` → `codexfi.com` redirect
- [ ] HTTPS certificate provisioned (automatic)
- [ ] Open Graph image (`og-image.png`) deployed
- [ ] Production deployment live and verified

**Success Criteria:**
- `codexfi.com` loads the landing page
- `codexfi.com/docs` loads the documentation
- All navigation links work
- Preview deployments work on PRs
- Lighthouse scores meet targets (Performance >90, Accessibility >95)
- SVG animation renders correctly in production

---

## CONFIDENCE CHECK

| Area | Score | Notes |
|------|-------|-------|
| Next.js App Router | 9/10 | Well-documented, widely used |
| Fumadocs configuration | 8/10 | Researched via Context7, clear patterns |
| shadcn/ui integration | 9/10 | Well-documented, used extensively |
| Motion animations | 9/10 | Researched scroll animations, variants, useInView via `motion/react` |
| SVG hero design | 7/10 | Depends on Gemini 3.1 Pro output quality — iterative process |
| Vercel Git deployment | 9/10 | Straightforward monorepo setup, well-documented |
| Tailwind CSS dark theme | 9/10 | CSS-first v4 configuration with `@theme` and `@custom-variant` |
| Content writing (docs) | 8/10 | Content exists in README.md and design docs; needs adaptation |
| DNS/domain configuration | 9/10 | Standard Vercel domain setup |

**Overall: 8.6/10** — SVG design is the main uncertainty, mitigated by iterative Gemini workflow and a placeholder fallback strategy.

---

## SESSION CONTINUITY

This design doc serves as the single source of truth for the website project. To resume work:

1. **Read this document** — contains all decisions, file paths, and phase status
2. **Check phase status** — see which phases are DONE vs PENDING
3. **Configuration files** — all code snippets are copy-paste ready
4. **Content structure** — file paths and sidebar config are fully specified
5. **SVG prompt** — Gemini prompt template is ready to use in AI Studio

**Key files to reference:**
- `website/source.config.ts` — Content source
- `website/lib/source.ts` — Page tree loader
- `website/lib/layout.shared.ts` — Shared nav/layout config
- `website/app/(home)/page.tsx` — Landing page entry
- `website/app/docs/layout.tsx` — Docs layout
- `content/docs/meta.json` — Sidebar ordering
