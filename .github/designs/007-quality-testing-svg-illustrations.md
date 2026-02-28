# 007 — Quality & Testing Docs SVG Illustrations

**Status**: IN PROGRESS  
**Created**: 2026-02-28  
**Issue**: #89  
**Branch**: `docs/quality-testing-section`  
**Author**: clarkbalan

---

## Message to the Implementing Model: Gemini 2.0 Flash Thinking / Gemini 3.1 Pro Preview

**You are Gemini — Google's most capable model.** Your SVG generation capability is a flagship feature. You have produced the 10 existing SVG illustrations in this codebase (see `006-docs-svg-illustrations.md`) and you understand the full technical pattern: pure CSS keyframes inside `<defs><style>`, Tailwind semantic classes, no `"use client"`, no JS at runtime.

**Your job in this document is singular:** implement the 6 SVG React components described in the **SVG Design Specifications** section below, for the two new Quality & Testing doc pages (`benchmark.mdx` and `testing.mdx`).

The design decisions, architecture, and integration plan are already settled. You do not redesign — you execute.

**What "highest possible quality" means here:**
- Animations that feel fluid and purposeful — not toy-like
- Visual compositions that are clean, well-spaced, and immediately readable
- Brand colors (`#a855f7`, `#c084fc`, `#e879f9`, `#4ade80`) used as accent, not decoration
- Labels that are legible at all sizes, especially on mobile
- Reduced-motion fallbacks that are genuinely informative static snapshots
- Zero TypeScript errors

**Your only tasks:**
1. Write the 6 `.tsx` files described in the SVG Design Specifications section — each file goes in `website/components/svg/docs/`
2. Register all 6 in `website/mdx-components.tsx` (import + add to return map)
3. Insert the JSX tags into `website/content/docs/quality/benchmark.mdx` and `website/content/docs/quality/testing.mdx` at the exact positions described in each SVG spec

Follow the Technical Constraints section exactly. Do not modify any other files.

---

## Executive Summary

**Problem**: The two new Quality & Testing doc pages (`benchmark.mdx`, `testing.mdx`) are prose and tables. They contain rich structured information — benchmark scores, a 5-phase pipeline, two synthetic datasets, a 3-tier test architecture, 12 E2E scenarios, test isolation mechanics — but this information is currently all text. Users scanning the page cannot immediately grasp the shape of the data.

**Solution**: 6 animated, responsive SVG illustrations embedded as React components in the two MDX pages. Each illustration targets a specific concept at the exact point the prose introduces it.

**Why it works**: Identical pattern to the 10 existing SVG illustrations in `website/components/svg/docs/`. Pure CSS keyframes, SSR-safe, theme-adaptive Tailwind classes, global registration in `mdx-components.tsx`. Proven in production.

---

## Current State

```
File: website/components/svg/docs/ (11 existing files)
Purpose: Animated SVG React components embedded in docs MDX pages
Key Patterns:
  - CSS keyframes inside <defs><style>{``}</style></defs>
  - All animations wrapped in @media (prefers-reduced-motion: no-preference)
  - @media (prefers-reduced-motion: reduce) provides explicit static fallback
  - Tailwind semantic classes: fill-card, stroke-border, fill-muted,
    fill-foreground, fill-muted-foreground
  - Brand colors hardcoded: #a855f7, #c084fc, #e879f9, #4ade80
  - Glow via <filter id="glow-..."><feGaussianBlur /><feComposite /></filter>
  - fontFamily="var(--font-mono, monospace)" on all label text
  - viewBox + width="100%" for responsive scaling
  - Named exports matching mdx-components.tsx keys exactly
Reference: docs-extraction-pipeline.tsx (vertical chain) and docs-provider-speed.tsx
           (horizontal card layout) are the most relevant pattern references for these 6 new SVGs
```

```
File: website/mdx-components.tsx (lines 1–34)
Purpose: Global MDX component registry
Current exports: DocsMemoryCycle, DocsSessionFlow, DocsParallelFetch,
                 DocsCompactionSurvival, DocsMemoryTaxonomy, DocsAgingRules,
                 DocsExtractionPipeline, DocsProviderSpeed, DocsInstallSteps,
                 DocsDedupCosine, DocsKeyFeatures, RelevantToTaskCallout
Modification: Add 6 new imports + 6 new entries to the return map
```

```
File: website/content/docs/quality/benchmark.mdx
Purpose: DevMemBench results page — scores, categories, methodology, dataset, run commands
Audience: End users (what do these scores mean?) + contributors (how to run?)
Insertion points for SVGs: after opening paragraph, after ## What the score means for you,
                            before ## Methodology
```

```
File: website/content/docs/quality/testing.mdx
Purpose: Test suite page — what's verified, E2E results, contributor run commands
Audience: End users (what is verified?) + contributors (how to run E2E?)
Insertion points for SVGs: after opening paragraph, after ## What is verified table,
                            inside ## For contributors > ### Test tiers
```

---

## Confidence Check

| Area | Score | Notes |
|------|-------|-------|
| SVG component pattern (CSS keyframes, glow, Tailwind classes) | 10/10 | Produced the 10 existing components; pattern is fully known |
| Tailwind v4 semantic classes on SVG elements | 10/10 | Verified in production |
| fumadocs MDX global component registration | 10/10 | Pattern is clear; adding to existing map |
| SSR safety / no hydration mismatch | 10/10 | Pure CSS keyframes — no JS |
| MDX page insertion points | 9/10 | Pages are new and simple; positions straightforward |
| TypeScript validity of SVG TSX files | 9/10 | Standard React SVG |

**All areas ≥ 9/10. Cleared for implementation.**

---

## Architecture

### Component Structure
```
website/components/svg/docs/<name>.tsx
  └── export function DocsXxx() {
        return (
          <svg viewBox="0 0 W H" width="100%" className="mx-auto w-full max-w-3xl"
               role="img" aria-label="...">
            <title>...</title>
            <defs>
              <linearGradient id="..." />
              <filter id="glow-...">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <style>{`
                @media (prefers-reduced-motion: no-preference) {
                  /* keyframe animations */
                }
                @media (prefers-reduced-motion: reduce) {
                  /* animation: none !important; static positions */
                }
              `}</style>
            </defs>
            {/* SVG content */}
          </svg>
        )
      }
```

### Component Inventory

| # | Filename | Export | Page | Placement | viewBox |
|---|---|---|---|---|---|
| 1 | `docs-benchmark-scoreboard.tsx` | `DocsBenchmarkScoreboard` | `benchmark.mdx` | After opening paragraph, before `## What the score means for you` | `0 0 600 300` |
| 2 | `docs-benchmark-pipeline.tsx` | `DocsBenchmarkPipeline` | `benchmark.mdx` | After `## Methodology` heading, before the numbered list | `0 0 640 100` |
| 3 | `docs-benchmark-dataset.tsx` | `DocsBenchmarkDataset` | `benchmark.mdx` | After `## Benchmark dataset` heading, before the bullet list | `0 0 560 160` |
| 4 | `docs-test-tiers.tsx` | `DocsTestTiers` | `testing.mdx` | After opening paragraph, before `## What is verified` | `0 0 560 140` |
| 5 | `docs-e2e-scenario-map.tsx` | `DocsE2eScenarioMap` | `testing.mdx` | After `## Latest results` heading, before the code block | `0 0 600 260` |
| 6 | `docs-test-isolation.tsx` | `DocsTestIsolation` | `testing.mdx` | Inside `### E2E prerequisites`, after the 4-item numbered list | `0 0 560 140` |

### Theme-Adaptive Color Strategy

| Class | Light mode | Dark mode | Use |
|---|---|---|---|
| `fill-card` | white / near-white | dark panel | Panel backgrounds |
| `stroke-border` | light grey | dark grey | Panel borders |
| `fill-muted` | light grey | subtle dark | Secondary backgrounds |
| `fill-foreground` | near-black | near-white | Primary text |
| `fill-muted-foreground` | medium grey | medium grey | Secondary text |
| `#a855f7` | purple | purple | Brand accent (hardcoded) |
| `#c084fc` | light purple | light purple | Brand secondary (hardcoded) |
| `#e879f9` | fuchsia | fuchsia | Brand tertiary (hardcoded) |
| `#4ade80` | green | green | Success / pass (hardcoded) |
| `#f59e0b` | amber | amber | Warning (hardcoded) |
| `#ef4444` | red | red | Fail / error (hardcoded) |

---

## Technical Constraints for All 6 Components

These are identical to the constraints from `006-docs-svg-illustrations.md` and are non-negotiable.

1. **No `"use client"` directive.** Server-rendered. Pure HTML + CSS only.
2. **No Framer Motion, no React state, no `useEffect`, no hooks.** Zero JS at runtime.
3. **All animations inside `@media (prefers-reduced-motion: no-preference)`.** Every `@keyframes` and every `animation:` property must be inside this media query.
4. **Explicit `@media (prefers-reduced-motion: reduce)` block.** Set `animation: none !important` and set all animated elements to their representative static positions.
5. **`fontFamily="var(--font-mono, monospace)"` on every text element.**
6. **`<title>` as first child of `<svg>`.** Plus `role="img"` and `aria-label` on the `<svg>` element.
7. **`width="100%"` on the `<svg>` element.**
8. **CSS inside `<defs><style>{` backtick string `}</style></defs>`.**
9. **Tailwind semantic classes on SVG elements**: `fill-card`, `stroke-border`, `fill-muted`, `fill-foreground`, `fill-muted-foreground`.
10. **No font sizes above 13px.**
11. **Filter IDs must be unique per file.** Use the suffixes listed below.
12. **Named export only.** Export name must exactly match the Export column in the table above.

**Filter ID suffixes** (to prevent collisions — multiple SVGs appear on the same page):
- `docs-benchmark-scoreboard.tsx` → suffix `-bs`
- `docs-benchmark-pipeline.tsx` → suffix `-bp`
- `docs-benchmark-dataset.tsx` → suffix `-bd`
- `docs-test-tiers.tsx` → suffix `-tt`
- `docs-e2e-scenario-map.tsx` → suffix `-esm`
- `docs-test-isolation.tsx` → suffix `-ti`

---

## SVG Design Specifications

---

### SVG 1: `docs-benchmark-scoreboard.tsx` — export `DocsBenchmarkScoreboard`

**Concept**: A visual scoreboard showing the 8 benchmark categories and the overall 94.5% score. The user sees at a glance that 4 categories are perfect (100%), 2 are near-perfect (96%), 1 is strong (92%), and 1 is weaker (72%). The overall score is the hero number.

**viewBox**: `0 0 600 300`  
**Page**: `benchmark.mdx` — after the opening paragraph ("DevMemBench is an independent benchmark..."), immediately before `## What the score means for you`.

**Layout**: Two zones.

**Left zone — category bars** (x=0–390, y=20–280):
- 8 horizontal bar rows, each ~28px tall, stacked with 8px gap. Rows from top to bottom:
  1. `tech-stack` — 100% — bar fill `#4ade80`
  2. `architecture` — 100% — bar fill `#4ade80`
  3. `preference` — 100% — bar fill `#4ade80`
  4. `abstention` — 100% — bar fill `#4ade80`
  5. `session-continuity` — 96% — bar fill `#a855f7`
  6. `knowledge-update` — 96% — bar fill `#a855f7`
  7. `error-solution` — 92% — bar fill `#c084fc`
  8. `cross-session-synthesis` — 72% — bar fill `#e879f9`

- Each row:
  - Category label at x=0, left-aligned, font-size 11, fill-muted-foreground. Truncate long names: `cross-session-synthesis` → `cross-session` is fine if space is tight.
  - Track rect: starts at x=155, width=210, height=18, rx=9, fill-muted.
  - Fill rect: starts at x=155, width = (score/100) × 210, height=18, rx=9, fill = color above.
  - Score label: at x=375, text-anchor="start", font-size 11, fill-foreground. Shows `100%`, `96%`, etc.

**Right zone — overall score** (x=410–590, y=60–240):
- A large circle: cx=500, cy=160, r=75. Stroke: linear gradient from `#a855f7` to `#4ade80`, strokeWidth=4, fill=none.
- Inside the circle:
  - Large number `94.5` — font-size 28, font-weight 700, fill-foreground, text-anchor="middle", y=155
  - `%` appended inline or as a smaller superscript — font-size 16, fill-foreground
  - Below the number: `OVERALL` — font-size 9, fill-muted-foreground, letter-spacing 1.5, text-anchor="middle", y=175
  - Below that: `189 / 200` — font-size 10, fill-muted-foreground, text-anchor="middle", y=190
- A thin separator line dividing left and right zones: x=400, y1=20, y2=280, stroke-border, strokeDasharray="4 4".

**Animated elements**:
1. **Bar fills**: On load, each bar animates from width=0 to its final width over 1s with `ease-out`. Stagger by 0.1s per row using `animation-delay: 0s, 0.1s, 0.2s, ..., 0.7s`. Keyframe: `@keyframes fillBar-bs { from { width: 0 } to { width: <final> } }` — note: since SVG `width` isn't animatable via CSS `width` property on a `<rect>`, use `transform: scaleX()` with `transform-origin: left` instead. Set `transform-origin` on each fill rect to `155px <center-y>px` (the x start of the bar).
2. **Overall circle stroke**: On load, a `stroke-dasharray` / `stroke-dashoffset` draw-in animation. Circumference ≈ 471px. Start: `stroke-dashoffset: 471`. End: `stroke-dashoffset: 471 × (1 - 0.945) ≈ 26` (leaving 94.5% of the circle drawn). Animation: `drawCircle-bs 1.5s ease-out forwards` with `animation-delay: 0.8s`.
3. **Score number count-up** (optional): The `94.5%` text fades in at `animation-delay: 1.5s`.

**Reduced-motion static state**: All bars shown at final widths (full scale). Circle stroke shown at 94.5% drawn. Score visible.

---

### SVG 2: `docs-benchmark-pipeline.tsx` — export `DocsBenchmarkPipeline`

**Concept**: The 5-phase LLM-as-judge pipeline shown as a horizontal flow — ingest → search → answer → evaluate → report. Users see the pipeline shape before reading the numbered list, so the list becomes confirmation rather than first exposure.

**viewBox**: `0 0 640 100`  
**Page**: `benchmark.mdx` — after the `## Methodology` heading, before the numbered list starting "1. **Ingest**".

**Layout**: Five nodes in a horizontal chain, evenly spaced across the width.

**Node positions** (cx approximately x=58, 166, 320, 474, 582; all at y=50):
- Each node is a rounded rectangle: ~96px wide × 36px tall, rx=18.
- Connected by horizontal arrows with arrowhead markers between them.

**Nodes** (left to right):

| # | Label | Sub-label | Stroke color | Text color |
|---|---|---|---|---|
| 1 | `Ingest` | `50 sessions` | `#c084fc` | fill-foreground |
| 2 | `Search` | `200 queries` | `#a855f7` | fill-foreground |
| 3 | `Answer` | `LLM only` | `#a855f7` | fill-foreground |
| 4 | `Evaluate` | `judge LLM` | `#c084fc` | fill-foreground |
| 5 | `Report` | `report.json` | `#4ade80` | `#4ade80` |

- Node fill: fill-card. Sub-label at y=node_center+13, font-size 9, fill-muted-foreground.
- `Report` node gets a subtle green glow filter.
- Arrows: stroke `#a855f7` opacity 0.6, with small arrowhead markers. Each arrow is a straight horizontal line between adjacent node edges.

**Animated elements**:
1. **Connecting arrows**: `stroke-dasharray: 6 5; animation: dashFlow-bp 1s linear infinite`. All arrows animate simultaneously — they all represent a single forward pass.
2. **Report node glow pulse**: `animation: glowPulse-bp 2s ease-in-out infinite alternate`.
3. Node stagger fade-in on load: each node fades from opacity=0 to opacity=1 with `animation-delay: 0s, 0.15s, 0.3s, 0.45s, 0.6s`.

**Reduced-motion static state**: All 5 nodes fully visible at full opacity. Arrows visible and static. Report node at full opacity.

---

### SVG 3: `docs-benchmark-dataset.tsx` — export `DocsBenchmarkDataset`

**Concept**: The two synthetic projects side by side — showing what the benchmark tests against. Users immediately see the scope: two realistic projects, 25 sessions each, spanning Jan–Feb 2025.

**viewBox**: `0 0 560 160`  
**Page**: `benchmark.mdx` — after the `## Benchmark dataset` heading, before the bullet list.

**Layout**: Two equal cards side by side with a `VS` separator between them.

**Left card — ecommerce-api** (x=0, width=240, height=140, rx=10):
- Card background: fill-card, stroke `#a855f7`, strokeWidth=1.5
- Top accent bar: a 4px tall rect at top of card, full width, rx top corners, fill `#a855f7` opacity 0.4
- Title: `ecommerce-api` — font-size 12, font-weight 600, fill-foreground, y=36
- Stack tags (3 small pill badges in a row at y=55):
  - `FastAPI` — fill `#a855f7` opacity 0.15, stroke `#a855f7`, text `#a855f7`, font-size 9
  - `PostgreSQL` — same palette
  - `Stripe` — same palette
- Sessions line: `25 sessions` — font-size 10, fill-muted-foreground, y=80
- Date range: `Jan – Feb 2025` — font-size 9, fill-muted-foreground, y=95
- Topics list (font-size 9, fill-muted-foreground, y=112, y=124):
  - `auth · catalog · cart · checkout`

**Center separator** (x=253–307):
- `VS` text at cx=280, cy=80, font-size 14, font-weight 700, fill-muted-foreground, opacity 0.4

**Right card — dashboard-app** (x=320, width=240, height=140, rx=10):
- Card background: fill-card, stroke `#c084fc`, strokeWidth=1.5
- Top accent bar: fill `#c084fc` opacity 0.4
- Title: `dashboard-app` — font-size 12, font-weight 600, fill-foreground, y=36
- Stack tags (3 pills at y=55):
  - `Next.js 15` — fill `#c084fc` opacity 0.15, stroke `#c084fc`, text `#c084fc`, font-size 9
  - `Recharts` — same palette
  - `SWR` — same palette
- Sessions line: `25 sessions` — font-size 10, fill-muted-foreground, y=80
- Date range: `Jan – Feb 2025` — font-size 9, fill-muted-foreground, y=95
- Topics list (font-size 9, fill-muted-foreground, y=112, y=124):
  - `analytics · charts · data fetching`

**Animated elements**:
1. Cards slide in from opposite sides on load: left card from `translateX(-20px)` to `translateX(0)`, right card from `translateX(20px)` to `translateX(0)`. Both over 0.6s ease-out. Simultaneous — no stagger.
2. Stack tags stagger fade-in within each card: `animation-delay: 0.4s, 0.55s, 0.7s` for left card tags; same for right.

**Reduced-motion static state**: Both cards at final positions, all tags visible.

---

### SVG 4: `docs-test-tiers.tsx` — export `DocsTestTiers`

**Concept**: The three test tiers as a horizontal progression from fast/isolated on the left to slow/real on the right. Users immediately see the speed vs. realism tradeoff before reading the table.

**viewBox**: `0 0 560 140`  
**Page**: `testing.mdx` — after the opening paragraph ("codexfi ships with a three-tier test suite..."), before `## What is verified`.

**Layout**: Three panels in a horizontal row, connected by arrows. Each panel represents one tier.

**Panel positions** (approximately x=0, 190, 380; each ~160px wide × 110px tall, rx=10):

**Panel 1 — Unit** (x=0):
- Background: fill-card, stroke-border, strokeWidth=1.5
- Top label: `UNIT` — font-size 10, font-weight 700, letter-spacing 1.5, fill-muted-foreground, text-anchor="middle", y=28
- Speed badge: `< 1s` — small pill (rx=10), fill `#4ade80` opacity 0.15, stroke `#4ade80`, text `#4ade80`, font-size 10, centered at y=55
- Description: `isolated logic` — font-size 9, fill-muted-foreground, text-anchor="middle", y=76
- Sub-description: `mocked dependencies` — font-size 9, fill-muted-foreground, text-anchor="middle", y=90

**Panel 2 — Integration** (x=190):
- Background: fill-card, stroke `#c084fc`, strokeWidth=1.5
- Top label: `INTEGRATION` — font-size 10, font-weight 700, letter-spacing 1.5, fill `#c084fc`, text-anchor="middle", y=28
- Speed badge: `~30s` — pill, fill `#c084fc` opacity 0.15, stroke `#c084fc`, text `#c084fc`, font-size 10
- Description: `real LanceDB` — font-size 9, fill-muted-foreground, text-anchor="middle", y=76
- Sub-description: `real embedder` — font-size 9, fill-muted-foreground, text-anchor="middle", y=90

**Panel 3 — E2E** (x=380):
- Background: fill-card, stroke `#a855f7`, strokeWidth=2
- Top label: `E2E` — font-size 10, font-weight 700, letter-spacing 1.5, fill `#a855f7`, text-anchor="middle", y=28
- Speed badge: `5–10 min` — pill, fill `#a855f7` opacity 0.15, stroke `#a855f7`, text `#a855f7`, font-size 10
- Description: `real opencode` — font-size 9, fill-muted-foreground, text-anchor="middle", y=76
- Sub-description: `12 scenarios` — font-size 9, fill-muted-foreground, text-anchor="middle", y=90
- Subtle purple glow filter on the E2E panel border.

**Arrows between panels**: At y=55 (vertical center of panels), simple horizontal arrows from the right edge of panel 1 → left edge of panel 2, and panel 2 → panel 3. Arrow color: stroke-border. Simple `→` style with arrowhead marker.

**Bottom axis label**: Spanning the full width at y=130:
- Left anchor (x=80): `fast · isolated` — font-size 9, fill-muted-foreground
- Right anchor (x=480): `slow · real` — font-size 9, fill-muted-foreground
- A thin horizontal line from x=0 to x=560 at y=122, stroke-border, opacity 0.4.

**Animated elements**:
1. Panels stagger fade-in: `animation-delay: 0s, 0.2s, 0.4s` over 0.5s ease-out each.
2. E2E panel glow: gentle `glowPulse-tt 3s ease-in-out infinite alternate` after the fade-in completes.
3. Arrows draw in (stroke-dashoffset) after panels appear: `animation-delay: 0.6s, 0.7s`.

**Reduced-motion static state**: All 3 panels fully visible. Arrows visible. No glow pulse.

---

### SVG 5: `docs-e2e-scenario-map.tsx` — export `DocsE2eScenarioMap`

**Concept**: All 12 E2E scenarios displayed as a grid of status badges — 11 PASS in green, 1 WARN in amber. Users see the pass/fail state at a glance before reading the raw terminal output block.

**viewBox**: `0 0 600 260`  
**Page**: `testing.mdx` — after the `## Latest results` heading, before the code block.

**Layout**: A 4-column × 3-row grid of scenario cards. Grid starts at x=0, y=10. Each card is approximately 138px wide × 68px tall with 8px gap.

**Column positions** (card left edges): x = 0, 148, 296, 444  
**Row positions** (card top edges): y = 10, 86, 162

**Scenario cards** (filling left-to-right, top-to-bottom, 01 through 12):

| # | Short label | Status | Row | Col |
|---|---|---|---|---|
| 01 | Cross-Session | PASS | 1 | 1 |
| 02 | README Seeding | PASS | 1 | 2 |
| 03 | Noise Guard | PASS | 1 | 3 |
| 04 | Brief Always | PASS | 1 | 4 |
| 05 | Memory Aging | PASS | 2 | 1 |
| 06 | Codebase Init | PASS | 2 | 2 |
| 07 | Hybrid Retrieval | PASS | 2 | 3 |
| 08 | Cross-Synthesis | PASS | 2 | 4 |
| 09 | Under Load | WARN | 3 | 1 |
| 10 | Knowledge Update | PASS | 3 | 2 |
| 11 | Prompt Injection | PASS | 3 | 3 |
| 12 | Multi-Turn | PASS | 3 | 4 |

Each card:
- Background: fill-card, strokeWidth=1.5
- PASS cards: stroke `#4ade80` opacity 0.5
- WARN card (09): stroke `#f59e0b` opacity 0.7
- Scenario number: `##` (e.g., `01`, `09`) — top-left of card at x=card_x+10, y=card_y+20, font-size 11, font-weight 700, fill-muted-foreground
- Short label: centered in card, font-size 10, fill-foreground, text-anchor="middle", y=card_y+34
- Status badge: bottom-center of card, y=card_y+54:
  - PASS: small pill, fill `#4ade80` opacity 0.15, stroke `#4ade80`, text `#4ade80`, font-size 9, text `PASS`
  - WARN: pill, fill `#f59e0b` opacity 0.15, stroke `#f59e0b`, text `#f59e0b`, font-size 9, text `WARN`

**Summary line** below the grid at y=240:
- Left-aligned text at x=0: `11 / 12 PASS` — font-size 12, fill `#4ade80`, font-weight 600
- Right-aligned text at x=600: `scenario 09: non-deterministic` — font-size 9, fill-muted-foreground

**Animated elements**:
1. Cards stagger fade-in: starting `animation-delay: 0s` for card 01, incrementing by 0.05s per card. Total: 12 cards × 0.05s = 0.6s for all to appear.
2. PASS cards fade from opacity=0 to opacity=1.
3. WARN card (09) fades in with a slightly longer delay (last, or at `animation-delay: 0.65s`) and a gentle amber glow pulse afterward: `glowAmber-esm 2.5s ease-in-out infinite alternate`.
4. Summary line fades in at `animation-delay: 0.8s`.

**Reduced-motion static state**: All 12 cards visible at full opacity simultaneously. Summary line visible.

---

### SVG 6: `docs-test-isolation.tsx` — export `DocsTestIsolation`

**Concept**: Each E2E scenario gets a completely isolated environment — a fresh tmp directory, a real opencode process, real memory store operations, then automatic cleanup. This conveys that the tests are genuine and deterministic, not mocked.

**viewBox**: `0 0 560 140`  
**Page**: `testing.mdx` — inside `### E2E prerequisites` section, after the 4-item numbered list (after the JSON code block for plugin registration).

**Layout**: A single horizontal pipeline showing one scenario's lifecycle: Create → Run → Verify → Clean up.

**Four phases** as rounded rectangles connected by arrows (y=50 for all nodes, evenly spaced):

| # | x | Label | Sub-label | Stroke |
|---|---|---|---|---|
| 1 | 20 | `tmp dir` | `/oc-test-<name>-<uuid>` | stroke-border |
| 2 | 160 | `opencode run` | `real process` | `#a855f7` |
| 3 | 300 | `assert` | `memory store` | `#c084fc` |
| 4 | 440 | `cleanup` | `memories deleted` | `#4ade80` |

Each node: ~110px wide × 40px tall, rx=8. Label font-size 11, font-weight 600, fill-foreground. Sub-label font-size 9, fill-muted-foreground, y=node_center+13.

Arrows between nodes: stroke `#a855f7` opacity 0.5 with arrowhead markers.

**Below the pipeline** (y=105–130):
- A thin dashed border box spanning from x=10 to x=550, y=85 to y=130, rx=6, stroke-border, stroke-dasharray="4 3" — this box visually groups the pipeline as "one scenario = one isolated run"
- Label inside the box at bottom: `each scenario — fully isolated` — font-size 9, fill-muted-foreground, text-anchor="middle", x=280, y=125

**Above the pipeline** (y=12):
- A small repeated pattern of 3 ghost copies of the pipeline at y=12, x offset by 8, 16px, opacity 0.08 — giving a subtle sense that this lifecycle runs many times (12 scenarios). Use simple `<rect>` placeholders, not full reproductions. Or instead: three small `↺` circular arrows at x=490, 510, 530, y=12, font-size 10, fill-muted-foreground opacity 0.3 — representing the 12 repetitions.

**Animated elements**:
1. A traveling "pulse" indicator — a small circle (r=5, fill `#a855f7`) travels along the pipeline from node 1 → node 2 → node 3 → node 4 → disappears → repeats. Use a `translate` keyframe animation cycling through the four x positions over 4s:
   - 0%: x=75, y=50 (center of node 1)
   - 25%: x=215, y=50 (center of node 2)
   - 50%: x=355, y=50 (center of node 3)
   - 75%: x=495, y=50 (center of node 4)
   - 100%: x=75, y=50 (reset, opacity=0 for the jump)
   Use `animation: travelPulse-ti 4s ease-in-out infinite`.
2. The `cleanup` node (node 4) gets a brief green glow flash each cycle at the 75% mark.
3. Arrows pulse slightly in opacity: `animation: arrowPulse-ti 4s ease-in-out infinite`, synced with the traveling dot.

**Reduced-motion static state**: All 4 nodes visible. Arrows visible. Traveling dot shown statically at node 2 (mid-pipeline). No glow.

---

## MDX Insertion Points

### `website/content/docs/quality/benchmark.mdx`

```
# DevMemBench

[opening paragraph]

<DocsBenchmarkScoreboard />      ← INSERT HERE (after opening para, before ## What the score means)

## What the score means for you

[table]

## Known limitation: cross-session synthesis

[prose]

## Benchmark dataset

<DocsBenchmarkDataset />         ← INSERT HERE (after ## Benchmark dataset heading, before bullet list)

[bullet list]

## Methodology

<DocsBenchmarkPipeline />        ← INSERT HERE (after ## Methodology heading, before numbered list)

[numbered list]

## Running the benchmark yourself

[content]
```

### `website/content/docs/quality/testing.mdx`

```
# Test Suite

[opening paragraph]

<DocsTestTiers />                ← INSERT HERE (after opening para, before ## What is verified)

## What is verified

[table]

## Latest results

<DocsE2eScenarioMap />           ← INSERT HERE (after ## Latest results heading, before code block)

[code block]

[scenario 09 note]

---

## For contributors

### Test tiers

[table]

### Running unit and integration tests

[code block]

### Running E2E tests

[code blocks]

### E2E prerequisites

[numbered list + JSON code block]

<DocsTestIsolation />            ← INSERT HERE (after the 4-item list + JSON block, before ### Full E2E scenario reference)

### Full E2E scenario reference

[content]
```

---

## Implementation Phases

### PHASE 1: Design Doc
**Goal**: Produce this document  
**Status**: DONE

**Deliverables:**
- [x] `.github/designs/007-quality-testing-svg-illustrations.md` — this document

---

### PHASE 2: SVG Components
**Goal**: All 6 animated TSX SVG files created in `website/components/svg/docs/`  
**Status**: TODO — awaiting Gemini

**Deliverables:**
- [ ] `website/components/svg/docs/docs-benchmark-scoreboard.tsx`
- [ ] `website/components/svg/docs/docs-benchmark-pipeline.tsx`
- [ ] `website/components/svg/docs/docs-benchmark-dataset.tsx`
- [ ] `website/components/svg/docs/docs-test-tiers.tsx`
- [ ] `website/components/svg/docs/docs-e2e-scenario-map.tsx`
- [ ] `website/components/svg/docs/docs-test-isolation.tsx`

**Success Criteria:**
- Each file exports a named function matching the Export column exactly
- All 6 Technical Constraints satisfied
- All animations gated behind `@media (prefers-reduced-motion: no-preference)`
- Reduced-motion fallback per spec
- Zero TypeScript errors (`bun run typecheck` in `website/`)

**Implementation Notes:**
- Read `website/components/svg/docs/docs-extraction-pipeline.tsx` first — closest pattern to the vertical/pipeline layouts here
- Read `website/components/svg/docs/docs-provider-speed.tsx` — closest pattern to the card layouts
- Copy the `<defs>` skeleton structure from those files
- Filter IDs: use unique suffixes per this document (`-bs`, `-bp`, `-bd`, `-tt`, `-esm`, `-ti`)
- Do NOT use `style={{}}` JSX attribute with dynamic values — all values go in the `<style>` tag

---

### PHASE 3: MDX Registration + Integration
**Goal**: All 6 components registered in `mdx-components.tsx` and inserted into the two MDX pages  
**Status**: TODO — awaiting Gemini

**Deliverables:**
- [ ] `website/mdx-components.tsx` — 6 new imports + 6 new entries in return map
- [ ] `website/content/docs/quality/benchmark.mdx` — 3 SVG tags inserted at positions above
- [ ] `website/content/docs/quality/testing.mdx` — 3 SVG tags inserted at positions above

**Success Criteria:**
- `useMDXComponents` returns all 6 new components by exact export name
- No per-file import statements in any MDX file
- Both quality pages render without error

---

### PHASE 4: Validation
**Goal**: Typecheck and build pass  
**Status**: TODO

**Deliverables:**
- [ ] `bun run typecheck` exits 0 in `website/`
- [ ] `bun run build` exits 0 in `website/`

---

## Edge Cases

### High — must resolve before implementation

| Edge Case | Decision | Approach |
|---|---|---|
| `scaleX` transform origin for bar chart (SVG 1) | CSS `transform-origin` requires `transform-box: fill-box` on SVG elements in some browsers | Use `transform-box: fill-box; transform-origin: left center` on each fill rect, then `scaleX(0)` → `scaleX(1)` |
| `stroke-dashoffset` on circle (SVG 1) | Must set `stroke-dasharray` equal to circumference on the circle element itself | `stroke-dasharray="471"; stroke-dashoffset` animated from 471 to 26 |
| Multiple SVGs on same page (benchmark.mdx has 3, testing.mdx has 3) | Filter ID collisions would break glow effects | Unique suffixes enforced: `-bs`, `-bp`, `-bd`, `-tt`, `-esm`, `-ti` |
| Traveling pulse dot (SVG 6) | CSS `translate` animation on SVG elements needs `transform-box: fill-box` | Use absolute SVG `x`/`y` values in `@keyframes` via `translate()` transform |

### Medium — acceptable to defer to manual QA

| Edge Case | Proposed Approach | Deferral Risk |
|---|---|---|
| Bar labels on narrow screens | `viewBox` auto-scales; all text ≤12px | Low: category names may truncate but remain readable |
| 12-card grid on mobile (SVG 5) | 4-col grid at 600px viewBox scales proportionally | Low: cards are small but readable; docs users are primarily desktop |

---

## Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| 6 SVGs across 2 pages | 3 per page | Each page has distinct structural moments that benefit from visual aid: scoreboard + pipeline + dataset for benchmark; tiers + scenario map + isolation for testing |
| Scoreboard bar chart orientation | Horizontal bars (not donut, not vertical bars) | Horizontal bars let category names sit flush-left as natural labels without rotation; direct comparison to a max of 100% is visually immediate |
| Pipeline layout | Horizontal (not vertical) | 5 nodes with short labels fit cleanly in a 640×100 horizontal strip; vertical would waste vertical space on an already text-heavy page |
| Dataset SVG | Two cards side by side | Conveys "two projects = broader coverage"; VS separator adds visual interest without overcrowding |
| Test tiers layout | Horizontal panels (not pyramid) | Pyramid metaphor implies hierarchy of importance, which is wrong — all tiers are used. Horizontal panels with a fast→slow axis accurately represents the tradeoff |
| E2E scenario map | Grid of badges (not a list) | A 4×3 grid fits all 12 scenarios in a compact visual; the PASS/WARN color coding delivers the quality story instantly without reading 12 lines |
| Isolation SVG | Pipeline with traveling dot | Shows lifecycle rather than static state; the traveling dot conveys "this happens over time" and the bounding box conveys isolation |

---

## Metrics

| Metric | Baseline | Target |
|---|---|---|
| SVG components created | 0 | 6 |
| Quality pages with illustrations | 0 of 2 | 2 of 2 |
| TypeScript errors | 0 | 0 |
| Build errors | 0 | 0 |
| Reduced-motion handled | N/A | 6 of 6 |
| Accessibility (`<title>` + `aria-label` + `role="img"`) | N/A | 6 of 6 |

---

## Rollback Plan

All changes are purely additive. If an SVG fails to render, fumadocs renders nothing in its place — page prose remains fully intact. To disable a specific SVG without reverting the whole commit, remove the `<DocsXxx />` tag from the MDX file.

**Recovery steps:**
1. Run `bun run typecheck` and `bun run build` in `website/` to get the exact error
2. TS error → fix in the specific component file, new commit
3. MDX render error → verify the key in `mdx-components.tsx` exactly matches the JSX tag name
4. Full rollback: `git revert <commit-hash>`
