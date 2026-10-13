# src/web

Shell: `main.tsx` (build guard, router, stores, theme effect), `app.tsx` (header, `Outlet`, footer), `router.ts` (hash
routes `#/`, `#/resort/:id`, `#/cams`, `#/settings`, `#/tracker` + `#/wall` stubs; bad paths redirect to `#/`).

## Feature folders (`features/<f>/`)
- `index.ts` is the only import surface; components are `PascalCase.tsx`; one `<f>.css` using only `tokens.css` variables.
- briefing (spec 8.2 order: header, pick, stakes, resorts, roads, avalanche, forecast, then `status`; `footer` is the
  shell's), pick-card (PickCard, PickCompact, Ridge; the only caller of `src/shared/pick/`), cams (CamTile, CamGallery,
  StakeRow, CamsPage, players), conditions (Roads/Avalanche/Forecast panels), resort (8 sections of spec 8.7),
  settings (page + header chips). To come: wall, tracker.
- Features import each other only through `index.ts`. `ui/` holds presentational pieces (+ `ui.css`, `forms.css`,
  `overlays.css`, `shell.css`) and never imports a feature. `src/web/` never imports `src/worker/`.
- Unit tests only for pure helpers (vitest `unit` project includes `src/web/**/*.test.ts`); UI is covered by Playwright.

## Data stores (`data/`, Preact signals)
- `snapshot.ts`: `/api/snapshot` with ETag, 120 s (60 s on the wall), visible only; server clock (`serverNow` from the
  Date header) and X-Build -> `lib/build-guard.ts`. `health.ts`: `/api/health`, global badge.
- `cams.ts`: `/api/cams` every 60 s once a cam view calls `ensureCams()`. `open-meteo.ts`: browser-only, 30 min,
  shared localStorage cache, 429 backoff. `tracker.ts`: placeholder signals until `/api/tracker` exists (empty crew).

## Settings keys (`data/settings.ts`, localStorage `utahsnow.<key>`, per device)
- units, theme (dark|sun|auto), base, me, ride, pickView, crewToday, dataSaver, wall, skiFraction, admin.

## Tokens and themes
- Colors only via `styles/tokens.css` (locked); obey its header's UI rules. `<html data-theme>` dark|sun; wall
  `data-scale="wall"`. Values arrive imperial: convert with `src/shared/units.ts`; time only via `src/shared/time.ts`.

## Players and visibility (`lib/`)
- `visibility.ts`: one 5 s scheduler + shared IntersectionObserver; work runs only on screen and while visible.
- `player-manager.ts`: HLS 1 on phones, 2 on desktop, min(?hls, 3) on the wall; 1 YouTube per page; 10 min idle stop.
- `build-guard.ts`: one guarded reload on chunk errors or a new build; wall wake lock. `data-saver.ts`, `format.ts`.
- UDOT, Alta, Ski Utah and Snowbasin images are plain `<img>` (no fetch, canvas or `crossorigin`). hls.js/light is lazy.

## Playwright (`e2e/`, `pnpm e2e`)
- Projects: `phone` (iPhone 15, WebKit), `laptop` (1440x900), `wall` (1920x1080), `tz` (America/Los_Angeles).
- `fixtures.ts`: fails a test on any console error, stubs every non-localhost request, `pinTime` fakes clock + Date.
- `webServer` runs `vite preview` on 4173 (`E2E_PORT` overrides; an existing server is reused). Run `pnpm build` and
  `pnpm db:local` first; the suite passes on the seed and on real local ticks.
