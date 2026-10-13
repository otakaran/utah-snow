# Utah Snow

## Purpose
- https://utah.otakar.dev: a link-only, noindex ski dashboard for the crew's Utah Ikon trip (dates live only in `config/ikon.ts`).
- One Cloudflare Worker on the free plan serves the SPA, `/api/*` and a `*/5` cron. D1 holds state; KV holds only stake frames.
- Public repo: never commit secrets, the spec/plan files, or `design-sprint/`.

## Repo map
- `config/`: typed registries, data only (ikon, resorts, cams/, youtube, roads, bases, parking, strategy, schedule, site).
- `migrations/`: D1 SQL, `0001_init.sql` (state, histories, frames index, counters) and `0002_tracker.sql`.
- `src/shared/`: pure, runtime-agnostic logic with colocated tests (types, time, units, num, caps, pick/, geo, freshness...).
- `src/worker/index.ts`: `export default { fetch, scheduled }`; non-`/api` requests that reach it get 404 text/plain.
- `src/worker/{router,http}.ts`: `/api` path table, JSON/ETag/cache/security-header helpers.
- `src/worker/lib/`: fetchx (all outbound I/O), log, hash.
- `src/worker/sources/`: one adapter per data source, `<id>.ts` + `<id>.test.ts` + `fixtures/<id>/`.
- `src/worker/cron/`: dispatcher (subrequest budget) and D1 prune.
- `src/worker/frames/`: per-request frame lists (archive, hdrelay, prism, roundshot).
- `src/worker/store/`: the ONLY code touching D1/KV.
- `src/worker/api/`: one file per route, each with a contract test.
- `src/web/`: Preact SPA: `main.tsx`, `app.tsx`, `router.ts`, `data/` signal stores, `lib/`, `ui/`, `features/<f>/`, `styles/`.
- `e2e/`: Playwright `smoke.spec.ts` and `seed.sql` for local D1.
- `scripts/`: plain-node tools; `check-repo.ts` (+ `check-repo/`) enforces the rules below.
- `public/`: `_headers`, `robots.txt`, `favicon.svg`, `manifest.webmanifest`.
- Root: `wrangler.jsonc`, `worker-configuration.d.ts` (generated, committed), vite/vitest/playwright/biome/tsconfig files.
- Status now: scaffold only. `src/worker/index.ts`, `src/web/main.tsx`, `config/site.ts` are placeholders.
- Not yet built: the rest of `config/`, `migrations/`, `src/shared/`, worker modules, web features, `e2e/`.
- Phase 2 adds `scripts/{refresh-fixtures,drift-check,bench-parsers}.ts` with their `pnpm fixtures|drift|bench` scripts.
- `.github/workflows/` (ci, drift, health) comes later; not yet built.

## Commands
- `pnpm dev`: Vite + workerd at http://localhost:5173. `pnpm build`. `pnpm deploy` runs from CI on main.
- `pnpm check` = `node scripts/check-repo.ts && biome check . && tsc -b && vitest run`. Must pass before commit.
- `pnpm test` (vitest projects `unit` = node, `worker` = workerd). `pnpm e2e` (Playwright on `vite preview :4173`).
- `pnpm exec biome check --write .` formats and applies safe fixes.
- `pnpm cf-typegen` after any `wrangler.jsonc` change; commit `worker-configuration.d.ts`.
- `pnpm db:local`: local D1 migrations + `e2e/seed.sql`.
- Local cron tick: `curl "http://localhost:5173/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*&time=<ms>&format=json"`.
- Live logs: `pnpm wrangler tail`.
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
- All Date/Intl/time logic lives in `src/shared/time.ts` (America/Denver). No local Date getters, `Intl`, `toLocale*` elsewhere.
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
- Subrequest budget is 45 per tick (redirects and `caches.*` count), 6 connections at a time.
- CPU is 10 ms: no DOM parsing, no un-memoized Intl.
- Snowbird's API returns 500 for any foreign Origin. NWS returns 403 without a UA.
- MtnPowder sits behind Imperva; the browser fallback uses the same pure parser (`src/shared/mtnpowder.ts`).
- Deployed Workers freeze `Date.now()` during CPU work, so per-job timings show wall time only.
- D1 allows <= 50 queries per invocation.
- Vitest 5's fs module cache breaks the workerd pool; the `worker` project sets `fsModuleCache: false`.
- `biome migrate` rewrote `recommended: true` to `preset: "none"`; keep `"preset": "recommended"`.
