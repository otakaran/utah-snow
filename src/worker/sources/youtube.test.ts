import { describe, expect, it } from 'vitest';
import { isoToMs } from '../../shared/time.ts';
import liveText from './fixtures/youtube/20261012-live.json?raw';
import synthText from './fixtures/youtube/youtube-synthetic.json?raw';
import { type FetchCtx, type FetchOpts, type FetchX, type PrevRows, ValidationError } from './types.ts';
import { type YtRaw, type YtState, youtube } from './youtube.ts';

interface Res {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}
type Route = (url: string) => Res;
type Video = { id: string; snippet: object; liveStreamingDetails?: object };

const MIN = 60_000;
const T0 = isoToMs('2026-10-13T01:55:00Z') as number; // slot 11 of the hour; the slot passed is what counts
const J0 = isoToMs('2026-01-17T14:55:00Z') as number;
const live = JSON.parse(liveText);
const syn = JSON.parse(synthText);

function fakeFetch(route: Route): FetchX & { calls: string[] } {
  const calls: string[] = [];
  const fx = async (url: string, opts: FetchOpts = {}) => {
    calls.push(url);
    const r = route(url);
    const data = opts.body === 'none' ? null : JSON.stringify(r.body ?? {});
    return { status: r.status, url, headers: new Headers(r.headers), data, bytes: 0, blocked: false, wallMs: 0 };
  };
  return Object.assign(fx, { remaining: () => 45 - calls.length, used: () => calls.length, calls }) as never;
}

async function tick(route: Route, slot: number, now: number, prev: PrevRows, keyed = false) {
  const fx = fakeFetch(route);
  const secrets = keyed ? { yt: 'test-key' } : {};
  const ctx: FetchCtx = { fetch: fx, now, slot, morning: false, keyed: { yt: keyed, udot: false }, secrets, prev };
  const raw = await youtube.fetch(ctx);
  const st = youtube.parse(raw, { now, prev }).rows['yt:state'] as YtState;
  const max = youtube.maxSubrequests(ctx);
  expect(fx.calls.length).toBeLessThanOrEqual(max);
  expect(JSON.stringify(st)).not.toContain('test-key');
  return { st, raw, calls: fx.calls, max, slot: (cam: string) => st.slots[cam] };
}

const lastSeg = (url: string) => new URL(url).pathname.split('/').pop() ?? '';

/** Serves the 2026-10-12 HEAD capture; round 0 or 1, with per-handle overrides. */
function liveRoute(round: 0 | 1, csOverride: Record<string, number> = {}): Route {
  const r = live.rounds[round];
  return (url): Res => {
    const u = new URL(url);
    if (u.hostname === 'camstreamer.com') {
      const h = lastSeg(url);
      if (csOverride[h]) return { status: csOverride[h] };
      return { status: r.camstreamer[h].status, headers: { location: r.camstreamer[h].location } };
    }
    if (u.hostname === 'i.ytimg.com') {
      const [, , id, file] = u.pathname.split('/');
      if (file === 'maxresdefault_live.jpg') return { status: live.maxres[id as string] ?? 200 };
      const t = r.hqdefault_live[id as string];
      return t ? { status: t.status, headers: t.etag ? { etag: t.etag } : {} } : { status: 404 };
    }
    if (u.hostname === 'www.googleapis.com') return live.api403;
    throw new Error(`unexpected request ${url}`);
  };
}

/** A fake Data API + CamStreamer + i.ytimg serving the synthetic in-season catalog. */
function apiRoute(phase: 'earlier' | 'now', ended: string[] = []): Route {
  const cat = new Map<string, Video>(syn.videos.map((v: Video) => [v.id, v]));
  const cs: Record<string, string | null> = { ...syn.camstreamer };
  if (phase === 'earlier') {
    for (const v of syn.earlier.videos as Video[]) cat.set(v.id, v);
    Object.assign(cs, syn.earlier.camstreamer);
  }
  for (const id of ended) {
    const v = cat.get(id) as Video;
    const lsd = { ...v.liveStreamingDetails, actualEndTime: '2026-01-17T15:30:00Z' };
    cat.set(id, { ...v, snippet: { ...v.snippet, liveBroadcastContent: 'none' }, liveStreamingDetails: lsd });
  }
  return (url): Res => {
    const u = new URL(url);
    if (u.hostname === 'camstreamer.com') {
      const loc = cs[lastSeg(url)];
      return loc ? { status: 302, headers: { location: loc } } : { status: 200 };
    }
    if (u.hostname === 'i.ytimg.com') {
      const id = u.pathname.split('/')[2] as string;
      if (syn.maxres404.includes(id)) return { status: 404 };
      return { status: 200, headers: { etag: syn.customEtag[id] ?? '"4242"' } };
    }
    expect(u.searchParams.get('key')).toBe('test-key');
    if (u.pathname.endsWith('/videos')) {
      const ids = (u.searchParams.get('id') ?? '').split(',');
      return { status: 200, body: { items: ids.map((id) => cat.get(id)).filter(Boolean) } };
    }
    if (u.pathname.endsWith('/playlistItems')) {
      return { status: 200, body: { items: syn.playlists[u.searchParams.get('playlistId') ?? ''] ?? [] } };
    }
    throw new Error(`unexpected request ${url}`);
  };
}

describe('youtube keyless (live capture 2026-10-12)', () => {
  it('slot 3: 9 CamStreamer + 8 ETag HEADs; seeds and candidates fill slots, the stake is never promoted', async () => {
    const t = await tick(liveRoute(0), 3, T0, {});
    expect([t.calls.length, t.max]).toEqual([17, 17]);
    expect(t.st).toMatchObject({ mode: 'keyless', unitsTick: 0, etagCursor: 8 });
    expect(t.slot('deer-valley-snow-park')).toMatchObject({ videoId: 'QozKoFs-hL0', status: 'unknown', csMisses: 0 });
    expect(t.slot('deer-valley-sultan')?.videoId).toBe('sAjdqw-lzgI');
    expect(t.slot('deer-valley-ontario-snowstake-live')).toMatchObject({ videoId: null, status: 'offline' });
    expect(t.slot('brighton-great-western')).toMatchObject({ videoId: null, status: 'offline' });
    expect(t.slot('brighton-parking-lot')).toMatchObject({ thumbKind: 'custom', etag: '"1775247294"' });
    expect(t.calls.some((u) => u.includes('_-jBmcnsK6s') || u.includes('youtube.com/'))).toBe(false);
  });

  it('moved ETag counters mean live, custom thumbnails stay unknown, hints decay after 4 h', async () => {
    const t1 = await tick(liveRoute(0), 3, T0, {});
    const t2 = await tick(liveRoute(1), 7, T0 + 20 * MIN, { 'yt:state': t1.st });
    const t3 = await tick(liveRoute(1), 11, T0 + 40 * MIN, { 'yt:state': t2.st });
    expect(t3.calls.length).toBe(8);
    expect(t3.calls.every((u) => u.includes('/hqdefault_live.jpg'))).toBe(true);
    expect(t3.slot('brighton-molly-greens')).toMatchObject({ status: 'live', source: 'etag', etag: '"14587"' });
    expect(t3.slot('brighton-top-of-crest')?.status).toBe('live');
    expect(t3.slot('brighton-parking-lot')).toMatchObject({ status: 'unknown', thumbKind: 'custom' });
    expect(t3.slot('solitude-apex-sunrise')).toMatchObject({ thumbKind: 'custom', status: 'unknown' });
    const t4 = await tick(liveRoute(1), 3, T0 + 300 * MIN, { 'yt:state': t3.st });
    expect(t4.slot('brighton-molly-greens')?.status).toBe('unknown');
  });

  it('yt:pending cams are checked first; 2 CamStreamer misses mean offline', async () => {
    const hoodoo = { r5HqNCcbTMOt3gyc1tFVYWWxhLSdTikzwsOxVrRY: 200 };
    const t1 = await tick(liveRoute(0), 3, T0, {});
    const prev = { 'yt:state': t1.st, 'yt:pending': ['deer-valley-hoodoo', 'not-a-cam'] };
    const t2 = await tick(liveRoute(1, hoodoo), 7, T0 + 20 * MIN, prev);
    expect(t2.calls.find((u) => u.includes('i.ytimg.com'))).toContain('/RaX_MhXETq4/');
    expect(t2.slot('deer-valley-hoodoo')).toMatchObject({ csMisses: 1, status: 'unknown' });
    const t3 = await tick(liveRoute(1, hoodoo), 3, T0 + 40 * MIN, { 'yt:state': t2.st });
    expect(t3.slot('deer-valley-hoodoo')).toMatchObject({ csMisses: 2, status: 'offline' });
  });

  it('keyed but the API answers 403: the tick runs keyless (6 ETag HEADs in lite slot 11), no discovery', async () => {
    const t = await tick(liveRoute(0), 11, T0, {}, true);
    expect([t.calls.length, t.max]).toEqual([7, 7]);
    expect(t.raw.liveness).toMatchObject({ status: 403, items: null });
    expect(t.st).toMatchObject({ mode: 'keyless', unitsTick: 1 });
    expect(t.calls.filter((u) => u.includes('googleapis')).length).toBe(1);
    const html: Route = (url) => (url.includes('googleapis') ? { status: 200, body: '<html>' } : liveRoute(0)(url));
    const t2 = await tick(html, 3, T0, {}, true); // a 200 that is not a videos.list payload counts as a failure
    expect(t2.st.mode).toBe('keyless');
  });
});

describe('youtube keyed (synthetic in-season, Data API)', () => {
  it('liveness, CamStreamer candidates, hourly and death discovery, quota units', async () => {
    const p1 = await tick(apiRoute('earlier'), 7, J0, {}, true);
    expect([p1.calls.length, p1.max]).toEqual([18, 24]);
    expect(p1.st).toMatchObject({ mode: 'api', unitsTick: 1 });
    const videosCall = p1.calls.find((u) => u.includes('/videos?')) ?? '';
    expect(videosCall).toContain('part=snippet,liveStreamingDetails,status&id=');
    expect(videosCall).toContain('fields=items(id,snippet(channelId,title,liveBroadcastContent),liveStreamingDetails(');
    expect(p1.slot('solitude-snowstake')).toMatchObject({ videoId: 'lkEM6EC8NVA', status: 'live', source: 'api' });
    expect(p1.slot('deer-valley-sterling')).toMatchObject({ videoId: 'iNdfTLilLlU', status: 'live' });
    expect(p1.slot('deer-valley-galena')?.status).toBe('offline'); // not embeddable
    expect(p1.slot('deer-valley-hoodoo')).toMatchObject({ status: 'live', csMisses: 1 }); // API beats CamStreamer
    expect(p1.slot('deer-valley-ontario-snowstake-live')?.videoId).toBeNull();
    expect(p1.slot('brighton-explorer')?.maxres).toBe(false);
    expect(p1.slot('brighton-parking-lot')).toMatchObject({ maxres: true, thumbKind: 'custom' });

    const p2 = await tick(apiRoute('now'), 3, J0 + 20 * MIN, { 'yt:state': p1.st }, true);
    expect([p2.calls.length, p2.max]).toEqual([24, 24]);
    expect(p2.st.unitsTick).toBe(7);
    expect(p2.slot('solitude-snowstake')).toMatchObject({ videoId: 'Q7nS3wStk26', status: 'live', deadSince: null });
    expect(p2.st.retries).toEqual({ solitude: 2 });
    expect(p2.slot('deer-valley-sterling')).toMatchObject({ videoId: 'S7erlingCam', status: 'live' });
    expect(p2.slot('brighton-great-western')).toMatchObject({ videoId: 'RPIfUKjRQgI', status: 'live' });
    expect(p2.slot('solitude-summit-express')?.videoId).toBe('rUXoOLxKKX4');
    expect(p2.slot('solitude-eagle-express')).toMatchObject({ videoId: null, status: 'offline' });
    expect(p2.st.unmapped).toEqual([
      { videoId: 'HailPeakCam', channel: 'deer-valley', title: 'Hail Peak Express Livestream' },
    ]);
    expect(p2.st.seen.XLzKPufaAts).toMatchObject({ channel: 'brighton', live: false });
    expect(p2.st.lastDiscovery).toEqual({
      brighton: J0 + 20 * MIN,
      solitude: J0 + 20 * MIN,
      'deer-valley': J0 + 20 * MIN,
    });

    const prev3 = { 'yt:state': p2.st, 'yt:units': 8 };
    const p3 = await tick(apiRoute('now', ['Q7nS3wStk26']), 11, J0 + 40 * MIN, prev3, true);
    expect([p3.calls.length, p3.max]).toEqual([2, 7]); // liveness + the Solitude playlist (nothing new to classify)
    expect(p3.slot('solitude-snowstake')).toMatchObject({ status: 'offline', deadSince: J0 + 40 * MIN });
    expect(p3.st).toMatchObject({ unitsTick: 2, retries: { solitude: 2 } });
  });

  it('above 1,000 units today only death-triggered discovery runs', async () => {
    const t = await tick(apiRoute('now'), 3, J0, { 'yt:units': 1200 }, true);
    expect(t.calls.some((u) => u.includes('playlistItems'))).toBe(false);
    expect(t.st.unitsTick).toBe(1);
  });
});

describe('youtube gates', () => {
  it('maxSubrequests: keyless 17/17/8, keyed 24/24/7 in slots 3/7/11', () => {
    const at = (slot: number, yt: boolean) =>
      youtube.maxSubrequests({ slot, keyed: { yt, udot: false }, secrets: yt ? { yt: 'k' } : {} } as FetchCtx);
    expect([3, 7, 11].map((s) => at(s, false))).toEqual([17, 17, 8]);
    expect([3, 7, 11].map((s) => at(s, true))).toEqual([24, 24, 7]);
  });

  it('a garbage or unanswered payload throws ValidationError', () => {
    const ctx = { now: T0, prev: {} };
    expect(() => youtube.parse('<html>garbage</html>' as unknown as YtRaw, ctx)).toThrow(ValidationError);
    expect(() => youtube.parse({ v: 1, cs: 'x' } as unknown as YtRaw, ctx)).toThrow(ValidationError);
    const dead: YtRaw = {
      v: 1,
      keyed: false,
      lite: true,
      pending: [],
      cs: [],
      liveness: null,
      discovery: [],
      thumbs: [{ cam: 'brighton-explorer', id: 'vMwQRjlfqtA', kind: 'etag', status: null, etag: null }],
      etagCursor: 1,
    };
    expect(() => youtube.parse(dead, ctx)).toThrow(/none of 1 requests answered/);
  });
});
