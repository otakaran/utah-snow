# src/worker

Status: `index.ts` is a placeholder (404 text/plain, no-store; empty `scheduled`). Everything below is the contract to build.

## Source contract (`sources/types.ts`)
- One adapter per source: `sources/<id>.ts` + `<id>.test.ts` + `fixtures/<id>/<YYYYMMDD>-<tag>.<ext>`.
- `Source` = `{ id, staleAfterMin, rows, maxSubrequests(ctx), probes, fetch(ctx), parse(raw, ctx) }`.
- `fetch` does all I/O through `ctx.fetch` (fetchx); never D1/KV. `parse` is pure; it throws `ValidationError` so rows keep last-good.
- Job ids: `resort:<id>` (mtnpowder serves solitude + deer-valley), `avy`, `nws-grid:<resort>:<point>`, else the file name.
- `hdrelay-config`, `udot-cam-check`, `nws-points` and the D1 prune run inside the `maintenance` job.
- Helpers go in a sibling folder of the same name once a file passes 250 lines (e.g. `roads/classify.ts`).
- Adapters import only `src/shared/`, `config/`, `sources/types.ts` and their own helper folder.

## Dispatcher and budget (`cron/dispatcher.ts`)
- Slots and job ids come from `config/schedule.ts`; admit jobs while `sum(maxSubrequests) <= 45` (redirects and `caches.*` count).
- At most 6 concurrent connections. Write `cron:last` first, then each job's rows as it settles.
- The matrix test covers every slot x keyed/keyless x morning x maintenance and fails over 45.

## Storage
- Only `store/` touches D1 and KV (`check-repo` flags `env.DB.*`, `env.FRAMES.*`, `.prepare('...')` elsewhere).
- KV holds stake frames only: put the value, then insert the `stake_frames` index row; never `KV.list()`.
- D1: <= 50 queries per invocation; use `batch()`.

## API conventions (`api/`, one file per route)
- `http.ts` helpers: `json()`, ETag/304, cache helpers. Every `/api` response sends `X-Robots-Tag`, `Referrer-Policy`, `X-Content-Type-Options`.
- No CORS headers. `caches.default` only for snapshot, cams and stake.
- `/api/snapshot` sends `X-Build` (the wall reloads when it differs from `__BUILD_ID__`).
- `/api/debug/probe` returns 404 unless `X-Probe-Key` equals `PROBE_KEY`.

## Tests
- `unit` project (node): `sources/**/*.test.ts` parse fixtures; field assertions plus one validation-gate failure.
- `worker` project (workerd, `cloudflare:workers` `env`/`exports`): `api/**` and `cron/**` contract tests.
- The `worker` project sets `fsModuleCache: false` (Vitest 5 cache is unreadable from workerd).
- Fixtures: one live file plus <= 5 Wayback in-season files per source, each <= 30 KB, trimmed by `pnpm fixtures`.
- Read migrations in tests with `import sql from '../../migrations/0001_init.sql?raw'` (`raw.d.ts`).
