# Contributing to codexfi

Thank you for your interest in contributing to codexfi. This document covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Issue Labels](#issue-labels)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold these standards.

## Project Structure

```
codexfi/
├── plugin/          # The Claude Code plugin (TypeScript) — installed from this repo's marketplace; CLI on npm as `codexfi`
├── website/         # codexfi.com — Next.js + Fumadocs documentation site
├── benchmark/       # Retrieval quality benchmarks
├── testing/         # Unit, integration and stress tests
└── .github/
    ├── designs/     # Design documents for features and architecture
    └── workflows/   # CI/CD pipelines
```

The core deliverable is the `plugin/` package. The `website/` directory is the documentation site at [codexfi.com](https://codexfi.com).

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Bun](https://bun.sh/) — used for `plugin/` builds and CLI tooling
- [pnpm](https://pnpm.io/) — used for `website/` (`npm` and `yarn` are not supported)
- [Claude Code](https://code.claude.com) ≥ 2.1 — to run the plugin end-to-end. No API keys are needed: background extraction runs through your Claude Code login and embeddings run on-device.
  - **Benchmark** (`benchmark/`): optional `benchmark/.env.local` (copy from `benchmark/.env.example`) if you want to use the Anthropic API instead of the Claude Code CLI for answering/judging.

### Plugin

```bash
cd plugin
npm install         # npm lockfile — Claude Code installs plugin deps with it
npm run typecheck   # TypeScript strict mode check
npm run build       # → dist/codexfi.js (committed: the plugin installs from git)
```

To run your **local build** in Claude Code for one session, without installing anything:

```bash
claude --plugin-dir ./plugin
```

Or register your checkout as a marketplace and install it (persists across sessions; edits apply on the next session start or `/reload-plugins`):

```bash
claude plugin marketplace add /absolute/path/to/codexfi
claude plugin install codexfi@codexfi
```

Use `CODEXFI_DATA_DIR=/tmp/codexfi-dev` to keep a development store separate from your real `~/.codexfi`. Always rebuild and commit `plugin/dist/codexfi.js` with source changes — CI fails if the committed bundle is stale.

### Website

```bash
cd website
pnpm install
pnpm dev            # dev server at http://localhost:3000
pnpm build          # production build — must produce zero warnings/errors
```

## Making Changes

> **Note:** This repository is currently open to collaborators only. If you'd like to contribute, open an issue describing what you want to work on and a maintainer will add you as a collaborator.

1. Create a branch from `main` directly on this repository (no fork needed).
2. Branch names should follow the convention: `type/short-description`
   - `feat/my-new-feature`
   - `fix/retrieval-threshold`
   - `chore/update-deps`
   - `docs/contributing-guide`
3. **Write code** — keep changes focused. One logical change per PR.
4. **Set your PR title correctly.** PRs are merged with squash — the PR title becomes the single commit that release-please reads to decide whether to publish a new version. Use [Conventional Commits](https://www.conventionalcommits.org/):

   | PR title prefix | Effect |
   |---|---|
   | `fix(plugin): …` | patch release (0.x.y → 0.x.y+1) |
   | `feat(plugin): …` | minor release (0.x → 0.x+1) |
   | `chore:` / `docs:` / `ci:` | **no release** — release-please ignores these |

   If your PR fixes a bug or adds a feature in `plugin/` but the title uses `chore:` or `docs:`, no release will be triggered.
5. **Run checks** before opening a PR:
   - Plugin: `bun run typecheck && bun run build`
   - Website: `pnpm build` (zero warnings)
5. If your change touches retrieval, memory extraction, or embeddings, run the benchmark suite and include results in the PR description.

## Submitting a Pull Request

1. Open a PR against `main` from your branch.
2. Use the PR template — fill in every section.
3. Link the issue your PR resolves using `Closes #N`.
4. Add the appropriate label(s).
5. Assign the PR to a maintainer for review.

PRs that touch the `plugin/` package require:
- All CI checks passing (typecheck, build, CodeQL)
- A passing benchmark run if retrieval or extraction logic changed

PRs that touch `website/` require:
- `pnpm build` passing with zero errors or warnings
- Vercel preview deployment reviewed

## Issue Labels

| Label | Meaning |
|-------|---------|
| `bug` | Something is broken |
| `enhancement` | New feature or improvement |
| `memory-quality` | Retrieval failures, wrong answers, benchmark regressions |
| `chore` | Maintenance, dependency updates, non-functional changes |
| `documentation` | Docs-only changes |
| `ci` | CI/CD pipeline changes |

## Questions?

Open a [GitHub Discussion](https://github.com/prosperitypirate/codexfi/discussions) or file an issue using one of the templates.
