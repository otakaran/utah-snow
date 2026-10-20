// POST /api/debug/tick: the fallback for Cloudflare cron outages (.github/workflows/tick.yml, every 5 min).
// Gate: the probe route's (X-Probe-Key = PROBE_KEY, constant-time; else the unknown-route 404). Past it, the
// Scheduler DO runs the tick (scheduler.ts) exactly as it does for `scheduled`: it skips when cron:last started
// < 4 min ago or a tick is already running, so the real cron and this fallback can both run; it also arms the
// alarm chain. The response is the DO's TickOutcome. no-store.
import { json, notFound } from '../http.ts';
import { safeEqual } from '../lib/hash.ts';
import { tickViaScheduler } from '../scheduler.ts';

/** Test seams: the tick and the clock. */
export interface DebugTickDeps {
  tick?: typeof tickViaScheduler;
  now?: () => number;
}

export function makeDebugTick(deps: DebugTickDeps = {}) {
  const tick = deps.tick ?? tickViaScheduler;
  const clock = deps.now ?? (() => Date.now());
  return async (req: Request, env: Env): Promise<Response> => {
    if (!safeEqual(req.headers.get('X-Probe-Key'), env.PROBE_KEY)) return notFound();
    return json(await tick(env, clock()));
  };
}

export const debugTick = makeDebugTick();
