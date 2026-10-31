<!--
File: README.md
Created: 2026-10-20
Description: How to run, build, test and deploy the app.
-->

# Vinařský deník

PWA pro malé a domácí vinaře.

## Spuštění

```
npm install
npm run dev
```

Otevře se na `http://localhost:5173` (nebo první volný port nad ním).

## Build a lokální ověření produkční verze

```
npm run build
npm run preview
```

`npm run build` spustí `tsc -b` a poté `vite build` do `dist/`. `npm run preview` servíruje přesně to, co šlo do `dist/` — jediný spolehlivý způsob, jak lokálně ověřit service worker a offline chování (`npm run dev` service worker nezapojuje).

## Testy a lint

```
npm run test
npm run lint
```

## Nasazení na Cloudflare Pages

Repozitář má pro Cloudflare Pages připravené:
- **`public/_redirects`** — `/*  /index.html  200`, SPA fallback pro `react-router-dom` (bez něj by reload na `/pocasi` apod. vrátil 404).
- **`public/_headers`** — cache hlavičky: `dist/assets/*` a `workbox-*.js` mají hash v názvu souboru, takže se cachují natrvalo (`immutable`); `sw.js`, `registerSW.js`, `manifest.webmanifest` a `index.html` hash nemají a musí se vždy znovu ověřit, jinak by `autoUpdate` service workeru (viz `vite.config.ts`) mohl uváznout na staré verzi.

Oba soubory se při buildu zkopírují z `public/` do `dist/` beze změny — Cloudflare Pages je čte z kořene nasazeného výstupu.

### Kroky, které vyžadují přístup k mému účtu (proveď sám)

1. Repozitář push na GitHub/GitLab (pokud tam ještě není).
2. V Cloudflare dashboardu: **Workers & Pages → Create → Pages → Connect to Git**, vybrat repozitář.
3. Build nastavení:
   - **Framework preset:** Vite (nebo None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `vinar` (pokud Cloudflare Pages nenabídne vlastní pole a bude chtít kořen repa, nastav build command na `cd vinar && npm run build` a output directory na `vinar/dist`)
4. Node verze: pokud build selže na verzi Node, nastavit v Cloudflare proměnnou prostředí `NODE_VERSION` (doporučeno 20+).
5. Po prvním nasazení zkontrolovat v prohlížeči: SPA routing (reload na `/pocasi`), instalaci PWA, a že `sw.js`/`manifest.webmanifest` opravdu chodí s `no-cache` (DevTools → Network).
6. Volitelně nastavit vlastní doménu v **Custom domains**.

Nic z výše uvedeného jsem sám nespustil (push, založení Cloudflare projektu) — čeká to na tebe.
