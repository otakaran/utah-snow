# src/worker

`index.ts` routes `/api/*` (health, snapshot, debug/probe) and runs `runTick` on cron over every registered adapter.
Next: `/api/cams`, `/api/stake/*`. Row types other jobs read live in `src/shared/types/` (cams, forecast, youtube).

## Source contract (`sources/types.ts`)
- One adapter per source: `sources/<id>.ts` + `<id>.test.ts` + `fixtures/<id>/<YYYYMMDD>-<tag>.<ext>` (+ `<id>/` helpers).
- `Source` = `{ id, staleAfterMin, rows, reads?, staleByRow?, rowsDue?(now), maxSubrequests(ctx), probes, fetch, parse }`.
- `fetch` does all I/O through `ctx.fetch` (fetchx); never D1/KV. `parse` is pure; it throws `ValidationError` so rows keep last-good.
- Job ids: `resort:<id>` (mtnpowder serves solitude + deer-valley), `avy`, `nws-grid:<resort>:<point>`, else the file name.
- `sources/maintenance.ts` runs `hdrelay-config`, `udot-cam-check`, `nws-points` (only it may import them); `rowsDue` = the due sub's row.
- Adapters import only `src/shared/`, `config/`, `sources/types.ts` (fetchx error classes, `JSON_GET`, `getJson`) and own helpers.

## Dispatcher and budget (`cron/dispatcher.ts`)
- Slots and job ids come from `config/schedule.ts`; admit jobs while `sum(maxSubrequests) <= 45` (redirects and `caches.*` count).
- `MAX_CONN` = 5 fetches (6th slot free for KV). `cron:last` first; `cron/job.ts` writes each job in one batch (failure: `rowsDue` only).
- `runTick(env, t, { sources, fetchImpl })` -> `{ cron, ext, internal, logs }`; the matrix test (real SOURCES): <= 45 ext, <= 25 internal, 0 deferred.
- `sources/index.ts`: `SOURCES` == `SLOTS` job ids (`index.test.ts`); `staleAfterMin(row)` = `staleByRow[row]` ?? default.
- `probe-seed.ts` lists only hosts no adapter probes (prism-gcs, roundshot-snowbird, osrm); `probeList()` is the union.

## Storage
- Only `store/` touches D1 (<= 50 queries per invocation; `batch()`) and KV (`check-repo` flags `env.DB.*`, `env.FRAMES.*`, `.prepare(`).
- KV holds stake frames only (`store/frames.ts`): put, then the `stake_frames` row in the job batch; <= 2 puts/job; never `KV.list()`.
- `store/tick-state.ts` loads prev: rows + `reads`, counters `yt:pending`/`yt:units`, `resort_history:<id>` (3 days, slim).
- Success batch: rows (`offseason` for preseason resorts / off-season avy), `store/history.ts`, YouTube counters.
- `store/prune.ts` (slot 10 at 08Z, in the tick-start batch): frames > 26 h, expired counters, caches/histories > 30 d.

## API conventions (`api/`, one file per route)
- `http.ts` helpers: `json()`, ETag/304, cache helpers. Every `/api` response sends `X-Robots-Tag`, `Referrer-Policy`, `X-Content-Type-Options`.
- No CORS headers. `caches.default` only for snapshot, cams and stake.
- `/api/snapshot` sends `X-Build` = `BUILD_ID` (`http.ts`: Vite `define` `__BUILD_ID__`, `'dev'` under Vitest); the wall reloads on change.
- `/api/debug/probe` returns the same 404 JSON as an unknown route unless `X-Probe-Key` equals `PROBE_KEY`.
- `/api/health?strict=1` returns 503 with `failures[]` until the first cron tick has written `cron:last`.

## Tests
- `unit` project (node): `sources/**` and `lib/**` tests. Adapter tests: field assertions on fixtures plus one gate failure.
- `worker` project (workerd, `cloudflare:workers` `env`/`exports`): `api/**` and `cron/**` contract tests.
- The `worker` project sets `fsModuleCache: false` (Vitest 5 cache is unreadable from workerd).
- Fixtures: one live file plus <= 5 Wayback in-season files per source, each <= 30 KB, trimmed by `pnpm fixtures`.
- Worker tests call `migrate(env.DB)` / `clearStore(env.DB)` from `store/test-db.ts` (migrations via `?raw`, `raw.d.ts`).
