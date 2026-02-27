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
├── plugin/          # The OpenCode plugin (TypeScript) — published to npm as `codexfi`
├── website/         # codexfi.com — Next.js + Fumadocs documentation site
├── benchmark/       # Retrieval quality benchmarks
├── testing/         # End-to-end and integration tests
└── .github/
    ├── designs/     # Design documents for features and architecture
    └── workflows/   # CI/CD pipelines
```

The core deliverable is the `plugin/` package. The `website/` directory is the documentation site at [codexfi.com](https://codexfi.com).

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) — used throughout the project (`npm` and `yarn` are not supported)
- [Bun](https://bun.sh/) — used for plugin builds and CLI tooling
- [OpenCode](https://opencode.ai/) — required to run the plugin end-to-end
- A [Voyage AI](https://www.voyageai.com/) API key (`VOYAGE_API_KEY`) for embeddings

### Plugin

```bash
cd plugin
pnpm install
pnpm build          # compiles plugin + CLI
pnpm typecheck      # TypeScript strict mode check
```

To test the plugin in a real OpenCode session, install it into an OpenCode project:

```bash
bunx codexfi install
```

### Website

```bash
cd website
pnpm install
pnpm dev            # dev server at http://localhost:3000
pnpm build          # production build — must produce zero warnings/errors
```

## Making Changes

1. **Fork** the repository and create a branch from `main`.
2. Branch names should follow the convention: `type/short-description`
   - `feat/my-new-feature`
   - `fix/retrieval-threshold`
   - `chore/update-deps`
   - `docs/contributing-guide`
3. **Write code** — keep changes focused. One logical change per PR.
4. **Run checks** before opening a PR:
   - Plugin: `pnpm typecheck && pnpm build`
   - Website: `pnpm build` (zero warnings)
5. If your change touches retrieval, memory extraction, or embeddings, run the benchmark suite and include results in the PR description.

## Submitting a Pull Request

1. Open a PR against `main`.
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
