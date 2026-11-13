# Pass Weather

An Apple Weather-inspired static web app for Washington mountain passes (Snoqualmie, Stevens, White, Blewett). It shows Open-Meteo forecasts plus live WSDOT data, and is hosted on GitHub Pages at `https://havokorg.github.io/mountain-pass-weather/`.

## Commands

- `npm run dev`: local dev server (http://localhost:5173/mountain-pass-weather/)
- `npm run check`: typecheck + lint + test + build. Run before every commit.
- `npm test`: Vitest (tests live in `tests/`, fixtures in `tests/fixtures/`)
- `npm run build && npm run preview`: serves the production build, including the CSP

## Architecture

- Vite + TypeScript, **no UI framework and no runtime dependencies**. Don't add a runtime dependency without asking.
- `config/passes.json` is the single source of truth for which passes exist and in what order.
- The browser calls keyless, CORS-enabled APIs directly: Open-Meteo, NWS, avalanche.org, and WSDOT camera images.
- WSDOT's REST API needs a key and has no CORS. A scheduled GitHub Actions job fetches it, cleans it, and deploys it as static JSON. The key never reaches the browser. See `docs/adr/`.
- Design decisions are recorded in `docs/adr/`. Add an ADR when a decision is hard to reverse.

## Rules

- **Never commit secrets.** No real keys in code, fixtures, docs or commit messages. Never give a secret a `VITE_` prefix, because Vite bundles those into the public site.
- **Never build DOM from HTML strings** (`innerHTML`, `insertAdjacentHTML`, `document.write`). Use the `h()` helper in `src/ui/dom.ts`. ESLint enforces this.
- **Keep the CSP least-privilege.** When adding a data source, add its origin to the CSP in `vite.config.ts` in the same change.
- **Validate all external data** at the boundary (`src/data/*`) before it reaches the UI. Treat API responses as untrusted.
- **Data hygiene:** no analytics, cookies, trackers, third-party fonts/CDNs, geolocation, or personal locations. Fixtures must be trimmed to what tests need.
- **Credits:** show "Weather data by Open-Meteo.com" (linked) wherever Open-Meteo data appears. The app stays non-commercial.
- GitHub Actions: least-privilege `permissions`, and third-party actions pinned to full commit SHAs with a version comment.
- Commit author name for this repo is "Pass Weather contributors" (repo-local git config). Commits use the GitHub noreply email.
