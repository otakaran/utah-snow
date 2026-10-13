import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, isoUtc, MIN, zonedToUtc } from '../../shared/time.ts';
import type { StakeFramesBody } from '../../shared/types.ts';
import next from '../frames/fixtures/hdrelay/20261013-next.json?raw';
import camInit from '../frames/fixtures/prism/20261013-cam-init.json?raw';
import segments from '../frames/fixtures/prism/20261013-segmentlist.txt?raw';
import structure from '../frames/fixtures/roundshot/20261013-structure.json?raw';
import worker from '../index.ts';
import { clearStore, migrate } from '../store/test-db.ts';

const ORIGIN = 'https://utah.otakar.dev';

async function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const listKey = (cam: string, hours: number, step: number, suffix = '') =>
  new Request(`${ORIGIN}/api/stake/${cam}/frames?hours=${hours}&step=${step}&b=dev${suffix}`);

async function seed(cam: string, ts: readonly number[]): Promise<void> {
  const stmt = env.DB.prepare('INSERT INTO stake_frames (cam_id, t, bytes) VALUES (?1, ?2, ?3)');
  await env.DB.batch(ts.map((t) => stmt.bind(cam, t, 4000 + (t % 1000))));
}

const at = (local: string): number => zonedToUtc(local) ?? Number.NaN;

const row = (id: string, payload: unknown) =>
  env.DB.prepare(
    "INSERT INTO source_state (source_id, payload, fetched_at, ok_at, status, fail_count) VALUES (?1, ?2, ?3, ?3, 'ok', 0)",
  ).bind(id, JSON.stringify(payload), Date.now());

/** Answers outbound fetches by URL prefix (else 404) and records them. */
function upstream(routes: [prefix: string, res: () => Response][]): Request[] {
  const seen: Request[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init);
    seen.push(req);
    return routes.find(([prefix]) => req.url.startsWith(prefix))?.[1]() ?? new Response('', { status: 404 });
  });
  return seen;
}

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
  for (const [cam, h, s] of [
    ['alta-collins-stake', 24, 5],
    ['alta-collins-stake', 2, 15],
    ['solitude-snowstake', 24, 5],
    ['snowbird-snowstake', 24, 5],
    ['alta-mount-baldy', 24, 5],
    ['snowbird-hidden-peak', 24, 15],
    ['snowbird-hidden-peak-360', 24, 5],
  ] as const) {
    await caches.default.delete(listKey(cam, h, s));
    await caches.default.delete(listKey(cam, h, s, '&failed=1'));
  }
});
afterEach(() => vi.restoreAllMocks());

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

  it('404 for an unknown cam, a cam without a timelapse and a gated HDRelay archive not enabled yet', async () => {
    const unknown = await get('/api/stake/nope/frames');
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not-found' });
    for (const cam of ['alta-mount-superior', 'brighton-snowstake-skiutah', 'snowbird-peruvian-gulch']) {
      const res = await get(`/api/stake/${cam}/frames`);
      expect(res.status).toBe(404);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'not-found', code: 'no-timelapse' });
    }
  });
});

describe('/api/stake/:id/frames from providers (fixtures captured 2026-10-13)', () => {
  const NOW = 1_791_927_600_000; // 15:40 MDT
  const CAMERA = '8611e276-7ee5-42c0-b8cd-d9e1890e1cd4';
  const GCS = 'https://storage.googleapis.com/prism-cam-00088';
  const json = (text: string) => () => new Response(text, { headers: { 'content-type': 'application/json' } });
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('hdrelay: frames/next for the last 24 h (hours ignored) with our UA and no Referer, last-snow', async () => {
    const archive = { position: 'default', first: isoUtc(1_782_323_700_577), last: isoUtc(NOW), enabled: true };
    await env.DB.batch([
      row('cams:status', { 'snowbird-snowstake': { online: true, asOf: null, checkedAt: isoUtc(NOW), archive } }),
      row('hdrelay:config', {
        'snowbird-snowstake': { cameraId: CAMERA, hotlink: { enabled: true, time: NOW - HOUR } },
      }),
    ]);
    const seen = upstream([['https://img.hdrelay.com/api/frames/next?', json(next)]]);
    const res = await get('/api/stake/snowbird-snowstake/frames?hours=3');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120');
    const b = (await res.json()) as StakeFramesBody;
    expect(b).toMatchObject({ camId: 'snowbird-snowstake', provider: 'hdrelay' });
    expect(b.frames).toHaveLength(36);
    expect(b.frames[0]?.thumb).toBe(`https://img.hdrelay.com/frames/${CAMERA}/default/1791916800572/:/rs=h:270`);
    expect(b.markers).toEqual([{ t: NOW - HOUR, kind: 'last-snow', label: 'Last snow · 2:40 PM' }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toContain(`camera=${CAMERA}&position=default&time=${NOW - 24 * HOUR}&n=289&interval=300`);
    expect(seen[0]?.headers.get('Referer')).toBeNull();
    expect(seen[0]?.headers.get('User-Agent')).toMatch(/^utah-snow\/1\.0 /);
  });

  it('prism: cam_init frames plus the first MP4 folder whose segmentlist answers', async () => {
    const seen = upstream([
      ['https://php.prismcam.com/public/helpers/cam_init.php?cams=88&', json(camInit)],
      [`${GCS}/2026/10/12/timelapse/segmentlist.txt?`, () => new Response(segments)],
    ]);
    const b = (await (await get('/api/stake/alta-mount-baldy/frames')).json()) as StakeFramesBody;
    expect(b.provider).toBe('prism');
    expect(b.frames).toHaveLength(37);
    expect(b.mp4).toEqual({
      url: `${GCS}/2026/10/12/timelapse/00088_timelapse_720.mp4?t=${Math.floor(NOW / HOUR)}`,
      from: at('2026-10-12 15:00'),
      to: at('2026-10-13 14:00') + HOUR,
    });
    const paths = seen.map((r) => new URL(r.url).pathname);
    expect(paths).toContain('/prism-cam-00088/2026/10/13/timelapse/segmentlist.txt'); // tried first, 404
    expect(paths.some((p) => p.includes('/running/'))).toBe(false);
  });

  it('roundshot: one backend GET, redirects off -> daylight slots; the 360 strip reads structure.json', async () => {
    const location =
      'https://storage4.roundshot.com/5da7581da7f568.58906703/2026-10-13/15-30-00/2026-10-13-15-30-00_default.jpg';
    const seen = upstream([
      [
        'https://backend.roundshot.com/cams/44cfff4ff2a218a1178dbb105d95846a/default',
        () => new Response(null, { status: 302, headers: { location } }),
      ],
      ['https://snowbird.roundshot.com/structure.json', json(structure)],
    ]);
    const flat = (await (
      await get('/api/stake/snowbird-hidden-peak/frames?hours=3&step=15')
    ).json()) as StakeFramesBody;
    expect(flat).toMatchObject({ provider: 'roundshot', markers: [] });
    expect(flat.frames).toHaveLength(32); // 24 h of daylight 10-min slots, every 20 min at step 15
    expect(flat.frames.at(-1)?.full).toBe(location);
    expect(seen).toHaveLength(1); // no HEAD checks of slot URLs
    const pano = (await (await get('/api/stake/snowbird-hidden-peak-360/frames')).json()) as StakeFramesBody;
    expect(pano.frames.map((f) => f.t)).toEqual(
      ['07:10', '15:10', '15:20', '15:30'].map((hm) => at(`2026-10-13 ${hm}`)),
    );
  });

  it('an upstream failure is a no-store 502; the provider is asked again only after a minute', async () => {
    const failing = upstream([['https://php.prismcam.com/', () => new Response('oops', { status: 500 })]]);
    const bad = await get('/api/stake/alta-mount-baldy/frames?hours=2');
    expect(bad.status).toBe(502);
    expect(bad.headers.get('Cache-Control')).toBe('no-store');
    expect(await bad.json()).toEqual({ error: 'upstream', code: 'prism' });
    const asked = failing.length;
    expect((await get('/api/stake/alta-mount-baldy/frames?hours=5')).status).toBe(502); // same key: hours ignored
    expect(failing).toHaveLength(asked);
    await caches.default.delete(listKey('alta-mount-baldy', 24, 5, '&failed=1')); // the minute is up
    upstream([['https://php.prismcam.com/', json(camInit)]]);
    const good = await get('/api/stake/alta-mount-baldy/frames');
    expect(good.status).toBe(200);
    expect(((await good.json()) as StakeFramesBody).frames).toHaveLength(37);
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
