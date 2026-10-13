import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { isoUtc } from '../../shared/time.ts';
import { runTick } from '../cron/dispatcher.ts';
import worker from '../index.ts';
import { ytUnitsKey } from '../store/counters.ts';
import { clearStore, migrate } from '../store/test-db.ts';

async function get(path: string): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://utah.otakar.dev${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('/api/health', () => {
  it('sends the global API headers and the documented shape', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Build')).toBe('dev');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(['ok', 'version', 'generatedAt', 'cron', 'sources', 'youtube', 'cams', 'quotas']),
    );
    expect(body.sources).toEqual([]);
    expect(body.cron).toEqual({ lastTickAt: null, lastSlot: null, jobs: [], deferred: [] });
  });

  it('strict=1 is 503 before any cron tick and 200 after one', async () => {
    expect((await get('/api/health?strict=1')).status).toBe(503);
    await runTick(env, Date.now(), { sources: [] });
    const res = await get('/api/health?strict=1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; cron: { lastTickAt: string | null } };
    expect(body.ok).toBe(true);
    expect(body.cron.lastTickAt).not.toBeNull();
  });

  it('strict ignores blocked MtnPowder rows (browser fallback) but not other red critical rows', async () => {
    const now = Date.now();
    const put = env.DB.prepare(
      'INSERT INTO source_state (source_id, fetched_at, ok_at, status, fail_count) VALUES (?1, ?2, NULL, ?3, 3)',
    );
    await env.DB.batch([put.bind('resort:solitude', now, 'blocked'), put.bind('resort:deer-valley', now, 'blocked')]);
    await runTick(env, now, { sources: [] });
    expect((await get('/api/health?strict=1')).status).toBe(200);
    await put.bind('resort:brighton', now, 'blocked').run();
    const res = await get('/api/health?strict=1');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { failures: string[] }).failures).toEqual(['red:resort:brighton']);
  });

  it('cams from cams:status, youtube from yt:state + units, nws:points changes fail strict', async () => {
    const now = Date.now();
    const ago = (min: number) => isoUtc(now - min * 60_000);
    const cams = {
      'alta-superior': { online: true, asOf: ago(10), checkedAt: ago(1) }, // ok
      'alta-wildcat': { online: false, asOf: ago(10), checkedAt: ago(1) }, // offline
      'snowbird-peruvian-gulch': { online: true, asOf: null, checkedAt: ago(1) }, // live (HDRelay snapshot)
      'brighton-snowstake-skiutah': { online: true, asOf: ago(5), hidden: true, checkedAt: ago(1) }, // stale
      'alta-collins': { online: null, asOf: ago(120), checkedAt: ago(1) }, // stale
    };
    const yt = { v: 1, mode: 'api', unmapped: [{ videoId: 'a' }, { videoId: 'b' }] };
    const points = { checkedAt: ago(60), points: [], changes: [{ id: 'alta:base', field: 'grid' }], failed: [] };
    const put = env.DB.prepare(
      'INSERT INTO source_state (source_id, payload, fetched_at, ok_at, status, fail_count) VALUES (?1, ?2, ?3, ?3, ?4, 0)',
    );
    await env.DB.batch([
      put.bind('cams:status', JSON.stringify(cams), now, 'ok'),
      put.bind('yt:state', JSON.stringify(yt), now, 'ok'),
      put.bind('nws:points', JSON.stringify(points), now, 'ok'),
      env.DB.prepare('INSERT INTO counters (key, value, expires_at) VALUES (?1, 1200, ?2)').bind(
        ytUnitsKey(now),
        now + 9e6,
      ),
    ]);
    await runTick(env, now, { sources: [] });
    const body = (await (await get('/api/health')).json()) as Record<string, unknown>;
    expect(body.cams).toEqual({ total: 5, live: 1, ok: 1, stale: 2, offline: 1 });
    expect(body.youtube).toEqual({ mode: 'api', unitsToday: 1200, unmapped: 2, anomaly: true });
    expect(body.failures).toEqual(['nws-points:1']);
  });

  it('unknown routes: /api 404 and 405 are no-store JSON, other paths 404 text/plain', async () => {
    const missing = await get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('no-store');
    expect(await missing.json()).toEqual({ error: 'not-found' });
    const ctx = createExecutionContext();
    const post = await worker.fetch(new Request('https://utah.otakar.dev/api/health', { method: 'POST' }), env, ctx);
    expect(post.status).toBe(405);
    const asset = await get('/assets/gone-123.js');
    expect(asset.status).toBe(404);
    expect(asset.headers.get('Content-Type')).toMatch(/^text\/plain/);
    expect(asset.headers.get('Cache-Control')).toBe('no-store');
  });
});
