# Vinařský deník (Vineyard Diary)

[![CI](https://github.com/mazurjakub/Vinoapp/actions/workflows/ci.yml/badge.svg)](https://github.com/mazurjakub/Vinoapp/actions/workflows/ci.yml)

An offline-first PWA for small and hobby winegrowers. It takes the Open-Meteo forecast and estimates the risk of grapevine downy mildew (primary infection and secondary infection using the Goidanich index) and powdery mildew (Gubler-Thomas index). It also keeps a spray and work journal and harvest records, and it works offline.

The UI is in Czech and English. All data stays in the browser; there is no backend and no account.

## Disclaimer

The models give an indicative estimate only and have not been validated for Moravia. The decision to spray stays with the user. The weather comes from a numerical model, not from a station in the vineyard.

## Features

- **Plots (vineyards)** with location, varieties and region profile (`cz-morava` or `eu-generic`)
- **Risk overview** per plot: downy mildew primary infection, Goidanich secondary infection cycles, Gubler-Thomas powdery mildew index, each with a plain-language reason for the current level
- **Spray interval warning** when the protection from the last spray has probably run out and high risk is ahead
- **Weather chart** with past days and the 7-day forecast, risk zones, infection events and Goidanich cycles
- **Journal** of sprays and vineyard work, plus growth stage (phenology) dates for the season
- **Care plan** timeline for organic growing, mapped to the current growth stage
- **Harvest records** with a per-year summary chart
- **Data export and import** to JSON as a backup
- **Installable PWA** that keeps working without a connection

## How it works

```
Open-Meteo (Historical Forecast / Forecast / ERA5 fallback)
        │  hourly temperature, humidity, dew point, precipitation
        ▼
  weather cache (IndexedDB, 7 days back + 7 days ahead)
        │
        ▼
  syncSeasonState ──► daily accumulators (one per model and plot)
        │               state + last processed day + checkpoint
        ▼
  rules engine (src/rules, pure functions)
        │  downy primary · Goidanich · Gubler-Thomas · incubation
        ▼
  infection events + daily risk snapshots (IndexedDB)
        │
        ▼
  useVineyardRisk hook ──► Overview, Weather chart, warnings
```

### Weather data

Days older than 2 days come from the Open-Meteo Historical Forecast API, newer days and the forecast from the Forecast API. The ERA5 archive is only a fallback for a day that the Historical Forecast API does not return, returns with fewer than 18 hours, or fails on. The same rule applies to the cache, the charts, the tables and the calculations, so every part of the app sees the same numbers.

### Season state and recalculation

Each model is a daily step function `(state, day) => state`. A generic accumulator folds days into a saved season state and stores the last processed day and a checkpoint. On every sync the last 7 days are recomputed from the checkpoint, because model weather for recent days still changes; older days are final. This keeps the calculation deterministic and avoids recomputing the whole season on every page load. Recalculation runs one at a time per plot, and a run with the same inputs as the previous one is skipped.

Infection events that stop meeting the conditions after a recalculation are marked as revoked instead of deleted, and they become active again if the conditions return. Manually entered events are never revoked automatically.

### Models

| Model | Disease | Input | Source |
|---|---|---|---|
| Primary infection | Downy mildew | Daily mean/min temperature, rainfall, degree sum from budbreak (`cz-morava`) or the 3-10 rule (`eu-generic`) | Regional profile |
| Goidanich index | Downy mildew (secondary) | Daily mean temperature and relative humidity, table of daily development | Pérez-Expósito et al. (2017), VineSens |
| Incubation period | Downy mildew | Daily mean temperature, interpolated between 14 °C/10 days, 18 °C/6 days, 24 °C/4 days | Literature anchor points |
| Gubler-Thomas | Powdery mildew | Hours between 21 and 30 °C, hours at 35 °C and above | UC Davis / UC IPM risk index |

Wherever a source leaves something undefined (how the daily mean is computed, which table column to use, the gaps between risk bands), the app makes its own choice and says so in a comment next to the code. Examples:

- Goidanich temperature is rounded to a whole degree (half up) without interpolation.
- A day with fewer than 18 valid hours adds nothing to the index.
- Accumulated percentages are rounded to 2 decimal places so that floating point never decides whether a threshold is crossed.
- The undefined Gubler-Thomas gaps (31–39 and 51–59) go to the higher band to stay on the cautious side.

### Data storage

Data is stored in IndexedDB through Dexie. The schema is versioned and has migrations (currently version 7), which are covered by tests. A backup is made by exporting to JSON in Settings; the import validates the file before writing it.

## Tech stack

Vite, React 19, TypeScript, React Router, Dexie (IndexedDB), i18next, Recharts, vite-plugin-pwa (Workbox), Vitest, Testing Library, fake-indexeddb.

## Project structure

```
src/
  rules/        risk models as pure functions, no UI or database dependencies
  features/     app features (risk, weather chart, journal, harvest, care plan, data, ...)
                each with its components, repository and tests
  routes/       pages
  db/           Dexie schema, migrations and settings
  weather/      Open-Meteo provider behind a WeatherProvider interface
  data/         Goidanich table and the organic care plan (JSON)
  i18n/         translations (cs.json, en.json) and number formatting
  state/        selected plot context
  test/         test setup (IndexedDB, no network) and helpers
```

## Testing

Tests sit next to the code they test (`*.test.ts`, `*.test.tsx`). The focus is on the domain logic:

- every risk model, including edge cases at thresholds and incomplete days
- a regression test of the Goidanich index against a recorded season (`src/rules/fixtures/goidanichVelkePavlovice2026.json`)
- an equivalence test checking that processing day by day and processing after a gap of several days give the same state and snapshots
- database migrations, export and import
- smoke tests that render every page on an empty and on a filled database (`src/routes/smoke.test.tsx`)

Tests never touch the network; `src/test/setupNoNetwork.ts` replaces `fetch` with fixed weather data.

## Development

Requires Node `^22.22.2`, `^24.15.0` or `>=26` (see `engines` in `package.json`). The version used for development, CI and Cloudflare Pages is pinned in `.nvmrc`.

```
npm install
npm run dev        # dev server on http://localhost:5173, no service worker
npm run build      # type check and production build to dist/
npm run preview    # serves dist/, the only way to test the service worker and offline mode locally
npm run test
npm run lint
npm run typecheck
```

## Deployment to Cloudflare Pages

In the Cloudflare dashboard choose **Workers & Pages → Create → Pages → Connect to Git**, select the repository and set:

- **Root directory:** empty (repository root)
- **Build command:** `npm run build`
- **Build output directory:** `dist`

Files from `public/` are copied to `dist/` during the build and Cloudflare Pages reads them from the root of the deployed output:

- **`public/_redirects`:** `/*  /index.html  200`, a fallback for client-side routing. Without it a reload on `/weather` would return 404.
- **`public/_headers`:** cache headers. `/assets/*` and `workbox-*.js` have a hash in their name, so they are cached permanently. `sw.js`, `registerSW.js`, `manifest.webmanifest` and `index.html` have no hash and must always be revalidated, otherwise the service worker could get stuck on an old version.

Checks after deployment:

1. A reload on `/weather` shows the page, not a 404.
2. The app can be installed as a PWA.
3. `sw.js` has the `Cache-Control: no-cache` header in DevTools (Network).

## Known limitations

- Only one Goidanich cycle is tracked at a time; an event during a running cycle does not start a new one.
- Model weather for a grid cell can differ noticeably from the conditions in a specific vineyard.
- The 35 °C rule of Gubler-Thomas ("more than 15 minutes") is approximated with hourly data.
- Data lives in a single browser; moving to another device is done by export and import.

## License and data sources

The source code is licensed under the [MIT License](LICENSE). The license applies to the code only. The following data comes from third parties, keeps its own terms and is cited here:

- **Goidanich table** (`src/data/goidanich.json`): Table 1 of Pérez-Expósito, J. P., Fernández-Caramés, T. M., Fraga-Lamas, P., & Castedo, L. (2017). VineSens: An Eco-Smart Decision-Support Viticulture System. *Sensors*, 17(3), 465. https://doi.org/10.3390/s17030465. Published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Organic care plan** (`src/data/carePlan.cz-bio.json`): adapted from FiBL / Bioinstitut, *Ochrana révy vinné v ekologickém vinohradnictví před hlavními chorobami a škůdci*, 2nd edition, 2008 (Czech adaptation 12/2007). https://www.fibl.org/fileadmin/documents/shop/4371-protection-viticulture-cz.pdf. Page numbers are kept in the `sourcePages` fields.
- **Weather data**: [Weather data by Open-Meteo.com](https://open-meteo.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This covers the data the app downloads at runtime and the recorded weather in `src/rules/fixtures/goidanichVelkePavlovice2026.json`.
