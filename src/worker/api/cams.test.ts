import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMS } from '../../../config/cams/index.ts';
import { isoUtc as iso, MIN } from '../../shared/time.ts';
import worker from '../index.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import type { CamsBody } from './cams/state.ts';

async function get(headers: Record<string, string> = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request('https://utah.otakar.dev/api/cams', { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const row = (id: string, payload: unknown, at: number) =>
  env.DB.prepare(
    "INSERT INTO source_state (source_id, payload, fetched_at, ok_at, status, fail_count) VALUES (?1, ?2, ?3, ?3, 'ok', 0)",
  ).bind(id, JSON.stringify(payload), at);
const frame = (camId: string, t: number) =>
  env.DB.prepare('INSERT INTO stake_frames (cam_id, t, bytes) VALUES (?1, ?2, 5000)').bind(camId, t);

const slot = (videoId: string, status: string, extra: Record<string, unknown> = {}) => ({
  videoId,
  status,
  title: null,
  actualStartTime: null,
  thumbKind: 'live',
  maxres: null,
  lastLiveAt: null,
  deadSince: null,
  apiAt: null,
  source: 'api',
  etag: null,
  etagAt: null,
  csMisses: 0,
  ...extra,
});

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
  await caches.default.delete(new Request('https://utah.otakar.dev/api/cams?b=dev'));
});

describe('/api/cams', () => {
  it('an empty store still lists every registry cam, with seeds and server placeholders filled', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(res.headers.get('ETag')).toMatch(/^W\/"[0-9a-f]{20}"$/);
    expect(res.headers.get('X-Build')).toBe('dev');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    const b = (await res.json()) as CamsBody;
    expect(b.cams.map((c) => c.id)).toEqual(CAMS.map((c) => c.id));
    expect(b.cams).toHaveLength(108);
    expect(b.unmapped).toEqual([]);
    const cams = new Map(b.cams.map((c) => [c.id, c]));

    expect(cams.get('solitude-powderhorn')).toMatchObject({
      status: 'unknown',
      online: null,
      live: { type: 'youtube', videoId: 'xNER0JHrqLg' },
      still: {
        card: 'https://i.ytimg.com/vi/xNER0JHrqLg/mqdefault_live.jpg?t={m5}',
        detail: 'https://i.ytimg.com/vi/xNER0JHrqLg/hqdefault_live.jpg?t={m5}', // no maxres HEAD yet
      },
      timelapse: { provider: 'none', available: false },
    });
    expect(cams.get('solitude-honeycomb-return')).toMatchObject({
      status: 'seasonal-off',
      live: null,
      still: { card: '' },
    });
    expect(cams.get('snowbird-snowstake')?.live).toEqual({
      type: 'hls',
      url: 'https://b15.hdrelay.com/camera/8611e276-7ee5-42c0-b8cd-d9e1890e1cd4/relay/playlist.m3u8',
    });
    expect(cams.get('snowbird-hidden-peak-360')?.live).toEqual({
      type: 'iframe',
      url: 'https://snowbird.roundshot.com/tv/',
    });
    expect(cams.get('udot-167778')).toMatchObject({ status: 'ok', online: null, live: null });
    const collins = cams.get('alta-collins-stake');
    expect(collins).toMatchObject({ status: 'unknown', timelapse: { provider: 'archive', available: false } });
    expect(collins?.latestFrame).toBeUndefined();
  });

  it('merges cams:status, yt:state, hdrelay:config, udot:cams and stake_frames by the status rules', async () => {
    const now = Date.now();
    const ok = { online: true, checkedAt: iso(now) };
    await env.DB.batch([
      row(
        'cams:status',
        {
          'alta-mount-superior': { ...ok, asOf: iso(now - 10 * MIN) },
          'alta-sugarloaf-peak': { ...ok, asOf: iso(now - 120 * MIN) },
          'alta-east-greeley': { ...ok, online: false, asOf: iso(now - 5 * MIN) },
          'brighton-snowstake-skiutah': { ...ok, asOf: iso(now - 5 * MIN), hidden: true },
          'snowbasin-snowstake': { ...ok, asOf: null, archive: { first: null, last: null, enabled: false } },
          'snowbird-little-cloud': { ...ok, asOf: null, archive: { first: null, last: iso(now), enabled: true } },
          'alta-albion-basin': { ...ok, asOf: null, archive: { first: null, last: null, enabled: false } },
        },
        now - MIN,
      ),
      row(
        'hdrelay:config',
        {
          'snowbird-peruvian-gulch': { online: false, host: '//b15.hdrelay.com', cameraId: 'x' },
          'snowbird-little-cloud': {
            online: true,
            host: '//b16.hdrelay.com',
            cameraId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          },
          'snowbird-mineral-basin': { online: null, gone: true, host: '//evil.example.com', cameraId: 'x' },
        },
        now - 2 * MIN,
      ),
      row('udot:cams', { 'udot-167778': { online: false, checkedAt: iso(now) } }, now - 3 * MIN),
      row(
        'yt:state',
        {
          v: 1,
          mode: 'api',
          slots: {
            'brighton-top-of-crest': slot('Zv8HYwaXjBg', 'live', { maxres: true }),
            'brighton-parking-lot': slot('4a-3iEM7bHk', 'live', { thumbKind: 'custom' }),
            'brighton-explorer': slot('vMwQRjlfqtA', 'offline'),
          },
          unmapped: [{ videoId: 'abcdefghijk', channel: 'brighton', title: 'New cam', extra: 1 }],
        },
        now - 4 * MIN,
      ),
      frame('alta-collins-stake', now - 10 * MIN),
      frame('alta-collins-stake', now - 30_000), // too fresh to serve: KV may lag
      frame('solitude-snowstake-still', now - 20 * MIN),
    ]);
    const b = (await (await get()).json()) as CamsBody;
    expect(b.generatedAt).toBe(iso(now - 30_000));
    expect(b.unmapped).toEqual([{ videoId: 'abcdefghijk', channel: 'brighton', title: 'New cam' }]);
    const cams = new Map(b.cams.map((c) => [c.id, c]));

    expect(cams.get('alta-mount-superior')).toMatchObject({ status: 'ok', online: true });
    expect(cams.get('alta-sugarloaf-peak')?.status).toBe('stale');
    expect(cams.get('alta-east-greeley')?.status).toBe('offline');
    expect(cams.get('brighton-snowstake-skiutah')?.status).toBe('stale');
    expect(cams.get('snowbird-peruvian-gulch')).toMatchObject({ status: 'offline', online: false });
    expect(cams.get('snowbird-little-cloud')).toMatchObject({
      status: 'live',
      online: true,
      live: { url: 'https://b16.hdrelay.com/camera/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/relay/playlist.m3u8' },
      still: { card: 'https://b16.hdrelay.com/camera/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/snapshot?t={m}' },
    });
    const mineral = cams.get('snowbird-mineral-basin');
    expect(mineral?.status).toBe('offline');
    expect(mineral?.still.card.startsWith('https://b15.hdrelay.com/camera/')).toBe(true); // foreign host ignored
    expect(cams.get('udot-167778')).toMatchObject({ status: 'offline', online: false });
    expect(cams.get('brighton-top-of-crest')).toMatchObject({
      status: 'live',
      online: true,
      still: { wall: 'https://i.ytimg.com/vi/Zv8HYwaXjBg/maxresdefault_live.jpg?t={m5}' },
    });
    expect(cams.get('brighton-parking-lot')).toMatchObject({
      still: { card: '', detail: '', wall: '' },
      live: { type: 'youtube', videoId: '4a-3iEM7bHk' },
    });
    expect(cams.get('brighton-explorer')).toMatchObject({ status: 'offline', online: false });

    expect(cams.get('alta-collins-stake')).toMatchObject({
      status: 'ok',
      asOf: iso(now - 30_000),
      latestFrame: `/api/stake/alta-collins-stake/frame/${now - 10 * MIN}`,
      timelapse: { provider: 'archive', available: true },
    });
    expect(cams.get('solitude-snowstake')).toMatchObject({
      latestFrame: `/api/stake/solitude-snowstake-still/frame/${now - 20 * MIN}`,
      timelapse: { provider: 'archive', available: true },
    });
    // Provider timelapses (frames/available.ts): active HDRelay archives unless cam-status disabled them, gated ones
    // only once it enabled them; Prism unless cam_init listed nothing; Roundshot unless offline.
    const tl = (id: string) => cams.get(id)?.timelapse;
    expect(tl('snowbird-snowstake')).toEqual({ provider: 'hdrelay', available: true });
    expect(tl('snowbasin-snowstake')).toEqual({ provider: 'hdrelay', available: false });
    expect(tl('snowbird-little-cloud')).toEqual({ provider: 'hdrelay', available: true });
    expect(tl('snowbird-mineral-basin')).toEqual({ provider: 'hdrelay', available: false });
    expect(tl('alta-mount-baldy')).toEqual({ provider: 'prism', available: true });
    expect(tl('alta-albion-basin')).toEqual({ provider: 'prism', available: false });
    expect(tl('snowbird-hidden-peak')).toEqual({ provider: 'roundshot', available: true });
  });

  it('200 with a weak ETag, then 304 with the same ETag and an empty body', async () => {
    const first = await get();
    const etag = first.headers.get('ETag') ?? '';
    expect(etag).not.toBe('');
    const second = await get({ 'If-None-Match': etag });
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
    expect(second.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(second.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(await second.text()).toBe('');
  });
});
