# 2. Fetch WSDOT data with a scheduled GitHub Actions job

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

WSDOT's Traveler Information API needs a personal access code. It also sends **no CORS headers**, so browsers can't call it, though it does support JSONP. Anything in client-side code on a public site is public.

Options considered:

1. **Call it from the browser.** This exposes the key. JSONP would also run WSDOT-served script inside our page. Rejected.
2. **Cloudflare Worker proxy.** Truly live, but it's a second account and a second thing to secure. Its public URL could be abused to use our key unless it's rate-limited.
3. **Scheduled GitHub Actions job.** Every ~10 minutes it fetches WSDOT with the key from encrypted repo secrets, cleans the data, and deploys it to Pages as static JSON.

## Decision

Option 3.

- The schedule runs at odd minutes (:03, :13, ...) to avoid GitHub's busy top of the hour.
- The fetched data is deployed but **never committed**, so git history stays clean.
- A small monthly keep-alive job uses the GitHub API to stop GitHub disabling schedules in public repos after 60 days without activity. It makes no dummy commits.
- Camera images aren't proxied. The browser loads them directly from `images.wsdot.wa.gov`, which WSDOT refreshes about every 5 minutes.
- The app reads the same JSON shape whatever produces it, so option 2 can be added later without restructuring.

## Consequences

- WSDOT data can be 10-30 minutes old because GitHub's schedule is best-effort. The UI shows "Updated X min ago" and flags anything older than 30 minutes.
- There's no public endpoint that could leak or abuse the key.
- Travel times only exist for Snoqualmie (North Bend to Ellensburg, both directions). Other passes don't show that card.
