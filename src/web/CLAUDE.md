# src/web

Shell: `main.tsx` (build guard, router, stores, theme effect), `app.tsx` (header, `Outlet`, footer), `router.ts` (hash
routes `#/`, `#/resort/:id`, `#/cams`, `#/settings`, `#/tracker`, `#/wall` stub; bad paths redirect to `#/`).

## Feature folders (`features/<f>/`)
- `index.ts` is the only import surface; `PascalCase.tsx` components; one `<f>.css` (tokens only; over 250 lines it
  `@import`s its leading sections from `<f>/`, keeping cascade order). Features import each other only via `index.ts`.
- briefing (spec 8.2 order: header, pick, stakes, resorts, roads, avalanche, forecast, then `status`; `footer` is the
  shell's), pick-card (PickCard, PickCompact, Ridge; the only caller of `src/shared/pick/`), cams (CamTile, CamGallery,
  StakeRow, CamsPage, players), conditions (Roads/Avalanche/Forecast panels), resort (8 sections of spec 8.7),
  settings (page + header chips), tracker (§9.5 grid + DayPicker sheet, caps, bookings, crew, undo log). To come: wall.
- `ui/`: presentational pieces (+ ui, forms, overlays, shell css), never imports a feature; nor `src/web/` the worker.
  Unit tests only for pure helpers (vitest `unit` includes `src/web/**/*.test.ts`); UI is covered by Playwright.

## Data stores (`data/`, Preact signals)
- `snapshot.ts`: `/api/snapshot` with ETag, 120 s (60 s on the wall), visible only; server clock (`serverNow` from the
  Date header) and X-Build -> `lib/build-guard.ts`. `health.ts`: `/api/health`, global badge.
- `cams.ts`: `/api/cams` every 60 s once a cam view calls `ensureCams()`. `open-meteo.ts`: browser-only, 30 min,
  shared localStorage cache, 429 backoff. `tracker.ts` (+ `tracker/`): `/api/tracker` every 10 min (30 s on #/tracker)
  + focus; ops apply optimistically, sent in order with `prevUpdatedAt` + `clientId`; a 200/409 state replaces the copy.

## Settings keys (`data/settings.ts`, localStorage `utahsnow.<key>`, per device)
- units, theme (dark|sun|auto), base, me, ride, pickView, crewToday, dataSaver, wall, skiFraction, admin, clientId.

## Tokens and themes
- Colors only via `styles/tokens.css` (locked; obey its header's UI rules); `styles/fonts.css` maps `public/fonts`.
  `<html data-theme>` dark|sun; wall `data-scale="wall"`. Imperial in, convert via `shared/units.ts`; time via `time.ts`.

## Players and visibility (`lib/`)
- `visibility.ts`: one 5 s scheduler + shared IntersectionObserver; work runs only on screen and while visible.
- `player-manager.ts`: HLS 1 on phones, 2 on desktop, min(?hls, 3) on the wall; 1 YouTube per page; 10 min idle stop.
- `build-guard.ts`: one guarded reload on chunk errors or a new build; wall wake lock. `data-saver.ts`, `format.ts`.
  UDOT, Alta, Ski Utah and Snowbasin images are plain `<img>` (no fetch, canvas or `crossorigin`). hls.js is lazy.

## Playwright (`e2e/`, `pnpm e2e`)
- Projects: `phone` (iPhone 15, WebKit), `laptop` (1440x900), `wall` (1920x1080), `tz` (America/Los_Angeles).
- `fixtures.ts`: fails on console errors (`allowErrors` opt-out), stubs non-localhost requests, `pinTime` fakes clock + Date.
- `tracker-api.ts`: each tracker test owns an "E2E <project>" person and a CF-Connecting-IP (projects share local D1).
- `vite preview` on 4173 (`E2E_PORT`; reused if running). First `pnpm build` + `pnpm db:local` (resets tracker tables).
