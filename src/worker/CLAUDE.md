# src/worker

`index.ts` routes `/api/*` (health, snapshot, cams[/report], stake, drive, tracker, debug/probe) and runs `runTick` on cron;
`frames/` lists timelapse frames (KV archive, HDRelay, Prism, Roundshot; `available.ts` gates the providers). Wire types: `shared/types/`.

## Source contract (`sources/types.ts`, which also re-exports the only fetchx values adapters may use)
- One adapter per source: `sources/<id>.ts` + `<id>.test.ts` + `fixtures/<id>/<YYYYMMDD>-<tag>.<ext>` (+ `<id>/` helpers).
- `Source` = `{ id, staleAfterMin, rows, reads?, staleByRow?, rowsDue?(now), maxSubrequests(ctx), probes, fetch, parse }`.
- Job ids: `resort:<id>` (mtnpowder serves solitude + deer-valley), `avy`, `nws-grid:<resort>:<point>`, else the file name.
- `sources/maintenance.ts` runs `hdrelay-config`, `udot-cam-check`, `nws-points` (only it may import them); `rowsDue` = the due sub's row.

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
- `store/prune.ts` (slot 10 at 08Z, in the tick-start batch): frames > 26 h, expired counters, `drive_cache`/histories > 30 d.

## API conventions (`api/`, one file per route; `api/cams/` and `api/tracker/` hold route helpers)
- `http.ts` helpers: `json()`, ETag/304, cache helpers. Every `/api` response sends `X-Robots-Tag`, `Referrer-Policy`, `X-Content-Type-Options`.
- No CORS headers. `caches.default` only for snapshot, cams and stake (both via `edge.ts`). POST `/api/cams/report` bumps `yt:pending:{camId}`.
- `/api/drive` (`store/drive.ts`): 403 without `X-Requested-With`, 3 dp, 422 outside-wasatch; per Denver day 10 lookups a client
  and 20 OSRM misses in all (then 429); one miss lease (503); 6 OSRM calls 1.1 s apart; `drive_cache` 30 d; no caches.default.
- `/api/snapshot` sends `X-Build` = `BUILD_ID` (`http.ts`: Vite `define` `__BUILD_ID__`, `'dev'` under Vitest); the wall reloads on change.
- `/api/debug/probe`: the unknown-route 404 unless `X-Probe-Key` = `PROBE_KEY`. `/api/health?strict=1`: 503 until `cron:last`.
- `/api/tracker` (SQL in `store/tracker.ts` + `store/tracker/writes.ts`): GET no-store; POST one op; 409 carries `current`.
- `api/post-guard.ts` (both POSTs): 403 headers/Origin (localhost if `DEV=1`), 503 `no-salt`, shared `rl:*` 429, 422.

## Tests
- `unit` project (node): `sources/**` and `lib/**` tests. Adapter tests: field assertions on fixtures plus one gate failure.
- `worker` project (workerd, `cloudflare:workers` `env`/`exports`, `fsModuleCache: false`): `api/`, `cron/`, `frames/` tests.
- Fixtures: one live + <= 5 Wayback in-season files per source, <= 30 KB, from `pnpm fixtures` (new dated files; tests opt in).
- Worker tests call `migrate(env.DB)` / `clearStore(env.DB)` (store + tracker tables) from `store/test-db.ts`.
