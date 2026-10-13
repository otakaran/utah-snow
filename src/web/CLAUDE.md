# src/web

Status: `main.tsx` is a placeholder that renders "Utah Snow". Everything below is the contract to build.

## Feature folders (`features/<f>/`)
- `index.ts` is the only import surface; components are `PascalCase.tsx`; one `<f>.css` using only `tokens.css` variables.
- Folders: briefing, pick-card, cams, conditions, resort, wall, tracker, settings.
- Features import each other only through `index.ts`. Shared primitives live in `ui/`.
- `src/web/` never imports `src/worker/`; shared logic comes from `src/shared/` and `config/`.
- Unit tests only for pure helpers inside a feature; UI is covered by the Playwright smoke test.

## Data stores (`data/`, Preact signals)
- `snapshot.ts` polls `/api/snapshot` with ETag; `cams.ts`, `tracker.ts`, `settings.ts`, `open-meteo.ts`.
- Open-Meteo runs only in the browser: every 30 min (60 on the wall), only while visible, one shared localStorage cache, 60 min backoff on 429.
- The pick runs client-side from `src/shared/pick/`: crew pick by default, "as me" toggle per person.

## Tokens and themes
- Colors only via `styles/tokens.css` variables (locked by the design sprint); no raw hex anywhere else here.
- Values arrive imperial; convert with `src/shared/units.ts` at render time. Time formatting only via `src/shared/time.ts`.

## Players and visibility (`lib/`)
- `player-manager.ts` caps concurrent HLS/YouTube players; `visibility.ts` pauses work when hidden.
- `build-guard.ts`: reload once on chunk-load error, reload on `X-Build` mismatch, re-request the wake lock.
- UDOT and Alta images are plain `<img>` (no fetch, no canvas, no `crossorigin`).
- YouTube iframes set `referrerpolicy="strict-origin-when-cross-origin"`.

## Settings keys
- base (preset or custom), units, theme, crew today, me, data saver, wall options, admin. Per-device, in localStorage.

## Playwright (`e2e/`, `pnpm e2e`)
- Projects: `phone` (iPhone 15, WebKit), `laptop` (1440x900), `wall` (1920x1080), `tz` (America/Los_Angeles).
- `webServer` runs `vite preview` on port 4173; run `pnpm build` and `pnpm db:local` first.
