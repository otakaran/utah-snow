# Utah Snow

## Purpose
- https://utah.otakar.dev: a link-only, noindex ski dashboard for the crew's Utah Ikon trip (dates live only in `config/ikon.ts`).
- One Cloudflare Worker on the free plan serves the SPA, `/api/*` and a `*/5` cron. D1 holds state; KV holds only stake frames.
- Public repo: never commit secrets, the spec/plan files, or `design-sprint/`.

## Repo map
- `config/`: typed registries, data only (ikon, resorts, cams/, youtube, roads, bases, parking, strategy, schedule, site, wall).
- `migrations/`: D1 SQL, `0001_init.sql` (state, histories, frames index, counters, drive_cache) and `0002_tracker.sql`.
- `src/shared/`: pure, runtime-agnostic logic with colocated tests: `types.ts` (+ `types/`), time (+ `time/`), units, num,
  caps, freshness, json, season, lifts, road-hint, mtnpowder, stake-archive, alta-page, parking (`parkingCal`), cam-url,
  geo (drive matrix, corridors, live-sign delay), `pick/` (the pick engine). `config.test.ts` checks the registries.
- `src/worker/index.ts`: `export default { fetch, scheduled }`; `/api/*` -> router, else 404 text/plain no-store.
- `src/worker/{router,http}.ts`: `/api` path table (health, snapshot, cams[/report], stake, drive, tracker, debug/probe) + helpers.
- `src/worker/lib/`: fetchx (all outbound I/O), log, hash.
- `src/worker/sources/`: `types.ts` (Source contract), `index.ts` (SOURCES: every adapter + `maintenance.ts`),
  `probe-seed.ts` (hosts no adapter probes). Adapters: `<id>.ts` + `<id>.test.ts` + `fixtures/<id>/` (+ `<id>/` helpers).
- `src/worker/cron/`: `dispatcher.ts` (`runTick` admits jobs within budget; 08Z prune), `job.ts`, `slots.ts` (pure slot rules).
- `src/worker/store/`: the ONLY code touching D1/KV (snapshot, source-state, tick-state, row-meta, history, frames, counters,
  drive, prune, tracker (+ `tracker/`); `test-db.ts` for tests).
- `src/worker/api/`: one file per route + contract test (`edge.ts`: caches.default + ETag; `post-guard.ts`: shared POST checks);
  `cams/`, `tracker/` helpers. `src/worker/frames/`: timelapse frame lists (KV archive, HDRelay, Prism, Roundshot).
- `src/web/`: Preact SPA (map in `src/web/CLAUDE.md`): shell, `data/` stores, `lib/`, `ui/`, `features/` (briefing,
  pick-card, cams, conditions, resort, settings, tracker, wall), `styles/` (tokens.css, base.css, fonts.css).
- `e2e/`: Playwright `smoke.spec.ts` + one spec per feature, `fixtures.ts` (console-error gate, stubs), `tracker-api.ts`, `seed.sql`.
- `scripts/`: plain-node tools: `check-repo.ts` enforces the rules below; `drift-check.ts`, `refresh-fixtures.ts`, `bench-parsers.ts`
  (same-name folders hold their parts; `lib/`: the Node fetchx shim and the job list they share).
- `public/`: `_headers`, `robots.txt`, `favicon.svg`, `manifest.webmanifest`, `fonts/` (Barlow woff2 + OFL, <= 120 KB).
- Root: `wrangler.jsonc`, `worker-configuration.d.ts` (generated, committed), vite/vitest/playwright/biome/tsconfig files.
- `.github/workflows/`: ci (check, e2e, deploy on main), health (twice daily `/api/health?strict=1`), drift (Mondays; `drift` issue).
- Status now: Phase 2 and its polish pass are done: every adapter and `/api` route, all six pages (wall included), scrubbers,
  custom base, MtnPowder browser fallback, model table, scripts. Next: Phase 3, checking parsers as each resort opens.

## Commands
- `pnpm dev`: Vite + workerd at http://localhost:5173. `pnpm build`. `pnpm deploy` runs from CI on main. Logs: `pnpm wrangler tail`.
- `pnpm check` = `node scripts/check-repo.ts && biome check . && tsc -b && vitest run`. Must pass before commit.
- `pnpm test` (vitest projects `unit` = node, `worker` = workerd). `pnpm e2e` (Playwright on `vite preview :4173`;
  `E2E_PORT=4193 pnpm e2e` if 4173 is busy, since a running server there is reused).
- `pnpm exec biome check --write .` formats and applies safe fixes.
- Network scripts (not in `pnpm check`): `pnpm drift` (cam pages vs `config/cams/`; exit 1 on drift; a blocked host is only
  "unreachable"), `pnpm fixtures [dir|job id] [--wayback <ts>]`, `pnpm bench [--refresh]` (parse ms per cron slot, <= 5).
- `pnpm cf-typegen` after any `wrangler.jsonc` change; commit `worker-configuration.d.ts`.
- `pnpm db:local`: local D1 migrations + `e2e/seed.sql` (resets the tracker). Tracker writes need a non-empty
  `IP_HASH_SALT` in `.dev.vars` (else 503 `no-salt`).
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
  `toLocale*` or `new Date(ms).toISOString()` elsewhere (use `isoUtc`/`isoLocal`, `httpDateToMs`, `HOUR`/`DAY`); tests may spy.
- Stored and API values stay imperial; units convert in the client (`src/shared/units.ts`).
- Colors only through `src/web/styles/tokens.css` variables; no raw hex elsewhere in `src/web/`.
- No secrets in git (`.dev.vars` is local only; `.dev.vars.example` lists names). KV/D1 ids are not secrets.
- Markdown only in `README.md` and the three `CLAUDE.md` files. No `docs/`, ADRs or changelog.
- Tests only where they pay off, colocated as `*.test.ts`. No snapshots, no `.only`/`.skip`/`.todo`.
- A bug fix adds the smallest test that would have caught it. Delete tests, fixtures and doc lines with the code they cover.

## How to add a source, cam or resort
- Source:
  1. Create `src/worker/sources/<id>.ts` by copying the closest sibling adapter.
  2. `pnpm fixtures <id>` (trims to <= 30 KB, re-parses; `--wayback <ts>` for in-season captures).
  3. Write `<id>.test.ts`: field assertions on the fixture plus one validation-gate failure.
  4. Register it in `sources/index.ts`; add its id to slots in `config/schedule.ts` (matrix test fails over 45).
  5. If the UI uses it, extend `Snapshot` in `src/shared/types.ts` and `store/snapshot.ts`.
  6. `pnpm check`, deploy, then `/api/debug/probe?src=<id>`.
- Cam:
  1. Add one `CamDef` to `config/cams/<resort>.ts` (UDOT: `config/cams/udot.ts` + corridor ids in `config/roads.ts`).
  2. YouTube cam: add a slot regex to `config/youtube.ts`.
  3. New provider kind: add `features/cams/kinds/<kind>.ts` and a case in `sources/cam-status.ts`.
  4. `pnpm drift` must report no diff (a new cams page gets a checker in `scripts/drift-check/`).
- Resort:
  1. Extend `ResortId` in `src/shared/types.ts`.
  2. Add entries to `resorts.ts`, `ikon.ts`, `parking.ts`, `bases.ts`, `cams/<resort>.ts`, `roads.ts`, `wall.ts`, `POWDER_MULT` in `strategy.ts`.
  3. Write its adapter (see Source). If it changes the caps, add a pick scenario.

## Key decisions
- One Worker: assets with SPA fallback, `run_worker_first: ["/api/*"]`, custom domain route creates DNS + cert.
- Redeploys drop old chunks: the client reloads once on chunk-load error; the wall reloads when `X-Build` differs.
- D1 holds all structured state (last-good per source, tracker, histories, counters); cron writes `cron:last` first.
- `caches.default` fronts only `/api/snapshot`, `/api/cams`, `/api/stake/*`. No Workers Cache, no R2.
- Open-Meteo is called from the browser only (30 min, 60 on the wall, visible only, shared cache, 429 backoff).
- The pick runs in the browser (`src/shared/pick/`): crew pick by default, "as me" per person; the wall shows crew.
- YouTube works keyless first; `YT_API_KEY` only adds liveness/discovery.
- Worker secrets: `IP_HASH_SALT`, `PROBE_KEY` (required); `YT_API_KEY`, `UDOT_API_KEY` (optional).
- `SITE.origin` in `config/site.ts` is the single source of the public origin (no wrangler var).
- Link-only, noindex, `Referrer-Policy: no-referrer` site-wide; YouTube iframes override to strict-origin-when-cross-origin.
- `/api/debug/probe` returns 404 unless `X-Probe-Key` matches. fetchx never sends Origin or Referer.

## Gotchas
- Cam stills (UDOT, Alta, Ski Utah, Snowbasin) and scrubber frames are plain `<img>` only: no fetch, no canvas, no `crossorigin`.
- YouTube IDs churn: ordered regexes, CamStreamer and discovery; IDs are only seeds in `config/youtube.ts`.
- HDRelay needs an explicit UA and never a Referer.
- KV allows 1,000 writes/day, used only for frames (about 480).
- Subrequest budget is 45 per tick (redirects and `caches.*` count); 6 connections at a time (fetchx 5, the 6th for KV).
- CPU is 10 ms: no DOM parsing, no un-memoized Intl.
- Snowbird's API returns 500 for any foreign Origin. NWS returns 403 without a UA.
- MtnPowder sits behind Imperva: `src/web/data/mtnpowder.ts` refetches blocked or red rows in the browser with the same
  parser (`src/shared/mtnpowder.ts`). `blocked` rows are not critical (`isCritical`), so they never fail `?strict=1`.
- Guardsman Pass (SR-190 from MP `GUARDSMAN_MP` 17) closes every winter: its UDOT posts and events only set the BCC
  `guardsman` note, never a BCC closure. `/api/drive` routes Brighton/Solitude via the BCC mouth, warns on the rest.
- The OSRM demo server allows 1 req/s: `/api/drive` spaces calls 1.1 s, caps 10 lookups/client and 20 misses per day.
- fetchx sends `cache: 'no-store'`, which workerd turns into `Cache-Control: no-cache`: conditional GETs
  (If-None-Match / If-Modified-Since) must also send `Cache-Control: max-age=0` or they never get a 304.
- Ski Utah blob URLs (`skiutah.com/files/blob/...`) 404 on any `_=` query: never `bust: true` there.
- Deployed Workers freeze `Date.now()` during CPU work, so per-job timings show wall time only.
- `biome migrate` rewrote `recommended: true` to `preset: "none"`; keep `"preset": "recommended"`.
- `CamId` (`config/cams/index.ts`) is the union of real cam ids, so a wrong id in `STAKE_ORDER`/`HEROES` fails `tsc -b`.
- Local D1 state is keyed by `database_id`; after changing it in `wrangler.jsonc`, rerun `pnpm db:local`.
