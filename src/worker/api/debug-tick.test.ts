import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isoUtc, MIN } from '../../shared/time.ts';
import type { runTick } from '../cron/dispatcher.ts';
import worker from '../index.ts';
import { cronLastStmt } from '../store/source-state.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import { makeDebugTick } from './debug-tick.ts';

const KEY = 'test-probe-key';
const testEnv = { ...env, PROBE_KEY: KEY };
const NOW = Date.now();
const URL_TICK = 'https://utah.otakar.dev/api/debug/tick';

const post = (key?: string) => new Request(URL_TICK, { method: 'POST', headers: key ? { 'X-Probe-Key': key } : {} });
const viaWorker = (req: Request, e: Env = testEnv) => Promise.resolve(worker.fetch(req, e, createExecutionContext()));
const seedLast = (minAgo: number) =>
  cronLastStmt(env.DB, { slot: 3, startedAt: NOW - minAgo * MIN, jobs: [], deferred: [], suspects: [] }).run();

/** A runTick stand-in: never touches D1 or the network. */
function fakeTick() {
  return vi.fn<typeof runTick>(async (_env, t) => ({
    cron: { slot: 7, startedAt: t, jobs: ['avy', 'nws-alerts'], deferred: ['udot'], suspects: [] },
    morning: false,
    maintenance: false,
    pruned: false,
    ext: 4,
    internal: 4,
    logs: [],
  }));
}

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('POST /api/debug/tick', () => {
  it('404 like an unknown route with no key, a wrong key, or no secret set; never ticks', async () => {
    const unknown = await viaWorker(new Request('https://utah.otakar.dev/api/nope', { method: 'POST' }));
    for (const res of [
      await viaWorker(post()),
      await viaWorker(post('wrong-key')),
      await viaWorker(post(KEY), { ...env, PROBE_KEY: '' }),
    ]) {
      expect(res.status).toBe(unknown.status);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'not-found' });
    }
    expect(unknown.status).toBe(404);
    const tick = fakeTick();
    expect(
      (await makeDebugTick({ runTick: tick, now: () => NOW })(post('wrong-key'), testEnv, createExecutionContext()))
        .status,
    ).toBe(404);
    expect(tick).not.toHaveBeenCalled();
  });

  it('200 skipped:fresh when cron:last is 1 min old (real route, no tick)', async () => {
    await seedLast(1);
    const res = await viaWorker(post(KEY));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ skipped: 'fresh', lastTickAt: isoUtc(NOW - MIN) });
  });

  it('200 ran:true with the injected runTick when cron:last is absent or 10 min old', async () => {
    for (const minAgo of [null, 10]) {
      if (minAgo !== null) await seedLast(minAgo);
      const tick = fakeTick();
      const res = await makeDebugTick({ runTick: tick, now: () => NOW })(post(KEY), testEnv, createExecutionContext());
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ ran: true, slot: 7, jobs: ['avy', 'nws-alerts'], deferred: ['udot'] });
      expect(tick).toHaveBeenCalledExactlyOnceWith(testEnv, NOW);
    }
  });
});
