// POST /api/debug/tick: the fallback for Cloudflare cron outages (.github/workflows/tick.yml, every 5 min).
// Gate: the probe route's (X-Probe-Key = PROBE_KEY, constant-time; else the unknown-route 404). When cron:last
// started < 4 min ago it skips, so the real cron and this fallback can both run; else it awaits runTick exactly
// like `scheduled` does. no-store.
import { isoUtc, MIN } from '../../shared/time.ts';
import { runTick } from '../cron/dispatcher.ts';
import { json, notFound } from '../http.ts';
import { safeEqual } from '../lib/hash.ts';
import { readCronLastAt } from '../store/source-state.ts';

const FRESH_MS = 4 * MIN;

/** Test seams: the tick and the clock. */
export interface DebugTickDeps {
  runTick?: typeof runTick;
  now?: () => number;
}

export function makeDebugTick(deps: DebugTickDeps = {}) {
  const tick = deps.runTick ?? runTick;
  const clock = deps.now ?? (() => Date.now());
  return async (req: Request, env: Env): Promise<Response> => {
    if (!safeEqual(req.headers.get('X-Probe-Key'), env.PROBE_KEY)) return notFound();
    const now = clock();
    const last = await readCronLastAt(env.DB);
    if (last !== null && now - last < FRESH_MS) return json({ skipped: 'fresh', lastTickAt: isoUtc(last) });
    const { cron } = await tick(env, now);
    return json({ ran: true, slot: cron.slot, jobs: cron.jobs, deferred: cron.deferred });
  };
}

export const debugTick = makeDebugTick();
