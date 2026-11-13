# 4. Privacy, data hygiene and maintainer identity

- **Status:** Accepted
- **Date:** 2026-11-12

## Decision

- **No tracking:** no analytics, cookies, trackers, third-party fonts or CDNs. Everything is self-hosted from the repo.
- **No location:** passes come from a fixed list in `config/passes.json`, so the app never asks for geolocation. No home address or personal coordinates are ever committed.
- **No Referer:** `<meta name="referrer" content="no-referrer">` stops the site from telling third parties where requests come from.
- **Strict CSP:** it allows only the origins in use, and is updated whenever a data source is added. GitHub Pages can't set headers, so it ships as a build-time `<meta>` tag.
- **Pseudonymous maintainership:**
  - The repo lives under the `pass-weather` GitHub organization.
  - The LICENSE names "Pass Weather contributors".
  - The repo-local commit author name is "Pass Weather contributors", and commits use the GitHub noreply email.
  - Known limitation: commits and pull requests still link to the maintainer's GitHub account, because GitHub allows one free account per person.
- **Security reports** go through GitHub private vulnerability reporting, so no email address is published.
- **Fixtures** are trimmed to what tests need.
