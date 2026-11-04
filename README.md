# Vinařský deník

PWA pro malé a domácí vinaře. Z předpovědi Open-Meteo počítá riziko plísně révové (primární infekce a sekundární infekce podle Goidanichova indexu) a padlí (Gubler-Thomas). Obsahuje deník postřiků a prací a záznamy úrody a funguje i offline.

## Upozornění

Modely jsou orientační a pro Moravu neověřené. Rozhodnutí o postřiku zůstává na uživateli. Počasí je modelové, nepochází ze stanice ve vinici.

## Stack

Vite, React, TypeScript, Dexie (IndexedDB), i18next, Recharts, vite-plugin-pwa, Vitest.

## Struktura projektu

- `src/rules`: pravidlový engine (výpočty rizika bez vazby na UI)
- `src/data`: tabulka Goidanich a plán péče (JSON)
- `src/features`, `src/routes`: funkce aplikace a stránky
- `src/db`: databáze a migrace
- `src/weather`: stahování počasí z Open-Meteo
- `src/i18n/locales`: překlady (`cs.json`, `en.json`)
- Testy: `*.test.ts` a `*.test.tsx` vedle testovaného kódu, smoke testy stránek v `src/routes/smoke.test.tsx`, nastavení a pomocné funkce testů v `src/test`

## Vývoj

Vyžaduje Node `^22.22.2`, `^24.15.0` nebo `>=26` (viz `engines` v `package.json`).

```
npm install
npm run dev
npm run build
npm run preview
npm run test
npm run lint
npm run typecheck
```

`npm run dev` spustí vývojový server na `http://localhost:5173`, bez service workeru. `npm run build` zkontroluje typy a sestaví aplikaci do `dist/`. `npm run preview` servíruje obsah `dist/`, a proto jen na něm lze lokálně ověřit service worker a offline chování.

## Nasazení na Cloudflare Pages

V Cloudflare dashboardu zvolit **Workers & Pages → Create → Pages → Connect to Git**, vybrat repozitář a nastavit:

- **Root directory:** prázdné (kořen repozitáře)
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Proměnná prostředí:** `NODE_VERSION` = `24`

Soubory z `public/` se při buildu zkopírují do `dist/` a Cloudflare Pages je čte z kořene nasazeného výstupu:

- **`public/_redirects`:** `/*  /index.html  200`, fallback pro routing v prohlížeči. Bez něj by reload na `/pocasi` vrátil 404.
- **`public/_headers`:** cache hlavičky. `/assets/*` a `workbox-*.js` mají hash v názvu, takže se cachují natrvalo. `sw.js`, `registerSW.js`, `manifest.webmanifest` a `index.html` hash nemají a musí se vždy znovu ověřit, jinak by service worker mohl uváznout na staré verzi.

Kontrola po nasazení:

1. Reload na `/pocasi` zobrazí stránku, ne 404.
2. Aplikace jde nainstalovat jako PWA.
3. `sw.js` má v DevTools (Network) hlavičku `Cache-Control: no-cache`.

## Data

Všechna data jsou v IndexedDB v prohlížeči. Aplikace nemá backend ani účty. Záloha se dělá exportem do JSON v Nastavení.

## Zdroje počasí

Dny starší než 2 dny pocházejí z Open-Meteo Historical Forecast API, novější dny a předpověď z Forecast API. ERA5 archiv slouží jen jako záloha, když Historical Forecast den nevrátí. Stejné pravidlo platí pro cache, grafy, tabulky i výpočty.
