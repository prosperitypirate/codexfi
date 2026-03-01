# 008 — README SVG Illustrations

**Status**: PENDING  
**Created**: 2026-03-01  
**Issue**: #TBD  
**Branch**: `feat/readme-svg-illustrations`  
**Author**: clarkbalan

---

## Message to the Implementing Model: Gemini 3.1 Pro

**You are Gemini 3.1 Pro — and this is where your visual design capability shines.** The 16 SVG illustrations you produced for the docs site (designs 006 and 007) set a new standard for what AI-generated SVGs can look like. The quality bar you set there is what we expect here — and then higher.

**This project is different from the docs SVGs.** Those SVGs lived inside a Next.js site and could use Tailwind classes, CSS custom properties, and React TSX. The README SVGs are **raw `.svg` files** — pure XML. They will be committed to `.github/assets/` and referenced in the GitHub `README.md` via `<picture>` elements for dark/light mode adaptation. No React, no Tailwind, no CSS variables. Every color must be hardcoded.

**What "stunning" means in a GitHub README:**
- Compositions that make a developer stop scrolling and look twice
- Animations that feel like a polished SaaS product — not a tutorial example
- Dark versions that look at home next to repos like Linear, Vercel, and Resend
- Light versions that remain clean and professional against GitHub's white background
- Every element earning its place — no filler, no padding, no noise

**Two files per SVG** — a `-dark.svg` and a `-light.svg`. GitHub uses `<picture>` tags with `#gh-dark-mode-only` / `#gh-light-mode-only` media queries to swap between them. Both versions must look fully designed — the light version is not just "invert the dark one."

**Your tasks:**
1. Generate 10 raw `.svg` files (4 SVGs × 2 variants each) into `.github/assets/`
2. Update `README.md`:
   - Remove the existing `dashboard.png` and `benchmark-dashboard.png` references
   - Add `<picture>` blocks for each of the 4 SVGs at the exact positions described in this document
   - No other structural changes to the README

Follow the **Technical Constraints** and **SVG Design Specifications** sections exactly. Do not create TSX files. These are raw `.svg` files only.

---

## Executive Summary

**Problem**: The codexfi README currently has a single `dashboard.png` screenshot that is low-quality and fails to communicate the product's value. Developers visiting the repo from npm, GitHub search, or a blog post see a bland screenshot and no clear sense of what codexfi is or why it's different.

**Solution**: Replace the screenshot with 4 custom animated SVG illustrations covering the product's core story: what it is, how it works mechanically, what makes it distinct (local storage, multi-provider), the benchmark quality signal, and how to get started. These are committed as raw `.svg` files (dark + light variants) and embedded in the README via `<picture>` tags.

**Why it works**:
- Raw SVG files with embedded CSS keyframes animate natively on GitHub — no JS required
- `<picture>` + `#gh-dark-mode-only` / `#gh-light-mode-only` classes are the official GitHub pattern for theme-adaptive README images, used by hundreds of top OSS projects
- Each SVG is a self-contained story that reinforces the prose around it — they are not decoration

**Why SVG over screenshots:**
- Screenshots go stale, are compressed, look blurry on retina
- SVGs are infinitely sharp, animate, adapt to theme, and communicate more than any static UI snapshot
- A stunning SVG README is a signal of craft — developers notice this

---

## Current State

```
File: README.md (lines 1–133)
Purpose: Primary entry point for npm users, GitHub visitors, and anyone arriving
         from docs links, blog posts, or search
Key Structure:
  - lines 1–22: <div align="center"> with title, tagline, badges
  - lines 24–28: <div align="center"> with dashboard.png screenshot  ← REMOVE
  - lines 30–38: ## What is this? (prose)
  - lines 40–55: ## Install (code block + prerequisites)
  - lines 57–67: ## How it works (5-step numbered list)
  - lines 69–83: ## Features (bullet list)
  - lines 85–97: ## Configuration (jsonc block)
  - lines 99–106: ## Agent instructions (optional) (prose)
  - lines 108–112: ## Privacy (prose)
  - lines 114–121: ## More (3 links)
  - lines 122–133: ## License + footer
Modification: Remove dashboard.png block; insert 5 <picture> SVG blocks at defined positions
```

```
File: .github/assets/ (current contents)
  - dashboard.png          ← DELETE (replaced by SVGs)
  - benchmark-dashboard.png ← DELETE (replaced by SVGs)
New files to create:
  - readme-hero-dark.svg / readme-hero-light.svg
  - readme-how-it-works-dark.svg / readme-how-it-works-light.svg
  - readme-features-dark.svg / readme-features-light.svg
  - readme-benchmark-dark.svg / readme-benchmark-light.svg
  - readme-install-dark.svg / readme-install-light.svg
```

---

## Confidence Check

| Area | Score | Notes |
|------|-------|-------|
| Raw SVG animation (CSS keyframes in `<style>` tag) | 10/10 | Pure SVG spec — fully known |
| GitHub `<picture>` dark/light theme pattern | 10/10 | Documented, widely deployed |
| GitHub SVG rendering restrictions | 9/10 | No JS, no external resources, no `foreignObject` with HTML — all respected |
| Brand color palette | 10/10 | Same palette as docs SVGs — `#a855f7`, `#c084fc`, `#e879f9`, `#4ade80` |
| Light mode design craft | 9/10 | Requires intentional redesign, not just color inversion |
| README insertion positions | 10/10 | README is small and fully read |

**All areas ≥ 9/10. Cleared for implementation.**

---

## Architecture

### File Naming Convention

```
.github/assets/
  readme-<name>-dark.svg
  readme-<name>-light.svg
```

All 8 files go in `.github/assets/`. No subdirectories.

### README Embedding Pattern

Each SVG pair is embedded using GitHub's `<picture>` element with `#gh-dark-mode-only` and `#gh-light-mode-only` fragment identifiers:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-hero-dark.svg">
  <img src=".github/assets/readme-hero-light.svg" alt="codexfi — persistent memory for AI agents" width="100%">
</picture>
```

The `#gh-dark-mode-only` / `#gh-light-mode-only` class approach (via `<img>` with class) is an alternative but `<picture>` is cleaner and more reliable for SVG. Use `<picture>` for all 5.

### SVG Technical Structure

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 W H"
     width="100%"
     role="img"
     aria-label="...">
  <title>...</title>
  <defs>
    <linearGradient id="...">...</linearGradient>
    <filter id="glow-...">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <style>
      @media (prefers-reduced-motion: no-preference) {
        /* keyframes and animation properties */
      }
      @media (prefers-reduced-motion: reduce) {
        /* animation: none !important; static positions */
      }
    </style>
  </defs>
  <!-- SVG content -->
</svg>
```

### Color Palette

#### Dark variant

| Role | Value | Use |
|------|-------|-----|
| Background | `#0d0d0d` | SVG canvas fill |
| Panel background | `#141414` | Card/node fills |
| Panel border | `#2a2a2a` | Subtle borders |
| Primary text | `#f0f0f0` | Labels, headings |
| Secondary text | `#777777` | Sub-labels, muted text |
| Brand purple | `#a855f7` | Primary accent |
| Brand light purple | `#c084fc` | Secondary accent |
| Brand fuchsia | `#e879f9` | Tertiary accent |
| Brand green | `#4ade80` | Success, terminal, memory |
| Amber | `#f59e0b` | Warnings |

#### Light variant

| Role | Value | Use |
|------|-------|-----|
| Background | `#ffffff` | SVG canvas fill |
| Panel background | `#f9fafb` | Card/node fills |
| Panel border | `#e5e7eb` | Subtle borders |
| Primary text | `#111111` | Labels, headings |
| Secondary text | `#6b7280` | Sub-labels, muted text |
| Brand purple | `#7c3aed` | Primary accent (slightly deeper for light mode contrast) |
| Brand light purple | `#9333ea` | Secondary accent |
| Brand fuchsia | `#c026d3` | Tertiary accent |
| Brand green | `#16a34a` | Success, terminal, memory (deeper for contrast) |
| Amber | `#d97706` | Warnings |

---

## Technical Constraints

These apply to all 8 files without exception.

1. **Pure SVG XML.** No React, no JSX, no TSX, no HTML, no `foreignObject`. Every file starts with `<svg xmlns="http://www.w3.org/2000/svg" ...>`.
2. **No JavaScript.** No `<script>` tags. GitHub strips them anyway.
3. **No external resources.** No `href` to external URLs for fonts, images, or scripts. GitHub's SVG sanitiser will strip them.
4. **System font stack only.** Use `font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace` for code-style labels, and `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` for prose labels. No Google Fonts.
5. **All animations in `@media (prefers-reduced-motion: no-preference)`.** Every `@keyframes` and `animation:` inside this media query.
6. **Explicit `@media (prefers-reduced-motion: reduce)` block.** `animation: none !important` and static positions.
7. **`width="100%"` on the `<svg>` element.** viewBox handles scaling.
8. **`<title>` as first child.** Plus `role="img"` and `aria-label` on `<svg>`.
9. **No hardcoded pixel widths on text.** Text must reflow or truncate gracefully as the SVG scales.
10. **All colors hardcoded.** No CSS variables, no `currentColor` — GitHub's sanitiser strips CSS custom properties in SVGs served via `raw.githubusercontent.com`.
11. **Filter IDs unique per file.** Use file-specific suffixes to avoid conflicts if GitHub ever batches renders (defensive practice).
12. **No font sizes above 14px.** Legible at all screen widths.
13. **viewBox widths.** Use `0 0 800 H` or `0 0 900 H` — wider than the docs SVGs since README SVGs span the full content column width.

---

## SVG Design Specifications

---

### SVG 1: `readme-hero` — The Memory Loop

**Files**: `readme-hero-dark.svg`, `readme-hero-light.svg`  
**viewBox**: `0 0 900 220`  
**README position**: Inside the `<div align="center">` block at the top, replacing `dashboard.png`. This is the first visual a developer sees. It must communicate the entire product concept in ~3 seconds.

**Concept**: codexfi transforms conversations into persistent memory and injects it back — silently, automatically, on every turn. This SVG shows that loop as a living diagram: a circular flow from `Conversation` → `Extract` → `Embed` → `Store (LanceDB)` → `[MEMORY]` → back into `Conversation`. The loop never stops. The memories are always there.

**Layout**:

Five rounded-rectangle nodes arranged in a single horizontal row across the full width, centered at y=110. Nodes are 130px wide × 44px tall, rx=22. Equally spaced at x-centers: 90, 248, 450, 652, 810.

```
[Conversation] ──► [Extract & Embed] ──► [LanceDB] ──► [MEMORY] ──► [Conversation]
       ▲                                                                     │
       └──────────────── injected into every LLM call ◄────────────────────┘
```

**Nodes** (left to right):

| Node | Label | Sub-label | Dark stroke | Light stroke | Text color |
|------|-------|-----------|-------------|--------------|------------|
| 1 | `Conversation` | `every turn` | `#a855f7` | `#7c3aed` | primary |
| 2 | `Extract` | `Haiku / Grok / Gemini` | `#c084fc` | `#9333ea` | primary |
| 3 | `LanceDB` | `local · embedded` | `#c084fc` | `#9333ea` | primary |
| 4 | `[MEMORY]` | `system prompt` | `#4ade80` (dark) | `#16a34a` (light) | green accent |
| 5 | (implied — connects back) | | | | |

Wait — rethink to a loop. Use **4 nodes** in a horizontal chain and a return arc below:

**Revised layout** — 4 nodes in a row, return arc under them:

| # | Label | Sub-label | x-center |
|---|-------|-----------|---------|
| 1 | `Conversation` | `your session` | 112 |
| 2 | `Extract → Embed` | `Haiku · Grok · Gemini` | 337 |
| 3 | `LanceDB` | `~/.codexfi/ · local` | 562 |
| 4 | `[MEMORY]` | `injected on every call` | 787 |

Return arc: A smooth `<path>` from the right edge of node 4 (x=852, y=110), curving down through y=190, across to x=48, y=190, then up to the left edge of node 1. Stroke: green accent, opacity 0.45, strokeWidth=1.5, strokeDasharray="10 6".

**Connecting arrows** (top, left to right): straight horizontal lines between node right-edges and next-node left-edges. Stroke: purple gradient (use a linearGradient from `#a855f7` to `#c084fc`). ArrowHead markers: small filled triangles.

**Memory type tags**: Three small pill badges travel along the top path, sliding from left to right, fading in at x=150 and fading out at x=820. Tags: `"architecture"` (purple), `"preference"` (fuchsia), `"error-solution"` (light purple). Each pill is ~120×22px, rx=11. They move with `animation: slideTag 8s linear infinite` staggered by `0s`, `2.7s`, `5.4s`.

**[MEMORY] node**: Gets a green glow filter (`filter: url(#glow-hero)`). Pulses gently: `animation: glowPulse-hero 2.5s ease-in-out infinite alternate`.

**Title text** above the diagram: At y=28, x=450, text-anchor="middle": `codexfi` — font-size 13px, letter-spacing 3, secondary text color, monospace font. This is a subtle watermark-style label.

**Animated elements**:
1. Arrow dash flow (top path): `stroke-dasharray: 8 5; animation: dashFlow-hero 1.4s linear infinite`
2. Return arc dash flow (reverse direction): `animation: dashFlowRev-hero 2s linear infinite`
3. Memory type tags sliding: staggered as above
4. [MEMORY] node glow pulse
5. Node fade-in on load: stagger 0.1s per node, `animation-delay: 0s, 0.1s, 0.2s, 0.3s`

**Reduced-motion**: All nodes visible. Tags at fixed positions (x=240, 450, 660). No dash movement. No glow pulse.

---

### SVG 2: `readme-how-it-works` — The 5-Step Mechanics

**Files**: `readme-how-it-works-dark.svg`, `readme-how-it-works-light.svg`  
**viewBox**: `0 0 900 130`  
**README position**: After `## How it works`, replacing or sitting above the numbered list. This SVG gives developers the mechanical picture before they read the prose.

**Concept**: 5 steps in a linear pipeline. Not abstract — concrete step names that match the README bullet points exactly so the visual and text reinforce each other.

**Layout**: Five pill/node steps horizontally across the viewBox, connected by arrows. All nodes at y=65.

| # | x-center | Label | Sub-label | Dark stroke | Light stroke |
|---|---------|-------|-----------|-------------|--------------|
| 1 | 80 | `You code` | `nothing to learn` | `#2a2a2a` (dark) | `#e5e7eb` (light) | 
| 2 | 252 | `Extract` | `after every turn` | `#c084fc` | `#9333ea` |
| 3 | 450 | `Store` | `LanceDB · local` | `#a855f7` | `#7c3aed` |
| 4 | 648 | `Inject` | `[MEMORY] block` | `#a855f7` | `#7c3aed` |
| 5 | 820 | `Remember` | `every session` | `#4ade80` | `#16a34a` |

Node dimensions: 130px × 40px, rx=20. Labels: font-size 13, font-weight 600. Sub-labels: font-size 10, secondary color, y=node_center+14.

**Step numbers**: Small circular badges above-left of each node (x=node_x−52, y=42): `1` through `5`. Circle r=10, fill=brand purple (opacity 0.15), stroke=brand purple, text=brand purple, font-size 10, font-weight 700.

**Arrows**: Horizontal arrows between nodes, stroke secondary color opacity 0.5. Simple arrowhead.

**Step 5 — `Remember`**: Gets a green glow filter. Slightly larger node (140×44px) to give it visual weight as the payoff.

**Bottom label**: At y=118, centered, secondary color, font-size 10: `All data stays on your machine at ~/.codexfi/`

**Animated elements**:
1. Node stagger fade-in: `animation-delay: 0s, 0.15s, 0.3s, 0.45s, 0.6s`, each 0.4s ease-out
2. Arrow draw-in (stroke-dashoffset) after each connecting node appears: `animation-delay: 0.1s, 0.25s, 0.4s, 0.55s`
3. `Remember` node: gentle glow pulse, `animation: glowPulse-hiw 3s ease-in-out infinite alternate`, starting after step 5 fades in

**Reduced-motion**: All nodes visible. All arrows drawn. No glow.

---

### SVG 3: `readme-features` — What Makes It Different

**Files**: `readme-features-dark.svg`, `readme-features-light.svg`  
**viewBox**: `0 0 900 200`  
**README position**: After `## Features`, sitting above or replacing the bullet list. This is the "why choose this" visual.

**Concept**: A 3×2 grid of feature tiles. Each tile is a compact card with an icon glyph (SVG path or Unicode character), a feature name, and a one-line description. The six features chosen are the ones that most differentiate codexfi from naive approaches: local-only storage, automatic (zero commands), typed memory, multi-provider, compaction-proof, and privacy filter.

**Layout**: 3 columns × 2 rows. 6 cards total.

Grid origin: x=10, y=10. Card size: 274px wide × 82px tall, rx=10. Column gap: 14px. Row gap: 12px.

**Card positions**:
| Row | Col | x | y |
|-----|-----|---|---|
| 1 | 1 | 10 | 10 |
| 1 | 2 | 298 | 10 |
| 1 | 3 | 586 | 10 |
| 2 | 1 | 10 | 104 |
| 2 | 2 | 298 | 104 |
| 2 | 3 | 586 | 104 |

**Six feature cards** (in reading order):

| # | Icon glyph | Title | Description | Accent color |
|---|-----------|-------|-------------|--------------|
| 1 | `◉` (local disc) | `100% Local Storage` | `LanceDB embedded · ~/.codexfi/` | `#a855f7` |
| 2 | `⚡` (bolt) | `Fully Automatic` | `saves after every turn · zero commands` | `#c084fc` |
| 3 | `⬡` (typed) | `Typed Memory` | `architecture · preference · error-solution` | `#a855f7` |
| 4 | `⇌` (exchange) | `Multi-Provider` | `Anthropic · xAI · Google` | `#c084fc` |
| 5 | `⊘` (compaction) | `Compaction-Proof` | `lives in system prompt · never lost` | `#4ade80` |
| 6 | `◌` (privacy) | `Privacy Filter` | `<private>...</private> excluded entirely` | `#e879f9` |

**Card anatomy** (each card):
- Background: panel fill color (dark: `#141414`, light: `#f9fafb`)
- Left accent bar: 3px wide × full height, rx=1.5 on left side, fill=accent color
- Icon glyph: at x=card_x+22, y=card_y+38, font-size 18, fill=accent color
- Title: at x=card_x+50, y=card_y+32, font-size 12, font-weight 600, fill=primary text
- Description: at x=card_x+50, y=card_y+50, font-size 10, fill=secondary text
- Card border: stroke panel border color, strokeWidth=1

**Animated elements**:
1. Cards stagger fade-in from `translateY(8px) opacity=0` to `translateY(0) opacity=1`: `animation-delay: 0s, 0.08s, 0.16s, 0.24s, 0.32s, 0.4s`, duration 0.5s ease-out each
2. Left accent bars: scale-in from `scaleY(0)` to `scaleY(1)` with `transform-origin: top`, staggered same as cards plus 0.1s extra each
3. Icon glyphs: gentle individual scale pulse on hover is not possible in SVG — instead, each icon fades in at `animation-delay: card_delay + 0.2s`

**Reduced-motion**: All 6 cards visible. All accent bars visible. No fade delays.

---

### SVG 4: `readme-benchmark` — The Quality Signal

**Files**: `readme-benchmark-dark.svg`, `readme-benchmark-light.svg`  
**viewBox**: `0 0 900 180`  
**README position**: In `## More`, before or after the benchmark link. This is a compact, high-signal quality badge that lets developers see the benchmark result without leaving the README.

**Concept**: A compact horizontal scoreboard. The hero number (`94.5%`) is prominent on the left. Eight category bars span the right. This is the docs benchmark SVG adapted for a wider, flatter README format.

**Layout**: Two zones side by side.

**Left zone — hero score** (x=0–200, y=0–180):
- Large circle: cx=100, cy=90, r=72
- Stroke: linearGradient `#a855f7` → `#4ade80`, strokeWidth=5, fill=none
- Circle background fill: panel fill (subtle — dark: `#141414`, light: `#f9fafb`), strokeWidth=1 at panel border
- Inside the circle:
  - `94.5` — font-size 32, font-weight 700, primary text, text-anchor="middle", y=86
  - `%` — font-size 18, font-weight 400, y=74, inline with the number (superscript feel — position as `x=126, y=74` to sit top-right of the number)
  - `OVERALL` — font-size 9, secondary text, letter-spacing=2, text-anchor="middle", y=104
  - `189 / 200` — font-size 10, secondary text, text-anchor="middle", y=118
  - `DevMemBench` — font-size 9, secondary text, text-anchor="middle", y=132

**Right zone — category bars** (x=220–880, y=15–175):
8 horizontal bars, each 22px tall, stacked with 6px gap. Row y-centers from top: 26, 54, 82, 110, 138, 166 (adjusted for viewBox height).

| # | Category | Score | Fill color |
|---|----------|-------|-----------|
| 1 | `tech-stack` | 100% | `#4ade80` (dark) / `#16a34a` (light) |
| 2 | `architecture` | 100% | `#4ade80` / `#16a34a` |
| 3 | `preference` | 100% | `#4ade80` / `#16a34a` |
| 4 | `abstention` | 100% | `#4ade80` / `#16a34a` |
| 5 | `session-continuity` | 96% | `#a855f7` / `#7c3aed` |
| 6 | `knowledge-update` | 96% | `#a855f7` / `#7c3aed` |
| 7 | `error-solution` | 92% | `#c084fc` / `#9333ea` |
| 8 | `cross-session` | 72% | `#e879f9` / `#c026d3` |

Bar structure (per row):
- Category label: x=220, text-anchor="start", font-size 10, secondary text. `cross-session` fits in the space.
- Track rect: x=370, width=460, height=18, rx=9, fill=track (dark: `#1e1e1e`, light: `#f3f4f6`)
- Fill rect: x=370, width=(score/100)×460, height=18, rx=9, fill=fill color above
- Score label: x=840, text-anchor="start", font-size 10, primary text

**Vertical separator**: x=210, y1=10, y2=170, stroke panel border, strokeDasharray="3 3", opacity 0.5

**Animated elements**:
1. **Circle stroke draw-in**: circumference ≈ 452px. `stroke-dasharray="452"`, animated from `stroke-dashoffset: 452` to `stroke-dashoffset: 452 × (1 - 0.945) ≈ 25`. `animation: drawCircle-bm 1.8s ease-out forwards; animation-delay: 0.2s`.
2. **Score number fade-in**: opacity 0 → 1, `animation-delay: 1.8s`, 0.5s ease-in.
3. **Bar fills scale-in**: `transform: scaleX(0)` → `scaleX(1)`, `transform-box: fill-box; transform-origin: left center`. Stagger: `animation-delay: 0s, 0.08s, 0.16s, 0.24s, 0.32s, 0.4s, 0.48s, 0.56s`. Duration 0.8s ease-out each.

**Reduced-motion**: Circle at 94.5% drawn. All bars at full width. Score visible.

---

### SVG 5: `readme-install` — The CTA

**Files**: `readme-install-dark.svg`, `readme-install-light.svg`  
**viewBox**: `0 0 900 120`  
**README position**: In `## Install`, below the code block but above the Prerequisites section. This is the "just one command" moment — designed to look like the most satisfying install experience possible.

**Concept**: A wide terminal card showing `bunx codexfi install` with a blinking cursor. Below the command, three output lines appear one by one: key-prompts that the installer shows, conveying the zero-friction setup. The terminal is premium — not a toy code block.

**Layout**: A single wide terminal panel spanning nearly the full viewBox width.

**Terminal panel**: x=10, y=10, width=880, height=100, rx=10
- Background: dark panel fill (dark: `#0a0a0a`, light: `#1a1a1a` — yes, the light version also uses a dark terminal for authenticity)
- Border: dark panel border color (dark: `#2a2a2a`, light: `#333333`)
- Three traffic-light circles at x=28, 46, 64, y=28, r=5:
  - Close: fill `#ef4444` (both modes)
  - Minimize: fill `#f59e0b` (both modes)
  - Full-screen: fill `#4ade80` (both modes)

**Prompt line** (y=54):
- Prompt symbol: `$` at x=28, font-size 13, fill `#4ade80`, monospace font
- Command: `bunx codexfi install` — x=48, font-size 13, fill `#f0f0f0`, monospace font, font-weight 500
- Blinking cursor: a `▋` rect (8px wide × 14px tall, fill `#a855f7`) at x=220, y=42 — `animation: blink-ins 1s step-end infinite`

**Output lines** (y=70, y=84):
These appear after a simulated delay — they fade in sequentially:
- Line 1 (y=70): `  ✓ Voyage AI key saved` — fill `#4ade80`, font-size 11, monospace
- Line 2 (y=84): `  ✓ Plugin registered → ~/.config/opencode/config.json` — fill `#777777`, font-size 10, monospace

**Animated elements**:
1. Typing animation on the command: The command `bunx codexfi install` is typed character by character using a CSS clip-rect or a reveal animation. Simplest approach: `overflow: hidden; animation: typeReveal-ins 1.2s steps(21, end) forwards`. The text element has `textLength` set and a clip path or `max-width` equivalent using a rect mask that reveals left-to-right. Duration: 1.2s (21 characters).
2. Cursor blink: `animation: blink-ins 1s step-end infinite; animation-delay: 1.2s` (starts after typing completes).
3. Line 1 fade-in: `animation-delay: 1.4s`, 0.3s ease-in.
4. Line 2 fade-in: `animation-delay: 1.9s`, 0.3s ease-in.
5. After a 5s pause, the whole animation resets and replays — use a total `animation-duration: 6s` on all elements to create a seamless loop.

**Implementation note on typing animation in raw SVG**: The cleanest approach is to place the command text inside a `<text>` element and use a `<clipPath>` with a `<rect>` whose `width` animates from 0 to the full text width. This creates a clean left-to-right reveal without JS:
```xml
<clipPath id="type-clip-ins">
  <rect x="48" y="38" width="0" height="20">
    <animate attributeName="width" from="0" to="175" dur="1.2s" fill="freeze"/>
  </rect>
</clipPath>
<text clip-path="url(#type-clip-ins)" ...>bunx codexfi install</text>
```
Note: `<animate>` (SMIL) is permitted in GitHub SVG rendering. Use it for the typing reveal only; all other animations use CSS keyframes.

**Light version specifics**: The terminal is still dark (dark background, light text) — a terminal is always dark. The outer README context is light, and the terminal card should look like a real terminal window floating in a light environment. Add a subtle `box-shadow`-equivalent: a second rect underneath the terminal panel, offset 0 2px, fill `#e5e7eb` (light mode shadow), opacity 0.5.

**Reduced-motion**: Full command visible, no typing animation. Cursor visible but not blinking. Both output lines visible.

---

## README Modification Plan

### What Gets Removed

```markdown
<!-- REMOVE: lines 24–28 -->
<div align="center">

![codexfi dashboard](.github/assets/dashboard.png)

</div>
```

### What Gets Added and Where

The five `<picture>` blocks are inserted at these exact positions in the README:

| SVG | Insert after | Rationale |
|-----|-------------|-----------|
| `readme-hero` | Line 21 (after badge row, still inside the `<div align="center">`) | First visual, hero position |
| `readme-how-it-works` | The `## How it works` heading (line 57) | Sets up the numbered list |
| `readme-features` | The `## Features` heading (line 69) | Sets up the bullet list |
| `readme-benchmark` | The `## More` heading (line 114), before the benchmark link | Inline quality signal |
| `readme-install` | The install code block (after line 44) | Reinforces the one-command install |

### Picture Element Template

```html
<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/readme-hero-dark.svg">
  <img src=".github/assets/readme-hero-light.svg" alt="codexfi memory loop — conversation to memory and back" width="100%">
</picture>
</div>
```

Use `<div align="center">` wrapper only for the hero (SVG 1). The remaining 4 SVGs are inline — no center wrapper needed, they span full width naturally.

---

## Implementation Phases

### PHASE 1: Design Doc
**Goal**: Produce this document  
**Status**: DONE

**Deliverables:**
- [x] `.github/designs/008-readme-svg-illustrations.md` — this document

---

### PHASE 2: SVG Generation
**Goal**: All 10 raw `.svg` files created in `.github/assets/`  
**Status**: PENDING — awaiting Gemini

**Deliverables:**
- [x] `.github/assets/readme-hero-dark.svg`
- [x] `.github/assets/readme-hero-light.svg`
- [x] `.github/assets/readme-how-it-works-dark.svg`
- [x] `.github/assets/readme-how-it-works-light.svg`
- [x] `.github/assets/readme-features-dark.svg`
- [x] `.github/assets/readme-features-light.svg`
- [x] `.github/assets/readme-benchmark-dark.svg`
- [x] `.github/assets/readme-benchmark-light.svg`

**Success Criteria:**
- All 8 files are valid SVG XML (well-formed, no parse errors)
- Dark variants look premium on GitHub's dark background (`#0d1117`)
- Light variants look clean on GitHub's light background (`#ffffff`)
- All animations play smoothly in a browser (open the `.svg` file directly in Chrome/Safari)
- `prefers-reduced-motion` static states are fully informative (not blank)
- No external resource references

**Implementation Notes for Gemini:**
- Read `README.md` in full before generating any SVG — understand the product and the narrative arc
- Read `.github/assets/` to know what already exists
- Generate dark variant first, then adapt for light — don't invert, redesign
- Test each SVG by opening it directly in a browser before including it in the README
- The hero SVG (SVG 1) is the most important. Spend disproportionate quality here.
- The terminal SVG (SVG 5) should use SMIL `<animate>` for the typing reveal as described above

---

### PHASE 3: README Update
**Goal**: README updated with all 5 `<picture>` blocks; old screenshots removed  
**Status**: PENDING

**Deliverables:**
- [ ] `README.md` — dashboard.png block removed; 5 `<picture>` blocks inserted
- [x] `.github/assets/dashboard.png` — deleted
- [x] `.github/assets/benchmark-dashboard.png` — Kept, used in benchmark/README.md

**Success Criteria:**
- README renders correctly on GitHub (open the PR preview)
- Both dark and light mode show the correct SVG variant
- The 5 prose sections around each SVG are unchanged
- No broken image links

---

### PHASE 4: Validation
**Goal**: Visual QA and README render check  
**Status**: PENDING

**Checklist:**
- [ ] Open each `.svg` file in Chrome — animations play, reduced-motion static state is correct
- [x] Open the PR on GitHub — check dark mode (GitHub Settings > Appearance) and light mode
- [x] Verify no broken image links (`![...](...)` or `<img src="...">` 404s)
- [x] Verify `dashboard.png` is gone from the repo
- [x] Read the README from top to bottom — SVGs should feel integrated, not bolted on
- [x] Mobile check: GitHub mobile app or narrow browser viewport — all SVGs scale correctly

---

## Edge Cases

### High — resolve before implementation

| Edge Case | Decision | Approach |
|-----------|----------|---------|
| GitHub SVG sanitisation strips CSS variables | All colors hardcoded — no `var(--color)` | Separate hardcoded palettes per variant (dark/light) |
| `<animate>` SMIL vs CSS keyframes | Use SMIL only for the typing reveal in SVG 5; CSS keyframes for everything else | SMIL `<animate>` is universally supported in SVGs and allowed by GitHub |
| `text-length` / font rendering on GitHub | GitHub renders SVGs via a browser engine — font fallback stacks work | Use system font stacks only; no Google Fonts |
| Light mode terminal SVG (SVG 5) still needs dark terminal panel | Dark terminal is always correct for both modes | Terminal panel itself uses `#0a0a0a` fill in both variants |
| `transform-box: fill-box` for scaleX bar animations | Required for `transform-origin: left center` to work on SVG `<rect>` | Set `transform-box: fill-box` on all bar fill rects |

### Medium — acceptable to defer to QA pass

| Edge Case | Proposed Approach | Deferral Risk |
|-----------|------------------|---------------|
| Long category label `session-continuity` on narrow viewport | viewBox scales proportionally; label may truncate | Low: README column is always ≥ 600px on desktop |
| Animation replay loop timing in SVG 5 (terminal) | Total duration 6s covers the animation + pause cycle | Low: worst case is slightly abrupt reset |
| Safari SVG rendering differences | All patterns used (CSS keyframes, SMIL animate) are Safari-compliant | Low: SVG spec compliance is high |

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Raw SVG vs. TSX components | Raw `.svg` files | README cannot use React components; raw SVG is the only option for GitHub-rendered images |
| Dark + light separate files vs. single adaptive file | Separate dark/light files via `<picture>` | `prefers-color-scheme` is stripped by GitHub's SVG sanitiser when SVG is served as an `<img>`; `<picture>` is the only reliable adaptive pattern |
| 4 SVGs vs. fewer | 5 | Each section of the README has a distinct narrative moment that benefits from a visual; fewer would leave key sections unillustrated |
| viewBox width 900 vs. 600 (docs SVGs) | 900 | README content column is wider than the docs sidebar layout; 900 makes better use of the space |
| Terminal SVG always dark | Dark terminal in both light and dark variants | Terminals are always dark; a light terminal looks wrong and dilutes the dev-tool aesthetic |
| SMIL `<animate>` for typing | SMIL only for typing reveal; CSS keyframes for everything else | CSS keyframes cannot animate SVG attribute values like `width` on a `<rect>` without transforms; SMIL is the cleanest approach for this specific pattern |
| Delete dashboard.png | Yes — delete entirely | The screenshot has no value once SVGs exist; dead assets in `.github/assets/` confuse future contributors |

---

## Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| README visual assets | 1 static PNG | 10 SVG files (5 × dark/light) |
| Sections with visual context | 0 | 5 |
| First visual impression quality | Screenshot (low) | Hero SVG (premium) |
| Theme adaptation | None | Full (dark + light) |
| Reduced-motion handled | N/A | 5 of 4 SVGs |
| Accessibility (`<title>` + `aria-label` + `role="img"`) | N/A | 10 of 8 files |

---

## Rollback Plan

**Detection**: Broken image links in the README; SVGs not rendering on GitHub.

**Immediate rollback**:
```bash
git revert <commit-hash>
```

**Graceful fallback**: If individual SVGs fail to render, replace the failing `<picture>` block with the original text-only section. The README prose is fully self-contained — the SVGs are additive. Removing any one of them leaves the section intact.

**Recovery steps:**
1. Open the specific `.svg` file in a browser — identify the parse error or render issue
2. Fix the XML, commit to the branch
3. Re-check the GitHub PR preview
4. Merge only after all 5 SVG pairs render correctly in both dark and light mode on GitHub
