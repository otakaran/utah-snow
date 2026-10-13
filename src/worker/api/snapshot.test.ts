import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Snapshot } from '../../shared/types.ts';
import worker from '../index.ts';
import { clearStore, migrate } from '../store/test-db.ts';

async function get(headers: Record<string, string> = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request('https://utah.otakar.dev/api/snapshot', { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
  await caches.default.delete(new Request('https://utah.otakar.dev/api/snapshot?b=dev'));
});

describe('/api/snapshot', () => {
  it('an empty store still yields a complete Snapshot', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('ETag')).toBe('W/"s-0-0"');
    const snap = (await res.json()) as Snapshot;
    expect(snap.v).toBe(1);
    expect(Object.keys(snap.resorts)).toHaveLength(6);
    expect(Object.keys(snap.forecast)).toHaveLength(12);
    expect(Object.keys(snap.roads)).toEqual(['lcc', 'bcc', 'parleys', 'snowbasin']);
    expect(snap.resorts.alta).toMatchObject({ data: null, meta: { source: 'resort:alta', okAt: null } });
    expect(snap.sources).toEqual([]);
  });

  it('200 with a weak ETag, then 304 with the same ETag and an empty body', async () => {
    const t = Date.now();
    await env.DB.prepare(
      "INSERT INTO source_state (source_id, payload, fetched_at, ok_at, status, fail_count) VALUES ('roads:lcc', ?1, ?2, ?2, 'ok', 0)",
    )
      .bind('{"corridor":"lcc","state":"open"}', t)
      .run();
    const first = await get();
    const etag = first.headers.get('ETag') ?? '';
    expect(etag).toBe(`W/"s-${t}-1"`);
    const snap = (await first.json()) as Snapshot;
    expect(snap.roads.lcc.data).toEqual({ corridor: 'lcc', state: 'open' });
    expect(snap.roads.lcc.meta).toMatchObject({ status: 'ok', staleAfterMin: 25, failCount: 0 });
    expect(snap.generatedAt).toBe(new Date(t).toISOString());

    const second = await get({ 'If-None-Match': etag });
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
    expect(second.headers.get('X-Build')).toBe('dev');
    expect(await second.text()).toBe('');
  });

  it("drops snowbird's private trailsEtag from the public block", async () => {
    const payload = JSON.stringify({ id: 'snowbird', trails: { open: 1 }, trailsEtag: 'W/"1a-x"', gates: [] });
    await env.DB.prepare(
      "INSERT INTO source_state (source_id, payload, fetched_at, ok_at, status, fail_count) VALUES ('resort:snowbird', ?1, 1, 1, 'ok', 0)",
    )
      .bind(payload)
      .run();
    const snap = (await (await get()).json()) as Snapshot;
    expect(snap.resorts.snowbird.data).toEqual({ id: 'snowbird', trails: { open: 1 }, gates: [] });
  });
});
