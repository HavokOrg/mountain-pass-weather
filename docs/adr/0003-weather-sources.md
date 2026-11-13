# 3. Open-Meteo for forecasts, NWS for alerts, no "safe to cross" verdict

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

We want hourly and 10-day forecasts adjusted for summit elevation, with snowfall and freezing level, from sources a static site can call without a key.

## Decision

- **Open-Meteo**: no key, CORS-enabled, supports an `elevation` parameter, freezing level and snowfall, and up to 16 forecast days. Its free tier is **non-commercial only**, with CC BY 4.0 attribution: "Weather data by Open-Meteo.com", linked, wherever its data appears.
- **NWS api.weather.gov** for official alerts at the summit point. It's CORS-enabled, and browsers send their own User-Agent.
- **avalanche.org** (NWAC) map-layer for avalanche danger. It's CORS-enabled and needs no key.
- **WSDOT summit weather stations** (from the scheduled job) supply the big temperature when the reading is under 30 minutes old, labeled "Measured at summit". Otherwise the forecast is shown.
- **Not Apple WeatherKit**: it needs a $99/yr developer account and server-side request signing.
- **No computed go/no-go verdict.** An automated "safe to cross" could create false confidence. We show the facts plus WSDOT's own restrictions.

## Consequences

- The app must stay non-commercial: no ads and no paid features. If that changes, the forecast source must change too.
