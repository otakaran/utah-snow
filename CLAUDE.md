# Utah Snow

## Purpose
- https://utah.otakar.dev: a link-only, noindex ski dashboard for the crew's Utah Ikon trip (dates live only in `config/ikon.ts`).
- One Cloudflare Worker on the free plan serves the SPA, `/api/*` and a `*/5` cron. D1 holds state; KV holds only stake frames.
- Public repo: never commit secrets, the spec/plan files, or `design-sprint/`.

## Repo map
- `config/`: typed registries, data only (ikon, resorts, cams/, youtube, roads, bases, parking, strategy, schedule, site).
- `migrations/`: D1 SQL, `0001_init.sql` (state, histories, frames index, counters) and `0002_tracker.sql`.
- `src/shared/`: pure, runtime-agnostic logic with colocated tests: `types.ts` (+ `types/`), time (+ `time/`), units, num,
  caps, freshness, json, season, lifts, road-hint, mtnpowder, stake-archive, alta-page, parking (`parkingCal`), cam-url,
  `pick/` (the pick engine). `config.test.ts` checks the registries. Planned: geo.
- `src/worker/index.ts`: `export default { fetch, scheduled }`; `/api/*` -> router, else 404 text/plain no-store.
- `src/worker/{router,http}.ts`: `/api` path table (health, snapshot, cams, stake, debug/probe), JSON/ETag helpers.
- `src/worker/lib/`: fetchx (all outbound I/O), log, hash.
- `src/worker/sources/`: `types.ts` (Source contract), `index.ts` (SOURCES: every adapter + `maintenance.ts`),
  `probe-seed.ts` (hosts no adapter probes). Adapters: `<id>.ts` + `<id>.test.ts` + `fixtures/<id>/` (+ `<id>/` helpers).
- `src/worker/cron/`: `dispatcher.ts` (`runTick` admits jobs against the budget; 08Z D1 prune), `job.ts` (one job's writes).
- `src/worker/store/`: the ONLY code touching D1/KV (snapshot, source-state, tick-state, row-meta, history, frames, counters,
  prune; `test-db.ts` for tests).
- `src/worker/api/`: one file per route, each with a contract test (`edge.ts`: caches.default + ETag); `frames/`: archive.
- `src/web/`: Preact SPA (map in `src/web/CLAUDE.md`): shell, `data/` stores, `lib/`, `ui/`, `features/` (briefing,
  pick-card, cams, conditions, resort, settings), `styles/` (tokens.css, base.css).
- `e2e/`: Playwright `smoke.spec.ts`, `fixtures.ts` (console-error gate, network stubs) and `seed.sql` for local D1.
- `scripts/`: plain-node tools; `check-repo.ts` (+ `check-repo/`) enforces the rules below.
- `public/`: `_headers`, `robots.txt`, `favicon.svg`, `manifest.webmanifest`.
- Root: `wrangler.jsonc`, `worker-configuration.d.ts` (generated, committed), vite/vitest/playwright/biome/tsconfig files.
- `.github/workflows/`: ci (check, e2e, deploy on main) and health (twice daily `/api/health?strict=1`).
- Status now: all source adapters registered and writing D1 (resorts, roads, NWS, avy, snotel, YouTube, stakes + KV
  frames, cam status, maintenance); `/api/cams` and `/api/stake/*`; web briefing, pick, cams, resort and settings pages.
- Not yet built: the MtnPowder browser fallback UI, `/api/tracker` + tracker page, the wall, the drift workflow and
  Phase 2 `scripts/{refresh-fixtures,drift-check,bench-parsers}.ts` (`pnpm fixtures|drift|bench`).

## Commands
- `pnpm dev`: Vite + workerd at http://localhost:5173. `pnpm build`. `pnpm deploy` runs from CI on main. Logs: `pnpm wrangler tail`.
- `pnpm check` = `node scripts/check-repo.ts && biome check . && tsc -b && vitest run`. Must pass before commit.
- `pnpm test` (vitest projects `unit` = node, `worker` = workerd). `pnpm e2e` (Playwright on `vite preview :4173`;
  `E2E_PORT=4193 pnpm e2e` if 4173 is busy, since a running server there is reused).
- `pnpm exec biome check --write .` formats and applies safe fixes.
- `pnpm cf-typegen` after any `wrangler.jsonc` change; commit `worker-configuration.d.ts`.
- `pnpm db:local`: local D1 migrations + `e2e/seed.sql`.
- Local cron tick: `curl "http://localhost:5173/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*&time=<ms>&format=json"`.
- Every wrangler command except `deploy` passes `-c wrangler.jsonc` (after a build wrangler otherwise follows the generated config).
- Never run interactive commands (`pnpm approve-builds`); add packages to `allowBuilds` in `pnpm-workspace.yaml` instead.

## Conventions
- Files <= 250 lines (hard cap 400; `check-repo` warns over 250). Split into a sibling folder of the same name.
- kebab-case `.ts`; PascalCase `.tsx` components. Relative imports always carry `.ts`/`.tsx`.
- Import boundaries (enforced by `check-repo`):
  - `config/` holds data only and may import only `import type` from `src/shared/types.ts`.
  - `src/shared/` imports only `src/shared/` and `config/`; no packages.
  - Adapters import only `src/shared/`, `config/`, `sources/types.ts` and their own helper folder; never store/api/cron.
  - `src/web/` imports `src/web/`, `src/shared/`, `config/` and packages; never `src/worker/`.
  - Features import each other only through `features/<f>/index.ts`.
  - Only `src/worker/store/` touches D1/KV.
- Adapters do all I/O through `ctx.fetch` (fetchx); `parse()` is pure and throws `ValidationError` to keep last-good rows.
- All Date/Intl/time logic lives in `src/shared/time.ts` (body in `time/`; America/Denver). No local Date getters, `Intl`,
  `toLocale*` or `new Date(ms).toISOString()` elsewhere: use `isoUtc`/`isoLocal`, `httpDateToMs`, `HOUR`/`DAY`.
  Tests may only spy on it (`vi.spyOn(Intl.…)`).
- Stored and API values stay imperial; units convert in the client (`src/shared/units.ts`).
- Colors only through `src/web/styles/tokens.css` variables; no raw hex elsewhere in `src/web/`.
- No secrets in git (`.dev.vars` is local only; `.dev.vars.example` lists names). KV/D1 ids are not secrets.
- Markdown only in `README.md` and the three `CLAUDE.md` files. No `docs/`, ADRs or changelog.
- Tests only where they pay off, colocated as `*.test.ts`. No snapshots, no `.only`/`.skip`/`.todo`.
- A bug fix adds the smallest test that would have caught it.
- Delete tests, fixtures and doc lines in the same commit as the code they cover.

## How to add a source, cam or resort
- Source:
  1. Create `src/worker/sources/<id>.ts` by copying the closest sibling adapter.
  2. `pnpm fixtures <id>` (Phase 2 script).
  3. Write `<id>.test.ts`: field assertions on the fixture plus one validation-gate failure.
  4. Register it in `sources/index.ts`; add its id to slots in `config/schedule.ts` (matrix test fails over 45).
  5. If the UI uses it, extend `Snapshot` in `src/shared/types.ts` and `store/snapshot.ts`.
  6. `pnpm check`, deploy, then `/api/debug/probe?src=<id>`.
- Cam:
  1. Add one `CamDef` to `config/cams/<resort>.ts` (UDOT: `config/cams/udot.ts` + corridor ids in `config/roads.ts`).
  2. YouTube cam: add a slot regex to `config/youtube.ts`.
  3. New provider kind: add `features/cams/kinds/<kind>.ts` and a case in `sources/cam-status.ts`.
  4. `pnpm drift` must report no diff.
- Resort:
  1. Extend `ResortId` in `src/shared/types.ts`.
  2. Add entries to `resorts.ts`, `ikon.ts`, `parking.ts`, `bases.ts`, `cams/<resort>.ts`, `roads.ts`, `POWDER_MULT` in `strategy.ts`.
  3. Write its adapter (see Source). If it changes the caps, add a pick scenario.

## Key decisions
- One Worker: assets with SPA fallback, `run_worker_first: ["/api/*"]`, custom domain route creates DNS + cert.
- Redeploys drop old chunks: the client reloads once on chunk-load error; the wall reloads when `X-Build` differs.
- D1 holds all structured state (last-good per source, tracker, histories, counters); cron writes `cron:last` first.
- KV holds only binary stake frames (put before the D1 index row; never `KV.list()`).
- `caches.default` fronts only `/api/snapshot`, `/api/cams`, `/api/stake/*`. No Workers Cache, no R2.
- Open-Meteo is called from the browser only (30 min, 60 on the wall, visible only, shared cache, 429 backoff).
- The pick runs in the browser (`src/shared/pick/`): crew pick by default, "as me" per person; the wall shows crew.
- YouTube works keyless first; `YT_API_KEY` only adds liveness/discovery.
- Worker secrets: `IP_HASH_SALT`, `PROBE_KEY` (required); `YT_API_KEY`, `UDOT_API_KEY` (optional).
- `SITE.origin` in `config/site.ts` is the single source of the public origin (no wrangler var).
- Link-only, noindex, `Referrer-Policy: no-referrer` site-wide; YouTube iframes override to strict-origin-when-cross-origin.
- `/api/debug/probe` returns 404 unless `X-Probe-Key` matches. fetchx never sends Origin or Referer.

## Gotchas
- UDOT and Alta images are plain `<img>` only: no fetch, no canvas, no `crossorigin`.
- YouTube IDs churn: ordered regexes, CamStreamer and discovery; IDs are only seeds in `config/youtube.ts`.
- HDRelay needs an explicit UA and never a Referer.
- KV allows 1,000 writes/day, used only for frames (about 480).
- Subrequest budget is 45 per tick (redirects and `caches.*` count), 6 connections at a time (fetchx uses 5; the 6th
  stays free for KV).
- CPU is 10 ms: no DOM parsing, no un-memoized Intl.
- Snowbird's API returns 500 for any foreign Origin. NWS returns 403 without a UA.
- MtnPowder sits behind Imperva; the browser fallback uses the same pure parser (`src/shared/mtnpowder.ts`). Its
  `blocked` rows are not critical (`isCritical` in `freshness.ts`), so they never fail `/api/health?strict=1`.
- fetchx sends `cache: 'no-store'`, which workerd turns into `Cache-Control: no-cache`: conditional GETs
  (If-None-Match / If-Modified-Since) must also send `Cache-Control: max-age=0` or they never get a 304.
- Ski Utah blob URLs (`skiutah.com/files/blob/...`) 404 on any `_=` query: never `bust: true` there.
- Deployed Workers freeze `Date.now()` during CPU work, so per-job timings show wall time only.
- D1 allows <= 50 queries per invocation.
- Vitest 5's fs module cache breaks the workerd pool; the `worker` project sets `fsModuleCache: false`.
- `biome migrate` rewrote `recommended: true` to `preset: "none"`; keep `"preset": "recommended"`.
- `CamId` (`config/cams/index.ts`) is the union of real cam ids, so a wrong id in `STAKE_ORDER`/`HEROES` fails `tsc -b`.
- Local D1 state is keyed by `database_id`; after changing it in `wrangler.jsonc`, rerun `pnpm db:local`.
