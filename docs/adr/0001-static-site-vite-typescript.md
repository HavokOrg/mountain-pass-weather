# 1. Static site with Vite + TypeScript, no framework

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

The app is hosted on GitHub Pages, which only serves static files. We want a small attack surface, few dependencies to keep patched, and type safety when parsing messy third-party data.

## Decision

- Build with **Vite + TypeScript**, with **no UI framework** and **no runtime dependencies**. Everything shipped to the browser is our own code.
- Dev-only tools: Vite, TypeScript, Vitest, ESLint. Dependabot keeps them updated.
- TypeScript is pinned to 6.x because typescript-eslint doesn't support TypeScript 7 yet. Dependabot ignores TypeScript major updates until it does.
- `minimatch` is forced to `^11.0.1` through npm `overrides` to fix a moderate advisory (GHSA-g3hv-75wg-m249). It's only used by the lint toolchain. Remove the override once ESLint and typescript-eslint depend on a fixed version.
- GitHub Actions builds and deploys to Pages. No build output is committed.

## Consequences

- We hand-write a small DOM helper (`src/ui/dom.ts`) instead of using a framework.
- No third-party code runs in visitors' browsers, so there's no runtime supply-chain risk.
