# Pass Weather

Weather and live road conditions for Washington's mountain passes (**Snoqualmie, Stevens, White and Blewett**), in a layout inspired by Apple Weather.

**Live site:** https://havokorg.github.io/mountain-pass-weather/

> **Not for safety decisions.** Conditions change fast in the mountains. Always check [WSDOT's mountain pass reports](https://wsdot.com/travel/real-time/mountainpasses) before you go.

## Roadmap

| Phase | What ships | Status |
| --- | --- | --- |
| 1 | Project skeleton, CI, GitHub Pages deploy, Snoqualmie forecast | In progress |
| 2 | WSDOT data: pass report, cameras, alerts, travel times, summit weather stations | Planned |
| 3 | Apple-style UI: sky gradients, frosted cards, hourly + 10-day, swipe between passes | Planned |
| 4 | Extras: NWS alerts, avalanche danger, snow level, sunrise/sunset, "Both sides" card | Planned |
| 5 | Animated weather, installable app, offline support | Planned |

## How it works

```
                        +-------------------------------+
  Your browser -------> | Open-Meteo, NWS, avalanche    |  keyless, called directly, always live
       |                | WSDOT camera images           |
       |                +-------------------------------+
       v
  GitHub Pages <-- deploy -- GitHub Actions (every ~10 min)
  (static site +             fetches the WSDOT API with a key kept in
   cleaned WSDOT JSON)       encrypted repo secrets; the key never reaches the browser
```

- The site is fully static: Vite + TypeScript, no framework, and no runtime dependencies.
- WSDOT's API needs a personal key and doesn't allow browser calls. A scheduled GitHub job fetches it and publishes cleaned JSON alongside the site. That data is never committed to git.
- Background: [docs/adr/](docs/adr/)

## Development

You'll need Node 24 (see `.nvmrc`).

```bash
npm ci            # install exact locked dependencies
npm run dev       # http://localhost:5173/mountain-pass-weather/
npm run check     # typecheck, lint, test, build
```

To change which passes appear, or their order, edit `config/passes.json`.

## Privacy

- No analytics, cookies, trackers, ads or accounts.
- No location access: passes come from a fixed list.
- The site sends no `Referer` header to the services it calls.
- Your browser contacts only these services: GitHub Pages (the site itself), Open-Meteo, and later WSDOT (camera images), the National Weather Service and avalanche.org.

## Data sources and credits

- Forecasts: [Weather data by Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0)
- Road conditions, cameras, alerts and travel times: [WSDOT](https://wsdot.wa.gov/), subject to the [WSDOT travel information disclaimer](https://wsdot.wa.gov/about/policies/travel-information-disclaimer)
- Weather alerts: [National Weather Service](https://www.weather.gov/)
- Avalanche danger: [Northwest Avalanche Center](https://nwac.us/) via avalanche.org

The design is inspired by Apple Weather. It isn't affiliated with Apple and uses no Apple artwork.

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## License

[MIT](LICENSE)
