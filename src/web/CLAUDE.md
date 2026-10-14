# src/web

Shell: `main.tsx` (build guard, router, stores, theme), `app.tsx` (header, `Outlet`, footer), `router.ts` (hash routes).

## Feature folders (`features/<f>/`)
- `index.ts` is the only import surface; `PascalCase.tsx` components; one `<f>.css` (tokens only; over 250 lines it
  `@import`s its leading sections from `<f>/`, keeping cascade order). Features import each other only via `index.ts`.
- briefing (BriefJump: phone jump bar once `#pick` scrolls away), pick-card (PickCard, PickCompact, Ridge; the only caller
  of `src/shared/pick/`), conditions (Roads/Avalanche/Forecast panels, ModelTable), resort (a lift or gate is the red ◆
  Closed only while `liftsRunning`, else grey ◌), settings (+ header chips, CustomBase, DriveChips; typed fields clamp and
  flash in the Section sub), tracker (§9.5: Grid from 900 px, DayList below; DayPicker, caps, thresholds, bookings, crew,
  undo), wall (`config/wall.ts` sets; 1920x1080 canvas zoomed to fit; below `WALL_MIN_WIDTH`: WallLaunch, no nav item).
- cams (CamTile + `cam-tile/`, CamGallery, StakeRow, CamsPage, players, Lightbox Scrubber): every gallery lists cams via
  cam-view `visibleCams()` (dedupes fallback twins; offlineGated UDOT cams need `online: true`) and `leadCam()`.
- `ui/`: presentational pieces (+ ui, forms, overlays, shell, jumpbar, countdown css); never imports a feature. `Section`
  sets `id` = its testid: the sticky `JumpBar` target (briefing, cams, resort). `Countdown`: days to first chair or opening.

## Data stores (`data/`, Preact signals)
- `snapshot.ts`: `/api/snapshot` (ETag, 120 s, 60 s on the wall, visible only), `serverNow`, X-Build -> `build-guard.ts`;
  overlays `mtnpowder.ts` (browser fetch of red MtnPowder rows). `health.ts`: badge. `drive.ts`: `/api/drive` (custom base).
- `cams.ts`: `/api/cams` every 60 s once a cam view calls `ensureCams()`. `open-meteo.ts`: browser-only, 30 min,
  shared localStorage cache, 429 backoff. `tracker.ts` (+ `tracker/`; wire types `shared/types/tracker.ts`): 10 min
  (30 s on #/tracker) + focus; ops apply optimistically, in order, with `prevUpdatedAt` + `clientId`; 200/409 replace it.

## Settings keys (`data/settings.ts`, localStorage `utahsnow.<key>`, per device)
- units, theme (dark|sun|auto), base, me, ride, pickView, crewToday, dataSaver, wall, skiFraction, admin.

## Tokens and themes
- Colors only via `styles/tokens.css` (locked; obey its header's UI rules); `styles/fonts.css` maps `public/fonts`.
  `<html data-theme>` dark|sun; wall `data-scale="wall"`. `--crew-1..6`: person accents by crew order, never the only cue.

## Players and visibility (`lib/`)
- `visibility.ts`: one 5 s scheduler + shared IntersectionObserver; work runs only on screen and while visible.
- `player-manager.ts`: HLS 1 on phones, 2 on desktop, ?hls (<= 3) on the wall; 1 YouTube per page; 10 min idle stop.
- `build-guard.ts`: one guarded reload on chunk errors or a new build; wall wake lock. hls.js loads lazily.

## Playwright (`e2e/`; `pnpm build` + `pnpm db:local` before `pnpm e2e`; vitest `unit` covers only pure helpers)
- Projects: `phone` (iPhone 15, WebKit), `laptop` (1440x900), `wall` (1920x1080; `wall.spec.ts` forces it), `tz` (LA).
- `fixtures.ts`: fails on console errors (`allowErrors` opt-out), stubs non-localhost requests, `pinTime` fakes clock + Date.
- `tracker-api.ts`: each tracker test owns an "E2E <project>" person and a CF-Connecting-IP (projects share local D1).
