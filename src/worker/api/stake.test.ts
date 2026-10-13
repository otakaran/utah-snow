import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { MIN, zonedToUtc } from '../../shared/time.ts';
import { altaMarkers, parseQuery, thin } from '../frames/archive.ts';
import worker from '../index.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import type { StakeFramesBody } from './stake.ts';

const ORIGIN = 'https://utah.otakar.dev';

async function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const listKey = (cam: string, hours: number, step: number) =>
  new Request(`${ORIGIN}/api/stake/${cam}/frames?hours=${hours}&step=${step}&b=dev`);

async function seed(cam: string, ts: readonly number[]): Promise<void> {
  const stmt = env.DB.prepare('INSERT INTO stake_frames (cam_id, t, bytes) VALUES (?1, ?2, ?3)');
  await env.DB.batch(ts.map((t) => stmt.bind(cam, t, 4000 + (t % 1000))));
}

const at = (local: string): number => zonedToUtc(local) ?? Number.NaN;

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
  for (const [cam, h, s] of [
    ['alta-collins-stake', 24, 5],
    ['alta-collins-stake', 2, 15],
    ['solitude-snowstake', 24, 5],
  ] as const) {
    await caches.default.delete(listKey(cam, h, s));
  }
});

describe('/api/stake/:id/frames', () => {
  it('lists the archive window oldest first, without frames younger than 120 s or older than the window', async () => {
    const now = Date.now();
    const inside = [now - 3 * 60 * MIN, now - 60 * MIN, now - 5 * MIN];
    await seed('alta-collins-stake', [now - 25 * 60 * MIN, ...inside, now - 30_000]);
    const res = await get('/api/stake/alta-collins-stake/frames');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120');
    expect(res.headers.get('X-Build')).toBe('dev');
    const b = (await res.json()) as StakeFramesBody;
    expect(b).toMatchObject({ camId: 'alta-collins-stake', provider: 'archive' });
    expect(b.videoId).toBeUndefined();
    expect(b.frames.map((f) => f.t)).toEqual(inside);
    const url = `/api/stake/alta-collins-stake/frame/${now - 5 * MIN}`;
    expect(b.frames[2]).toEqual({ t: now - 5 * MIN, thumb: url, full: url, bytes: 4000 + ((now - 5 * MIN) % 1000) });
    expect(b.markers.every((m) => m.kind === 'clear' || m.kind === 'pre-clear')).toBe(true);

    const again = await get('/api/stake/alta-collins-stake/frames', { 'If-None-Match': res.headers.get('ETag') ?? '' });
    expect(again.status).toBe(304);
  });

  it('step=15 keeps frames at least 15 min apart, newest first', async () => {
    const now = Date.now();
    const ts = Array.from({ length: 12 }, (_, i) => now - (5 + i * 5) * MIN).reverse(); // every 5 min, last 1 h
    await seed('alta-collins-stake', ts);
    const b = (await (await get('/api/stake/alta-collins-stake/frames?hours=2&step=15')).json()) as StakeFramesBody;
    const got = b.frames.map((f) => f.t);
    expect(got.at(-1)).toBe(now - 5 * MIN);
    expect(got).toHaveLength(4);
    for (let i = 1; i < got.length; i++) expect((got[i] ?? 0) - (got[i - 1] ?? 0)).toBeGreaterThanOrEqual(15 * MIN);
  });

  it("a live stake serves its -still twin's archive plus the live video id", async () => {
    const now = Date.now();
    await seed('solitude-snowstake-still', [now - 15 * MIN]);
    const b = (await (await get('/api/stake/solitude-snowstake/frames')).json()) as StakeFramesBody;
    expect(b.camId).toBe('solitude-snowstake');
    expect(b.videoId).toBe('lkEM6EC8NVA'); // the config seed until yt:state says otherwise
    expect(b.frames.map((f) => f.full)).toEqual([`/api/stake/solitude-snowstake-still/frame/${now - 15 * MIN}`]);
  });

  it('404 for an unknown cam and for cams without an archive timelapse', async () => {
    const unknown = await get('/api/stake/nope/frames');
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not-found' });
    for (const cam of ['alta-mount-superior', 'snowbird-hidden-peak', 'snowbird-snowstake']) {
      const res = await get(`/api/stake/${cam}/frames`);
      expect(res.status).toBe(404);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'not-found', code: 'no-timelapse' });
    }
  });
});

describe('/api/stake/:id/frame/:t', () => {
  it('serves the KV JPEG with immutable caching', async () => {
    const t = 1_700_000_123_456;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    await env.FRAMES.put(`cam:alta-collins-stake:${t}`, jpeg);
    await caches.default.delete(new Request(`${ORIGIN}/api/stake/alta-collins-stake/frame/${t}`));
    for (let i = 0; i < 2; i++) {
      const res = await get(`/api/stake/alta-collins-stake/frame/${t}`); // the second one is an edge hit
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
      expect(res.headers.get('X-Build')).toBe('dev');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
    }
  });

  it('a missing frame, a bad t or a non-archive cam is a no-store 404', async () => {
    await env.FRAMES.put('cam:alta-mount-superior:1700000000000', new Uint8Array([0xff, 0xd8, 0xff]));
    for (const path of [
      '/api/stake/alta-collins-stake/frame/1699999999999',
      '/api/stake/alta-collins-stake/frame/12abc',
      '/api/stake/alta-mount-superior/frame/1700000000000',
      '/api/stake/alta-collins-stake/frame/1/2',
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });
});

describe('archive helpers', () => {
  it('Alta markers: clear at 04:00/16:00 local inside the window, pre-clear = last frame in the 30 min before', () => {
    const frames = ['2026-12-28 03:20', '2026-12-28 03:40', '2026-12-28 03:55', '2026-12-28 04:05'].map((l) => ({
      t: at(l),
    }));
    const markers = altaMarkers(frames, at('2026-12-28 02:00'), at('2026-12-28 15:00'));
    expect(markers).toEqual([
      { t: at('2026-12-28 03:55'), kind: 'pre-clear', label: 'Before clear · 3:55 AM' },
      { t: at('2026-12-28 04:00'), kind: 'clear', label: 'Cleared · 4:00 AM' },
    ]);
    const overnight = altaMarkers([], at('2026-12-27 15:00'), at('2026-12-28 05:00'));
    expect(overnight.map((m) => m.t)).toEqual([at('2026-12-27 16:00'), at('2026-12-28 04:00')]);
  });

  it('thin and parseQuery', () => {
    const rows = [0, 5, 10, 15, 20, 31].map((m) => ({ t: m * MIN }));
    expect(thin(rows, 15).map((r) => r.t / MIN)).toEqual([0, 15, 31]); // walks back from the newest
    expect(thin(rows, 5)).toEqual(rows);
    expect(parseQuery(new URLSearchParams('hours=99&step=15'))).toEqual({ hours: 26, step: 15 });
    expect(parseQuery(new URLSearchParams('hours=0&step=7'))).toEqual({ hours: 1, step: 5 });
    expect(parseQuery(new URLSearchParams(''))).toEqual({ hours: 24, step: 5 });
  });
});
