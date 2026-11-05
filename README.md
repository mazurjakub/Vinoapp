# Vinařský deník (Vineyard Diary)

[![CI](https://github.com/mazurjakub/Vinoapp/actions/workflows/ci.yml/badge.svg)](https://github.com/mazurjakub/Vinoapp/actions/workflows/ci.yml)

An offline-first PWA for small and hobby winegrowers. It estimates the risk of grapevine downy mildew and powdery mildew from the Open-Meteo forecast and keeps a spray and work journal and harvest records.

The UI is in Czech and English. All data stays in the browser; there is no backend and no account.

## Disclaimer

The app is a helper, not agronomic advice. The risk estimates are indicative and have not been validated for any region. The decision whether and when to spray stays with the user.

## Features

- Plots with location, varieties and region profile
- Daily risk of downy mildew (primary infection, Goidanich index) and powdery mildew (Gubler-Thomas), each with a short reason
- Warning when the protection from the last spray has probably run out
- Weather chart with past days, the 7-day forecast and risk zones
- Journal of sprays, vineyard work and growth stages
- Care plan for organic growing based on the current growth stage
- Harvest records with a yearly summary
- Export and import to JSON as a backup

## How it works

Hourly weather comes from Open-Meteo: older days from the Historical Forecast API, recent days and the forecast from the Forecast API, with ERA5 as a fallback. It is cached in IndexedDB.

Each risk model is a pure function that processes one day at a time and updates a saved season state. On every sync the last 7 days are recomputed, because model weather for recent days still changes; older days stay final.

| Model | Disease | Input |
|---|---|---|
| Primary infection | Downy mildew | Daily temperature, rainfall, degree sum from budbreak or the 3-10 rule |
| Goidanich index | Downy mildew (secondary) | Daily mean temperature and relative humidity |
| Incubation period | Downy mildew | Daily mean temperature |
| Gubler-Thomas | Powdery mildew | Hours between 21 and 30 °C, hours at 35 °C and above |

Thresholds are stored in region profiles (`cz-morava`, `eu-generic`). Where a source leaves something undefined, the choice made by the app is described in a comment next to the code.

## Tech stack

Vite, React, TypeScript, React Router, Dexie (IndexedDB), i18next, Recharts, vite-plugin-pwa, Vitest.

## Project structure

```
src/
  rules/        risk models as pure functions
  features/     app features with their components, repositories and tests
  routes/       pages
  db/           database schema and migrations
  weather/      Open-Meteo client
  data/         Goidanich table and care plan (JSON)
  i18n/         translations
```

## Testing

Tests sit next to the code they test. They focus on the risk models, a regression test against a recorded season, database migrations, export and import, and smoke tests of all pages. Tests never use the network.

## Development

Requires Node 22.22+, 24.15+ or 26+. The exact version is in `.nvmrc`.

```
npm install
npm run dev
npm run build
npm run preview    # needed to test the service worker and offline mode
npm run test
npm run lint
npm run typecheck
```

## License and data sources

The source code is licensed under the [MIT License](LICENSE). The license applies to the code only. Data from third parties keeps its own terms:

- **Goidanich table** (`src/data/goidanich.json`): Table 1 of Pérez-Expósito, J. P., Fernández-Caramés, T. M., Fraga-Lamas, P., & Castedo, L. (2017). VineSens: An Eco-Smart Decision-Support Viticulture System. *Sensors*, 17(3), 465. https://doi.org/10.3390/s17030465. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Care plan** (`src/data/carePlan.cz-bio.json`): adapted from FiBL / Bioinstitut, *Ochrana révy vinné v ekologickém vinohradnictví před hlavními chorobami a škůdci*, 2nd edition, 2008. https://www.fibl.org/fileadmin/documents/shop/4371-protection-viticulture-cz.pdf
- **Weather data**: [Open-Meteo.com](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), including the recorded weather in `src/rules/fixtures/`.
