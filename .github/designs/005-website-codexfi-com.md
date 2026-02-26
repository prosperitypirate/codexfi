# codexfi.com Website — Design Document

**Feature**: Build and deploy codexfi.com — landing page + documentation site  
**Issue**: TBD  
**Branch**: `feature/website-design-doc`  
**Status**: PLANNING  
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
│  │  bun/tsup    │          │  │ Custom     │ │ Fumadocs    │ │ │
│  │              │          │  │ Next.js    │ │ MDX engine  │ │ │
│  │  Deploys via │          │  │ + shadcn   │ │ + search    │ │ │
│  │  npm OIDC    │          │  │ + Framer   │ │ + sidebar   │ │ │
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
| Package manager | pnpm (bun for builds) | pnpm |
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
| **Next.js** | 15+ (App Router) | Core framework, SSG/SSR, routing |
| **React** | 19+ | UI library |
| **TypeScript** | 5.7+ | Type safety |
| **Tailwind CSS** | 4.x | Utility-first styling |
| **pnpm** | 9+ | Package manager (consistent with project preference) |

### Documentation Layer

| Technology | Purpose |
|-----------|---------|
| **Fumadocs** (`fumadocs-core`, `fumadocs-ui`, `fumadocs-mdx`) | Docs framework — sidebar, search, navigation, MDX rendering |
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
| **Framer Motion** (`framer-motion`) | Scroll-triggered animations, viewport reveals, micro-interactions on landing page |
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
| Accent primary | `#3b82f6` to `#60a5fa` | CTAs, links, highlights (blue) |
| Accent glow | `#3b82f6` at 20% opacity | Glow effects behind cards, hero elements |
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
| **Zero Config** | Plug/Zap | One command install. No Docker, no database setup, no API keys to manage |
| **Session Continuity** | Link/Chain | Pick up exactly where you left off — your AI knows the full project history |
| **Local & Private** | Lock/Eye-off | All data stays on your machine. No cloud sync, no external persistence |
| **Smart Aging** | Clock/Refresh | Old memories are automatically consolidated and evolved, never duplicated |

**Card Design:**
- Dark surface with subtle border
- Icon with accent color glow
- Hover effect: slight lift + glow intensify (Framer Motion)
- Responsive: 2 columns on mobile, 3-4 on desktop

**Scroll Animation:**
- Cards fade in and slide up as they enter the viewport
- Staggered timing (`staggerChildren: 0.1`) for sequential reveal
- `useInView` with `{ once: true }` — animate once, don't re-trigger

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
import { docs } from '@/.source';
import { createMDXSource } from 'fumadocs-mdx';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  source: createMDXSource(docs),
});
```

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

**Landing page** (`app/(home)/page.tsx`) — custom, outside Fumadocs layout:
```typescript
// Uses HomeLayout from Fumadocs for consistent nav, but custom content
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export default function HomePage() {
  return (
    <HomeLayout {...baseOptions()}>
      {/* Custom hero, features, how-it-works, footer */}
    </HomeLayout>
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
    <DocsLayout {...baseOptions()} tree={source.getPageTree()}>
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
| Node.js Version | 22.x |

#### Behavior

| Event | What Happens |
|-------|-------------|
| PR created/updated (touches `website/`) | Vercel creates a **preview deployment** with a unique URL |
| PR created/updated (only touches `plugin/`) | Vercel **skips build** — no wasted compute |
| Merge to `main` (touches `website/`) | Vercel creates a **production deployment** at codexfi.com |
| Merge to `main` (only touches `plugin/`) | Vercel **skips build** |

Vercel's path-based filtering is automatic when Root Directory is set to `website`. It only triggers builds when files within that directory change.

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
website-build:
  runs-on: ubuntu-latest
  if: contains(github.event.pull_request.changed_files, 'website/')
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
    - run: pnpm install
      working-directory: website
    - run: pnpm build
      working-directory: website
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
    utils.ts                        # cn() utility (shadcn)
  public/
    favicon.ico
    og-image.png                    # Open Graph image for social sharing
  source.config.ts                  # Fumadocs MDX configuration
  next.config.mjs                   # Next.js configuration
  tailwind.config.ts                # Tailwind CSS configuration
  tsconfig.json                     # TypeScript configuration
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

The hero SVG is the visual centerpiece of the landing page. It visualizes the codexfi memory lifecycle — the core value proposition made tangible through animation.

### Design Process

1. **Prompt Gemini 3.1 Pro** in Google AI Studio with detailed description (see prompt below)
2. **Iterate** — adjust colors, timing, complexity, and flow
3. **Set thinking level to High** — for precision in spatial layout and animation timing
4. **Export** — copy generated SVG code
5. **Optimize** — run through SVGOMG to strip metadata, simplify paths
6. **Integrate** — embed as inline React component in `components/svg/memory-flow.tsx`
7. **Test** — verify animation smoothness, responsiveness, accessibility

### Gemini Prompt Template

```
Create an animated SVG visualization of a memory extraction and retrieval system
for an AI coding agent. The visualization should show:

1. LEFT SIDE: Conversation bubbles or code blocks appearing (representing AI chat sessions)
2. CENTER: Animated particles/lines flowing from conversations, representing "extraction"
   - Label some particles with memory types: "architecture", "tech-context", "progress",
     "learned-pattern", "preference"
3. RIGHT SIDE: A structured storage cluster (representing LanceDB vector database)
   - Show memories being organized and stored
4. BOTTOM/RETURN FLOW: A retrieval path showing relevant memories flowing back
   into a new conversation session, with a "[MEMORY]" label

Design specifications:
- Background: transparent (will be placed on #0a0a0a)
- Primary colors: #3b82f6 (blue), #60a5fa (light blue), #4ade80 (green for terminal)
- Subtle glow effects on connections and nodes
- All animations use CSS @keyframes (no JavaScript)
- Smooth infinite loop with no visible restart seam
- Use viewBox for responsive scaling, no fixed pixel dimensions
- Include <title> element for accessibility
- File should be under 50KB when optimized
- Premium, sophisticated feel — not cartoon-like or generic
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

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.mdx',
    './node_modules/fumadocs-ui/dist/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        accent: {
          DEFAULT: '#3b82f6',
          light: '#60a5fa',
          glow: 'rgba(59, 130, 246, 0.2)',
        },
        surface: {
          DEFAULT: '#1a1a1a',
          elevated: '#1e1e1e',
        },
        terminal: {
          green: '#4ade80',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'JetBrains Mono', 'monospace'],
      },
    },
  },
};

export default config;
```

### Animation Patterns (Framer Motion)

**Scroll reveal variant** — reusable across landing page sections:
```typescript
// lib/animations.ts
export const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' } },
};
```

**Usage pattern:**
```tsx
import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';

function Section({ children }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={staggerContainer}
    >
      {children}
    </motion.section>
  );
}
```

### Reduced Motion Support

All Framer Motion animations must respect user preferences:

```typescript
import { useReducedMotion } from 'framer-motion';

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
| 6 | Animation library | Framer Motion (`framer-motion`) | Best-in-class for scroll reveals and micro-interactions. React-native API. Production-proven. |
| 7 | SVG design tool | Google Gemini 3.1 Pro (design-time only) | Best-in-class animated SVG generation from text prompts. Pure code output, not pixels. Design-time tool, not runtime dependency. |
| 8 | Deployment | Vercel Git integration (not GitHub Actions) | Zero-config. Automatic preview deploys on PRs. Automatic production deploys on merge. No secrets needed. Built-in path filtering for monorepos. |
| 9 | Custom domain | codexfi.com (already owned) | Direct from Vercel project settings. Automatic HTTPS. |
| 10 | CI for website | Defer — use Vercel preview builds as gate | Vercel already catches build failures. Adding CI check adds complexity for no incremental safety. |
| 11 | Dark mode | Dark by default, light mode available via toggle | Target audience is developers. Dark aesthetic matches product identity. |
| 12 | Landing page position | Outside Fumadocs layout (`/` is custom) | Full creative control. Fumadocs only manages `/docs/*`. |
| 13 | Content format | MDX in `content/docs/` | Rich content with embedded React components. Fumadocs processes automatically. |

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
**Status**: PENDING  

**Deliverables:**
- [ ] `website/` — Scaffolded via `pnpm create fumadocs-app website`
- [ ] `website/package.json` — Independent package with all dependencies
- [ ] `website/source.config.ts` — Fumadocs content configuration
- [ ] `website/next.config.mjs` — Next.js + Fumadocs MDX plugin
- [ ] `website/tailwind.config.ts` — Tailwind with custom dark theme colors
- [ ] `website/app/layout.tsx` — Root layout with RootProvider
- [ ] `website/app/docs/layout.tsx` — Docs layout with DocsLayout
- [ ] `website/app/docs/[[...slug]]/page.tsx` — Dynamic docs renderer
- [ ] `website/lib/source.ts` — Content source loader
- [ ] `website/lib/layout.shared.ts` — Shared layout options
- [ ] shadcn/ui initialized (New York style, dark mode, CSS variables)
- [ ] `framer-motion` and `lucide-react` installed
- [ ] Root `.gitignore` updated for `website/`

**Success Criteria:**
- `pnpm dev` runs without errors in `website/`
- `/docs` route renders default Fumadocs docs page
- Dark theme active by default
- No interference with `plugin/` build or tests

---

### PHASE 2: Landing Page

**Goal**: Complete landing page with placeholder SVG, feature grid, and install CTA  
**Duration**: ~4 hours  
**Dependencies**: Phase 1 complete  
**Status**: PENDING  

**Deliverables:**
- [ ] `website/app/(home)/page.tsx` — Landing page
- [ ] `website/app/(home)/layout.tsx` — Home layout (HomeLayout from Fumadocs)
- [ ] `website/components/landing/hero.tsx` — Hero section with tagline + placeholder SVG
- [ ] `website/components/landing/features.tsx` — Feature grid with icons
- [ ] `website/components/landing/how-it-works.tsx` — Three-step workflow
- [ ] `website/components/landing/install-block.tsx` — Terminal-style install CTA
- [ ] `website/components/landing/footer.tsx` — Site footer
- [ ] `website/components/svg/memory-flow.tsx` — Placeholder SVG (replaced in Phase 4)
- [ ] Framer Motion scroll animations on all sections
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] `prefers-reduced-motion` support

**Success Criteria:**
- Landing page renders with all sections
- Scroll animations fire correctly
- Mobile layout is usable
- "Get Started" links to `/docs`
- Install block has working copy-to-clipboard
- Lighthouse Performance >90

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
**Status**: PENDING  

**Deliverables:**
- [ ] SVG designed in Google AI Studio with Gemini 3.1 Pro
- [ ] SVG optimized with SVGOMG (<50KB)
- [ ] `website/components/svg/memory-flow.tsx` — Final animated SVG component
- [ ] Responsive behavior verified (desktop + mobile)
- [ ] `prefers-reduced-motion` pauses all CSS animations
- [ ] Accessibility: `role="img"`, `aria-label`, `<title>` present

**Success Criteria:**
- Animation loops smoothly with no visible restart
- File size <50KB
- No jank or frame drops on mobile
- Lighthouse Performance score maintained >90
- Screen reader announces meaningful description

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
| Framer Motion animations | 9/10 | Researched scroll animations, variants, useInView |
| SVG hero design | 7/10 | Depends on Gemini 3.1 Pro output quality — iterative process |
| Vercel Git deployment | 9/10 | Straightforward monorepo setup, well-documented |
| Tailwind CSS dark theme | 9/10 | Standard CSS variables approach |
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
