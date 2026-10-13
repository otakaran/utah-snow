import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { runTick } from '../cron/dispatcher.ts';
import worker from '../index.ts';
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
