// Fixtures: live 2026-10-12 20:09 MDT (after dusk, pre-season); the in-season file is SYNTHETIC (Wayback has no
// captures of these HEAD/redirect/JSON endpoints; see its _note).
import { describe, expect, it } from 'vitest';
import type { CamStatusRow } from '../../shared/types.ts';
import { allRequests, CAP, camStatus, parseCamStatus, pickRequests } from './cam-status.ts';
import live from './fixtures/cam-status/20261012-live.json?raw';
import synthetic from './fixtures/cam-status/cam-status-synthetic.json?raw';
import { type FetchCtx, type FetchOpts, type FetchX, type PrevRows, ValidationError } from './types.ts';

const LIVE = JSON.parse(live);
const SYN = JSON.parse(synthetic);
const LIVE_NOW: number = LIVE.capturedAt; // 2026-10-13T02:09:05Z
const SYN_NOW: number = SYN.capturedAt; // 2026-01-15T16:55:00Z = 09:55 MST
const row = (raw: unknown, now: number, prev: PrevRows = {}) => parseCamStatus(raw, { now, prev });
const BRIGHTON_ETAG = '835874fa51dcf1c5d2d957de6b08e7b8ae2b36c0';

describe('cam-status plan', () => {
  it('makes 20 requests, one per fixture probe, and admits at 20 subrequests', () => {
    const reqs = allRequests(LIVE_NOW);
    expect(reqs).toHaveLength(20);
    expect(new Set(reqs.map((r) => r.key))).toEqual(new Set(Object.keys(LIVE.probes)));
    expect(camStatus.maxSubrequests({ now: LIVE_NOW } as FetchCtx)).toBe(20);
    expect(reqs.find((r) => r.key === 'skiutah:brighton-snowstake-skiutah')?.url).toMatch(/\?_ts=\d{10}$/);
    expect(reqs.find((r) => r.key === 'prism')?.url).toBe(
      'https://php.prismcam.com/public/helpers/cam_init.php?cams=65,88,54,115&pages=&url=%2F%2Futah.otakar.dev%2F',
    );
  });

  it('rotates a CAP-long window hourly once the registry outgrows CAP', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      key: `do:${i}`,
      url: 'u',
      method: 'GET' as const,
      json: false,
    }));
    const h0 = pickRequests(many, 0).map((r) => r.key);
    const h1 = pickRequests(many, 3_600_000).map((r) => r.key);
    expect(h0).toHaveLength(CAP);
    expect(h1[0]).toBe('do:20');
    expect(new Set([...h0, ...h1]).size).toBe(25);
  });

  it('fetch sends 20 requests with redirects off and records Location/ETag/Last-Modified', async () => {
    const seen: [string, FetchOpts | undefined][] = [];
    const fake = async (url: string, opts?: FetchOpts) => {
      seen.push([url, opts]);
      const headers = new Headers({ location: '/x/2026-01-15/09-40-00/a.jpg', etag: '"e"', 'last-modified': 'x' });
      return { status: 302, url, headers, data: '', bytes: 0, blocked: false, wallMs: 1 };
    };
    const fx = Object.assign(fake, { remaining: () => 45, used: () => seen.length }) as unknown as FetchX;
    const raw = await camStatus.fetch({ fetch: fx, now: LIVE_NOW } as FetchCtx);
    expect(seen).toHaveLength(20);
    expect(seen.every(([, o]) => o?.follow === false && o.allowStatus === true)).toBe(true);
    expect(raw.probes['roundshot:snowbird-hidden-peak']).toMatchObject({ status: 302, etag: '"e"' });
  });
});

describe('cam-status parse, live 2026-10-12 (pre-season, after dusk)', () => {
  const r = row(LIVE, LIVE_NOW);

  it('Alta DO stills: online, asOf = Last-Modified', () => {
    expect(r['alta-mount-superior']).toEqual({
      online: true,
      asOf: '2026-10-13T02:08:14.000Z',
      checkedAt: '2026-10-13T02:09:05.625Z',
    });
    expect(r['alta-collins-stake']).toBeUndefined(); // stake-alta's archive owns it
  });

  it('Prism: asOf from the epoch `time`, path without the 000NN/ prefix, 24 h archive bounds', () => {
    expect(r['alta-albion-basin']).toMatchObject({
      online: true,
      asOf: '2026-10-13T02:06:05.000Z',
      path: '2026/10/12/20-06',
      archive: { first: '2026-10-12T03:38:18.000Z', last: '2026-10-13T02:06:23.000Z', enabled: true },
    });
    expect(r['snowbasin-john-paul']?.path).toBe('2026/10/12/20-05');
  });

  it('HDRelay: active archives fresh and enabled; gated ones (last 2026-10-01 / 2026-02-20) stay off', () => {
    expect(r['snowbird-snowstake']).toMatchObject({
      asOf: '2026-10-13T02:05:00.529Z',
      archive: { position: 'default', first: '2026-06-24T17:55:00.577Z', enabled: true },
    });
    expect(r['snowbird-peruvian-gulch']).toMatchObject({ asOf: null, archive: { enabled: false } });
    expect(r['snowbird-mineral-basin']?.archive).toMatchObject({ last: '2026-02-20T15:15:07.561Z', enabled: false });
    expect(r['snowbasin-base-of-wildcat']?.archive?.position).toBe('panorama');
    // online comes from hdrelay:config; without it all 12 HDRelay cams are listed as unknown
    expect(r['snowbasin-needles']).toEqual({ online: null, asOf: null, checkedAt: '2026-10-13T02:09:05.625Z' });
  });

  it('HDRelay online follows hdrelay:config', () => {
    const cfg = { 'snowbird-peruvian-gulch': { online: true }, 'snowbasin-needles': { online: false } };
    const r2 = row(LIVE, LIVE_NOW, { 'hdrelay:config': cfg });
    expect(r2['snowbird-peruvian-gulch']?.online).toBe(true);
    expect(r2['snowbasin-needles']?.online).toBe(false);
  });

  it('Roundshot: the 19:20 MDT dusk frame from the Location is the newest (night: old by design)', () => {
    expect(r['snowbird-hidden-peak']).toMatchObject({ online: true, asOf: '2026-10-13T01:20:00.000Z' });
    expect(r['snowbird-hidden-peak-360']?.asOf).toBe('2026-10-13T01:20:00.000Z');
  });

  it('Ski Utah: Apex asOf = Last-Modified; Brighton stake tracks its ETag, not the moving Last-Modified', () => {
    expect(r['solitude-apex-sunrise']).toMatchObject({ online: true, asOf: '2026-10-13T02:08:01.000Z' });
    expect(r['brighton-snowstake-skiutah']).toMatchObject({ etag: BRIGHTON_ETAG, hidden: false });
    // The same ETag was first seen 3 h 15 min earlier (Last-Modified had moved from 01:53:31 to 02:08:31): hidden.
    const since = '2026-10-12T22:53:31.000Z';
    const prev = { 'cams:status': { 'brighton-snowstake-skiutah': { etag: BRIGHTON_ETAG, etagSince: since } } };
    expect(row(LIVE, LIVE_NOW, prev)['brighton-snowstake-skiutah']).toMatchObject({ asOf: since, hidden: true });
  });
});

describe('cam-status parse, in season (synthetic 2026-01-15 09:55 MST)', () => {
  const prevRow: CamStatusRow = {
    'alta-east-greeley': { online: true, asOf: '2026-01-15T15:00:00.000Z', checkedAt: '2026-01-15T15:55:00.000Z' },
    'snowbasin-snowstake': { online: true, asOf: '2026-01-15T15:50:00.000Z', checkedAt: '2026-01-15T15:55:00.000Z' },
    'brighton-snowstake-skiutah': {
      online: true,
      asOf: '2026-01-15T12:30:00.000Z',
      checkedAt: '2026-01-15T15:55:00.000Z',
      etag: BRIGHTON_ETAG,
      etagSince: '2026-01-15T12:30:00.000Z',
    },
    'retired-cam': { online: true, asOf: null, checkedAt: '2026-01-01T00:00:00.000Z' },
  };
  const r = row(SYN, SYN_NOW, { 'cams:status': prevRow });

  it('a DO 404 marks the cam offline and keeps its last asOf ("stale since")', () => {
    expect(r['alta-east-greeley']).toMatchObject({ online: false, asOf: '2026-01-15T15:00:00.000Z' });
    expect(r['alta-high-rustler']?.asOf).toBe('2026-01-15T16:46:00.000Z');
  });

  it('Prism: a 130 min old frame keeps its asOf (the client greys it); camStatus 0 is offline', () => {
    expect(r['alta-mount-baldy']).toMatchObject({ online: true, asOf: '2026-01-15T14:45:00.000Z' });
    expect(r['snowbasin-john-paul']?.online).toBe(false);
    expect(r['alta-albion-basin']?.path).toBe('2026/01/15/09-52');
  });

  it('gated HDRelay archives switch on while last < 30 min; {} means no archive', () => {
    expect(r['snowbird-peruvian-gulch']?.archive).toMatchObject({ enabled: true, last: '2026-01-15T16:45:00.000Z' });
    expect(r['snowbasin-strawberry-patio']?.archive).toMatchObject({ position: 'panorama', enabled: true });
    expect(r['snowbird-little-cloud']?.archive?.enabled).toBe(false);
    expect(r['snowbird-mineral-basin']?.archive).toEqual({
      position: 'default',
      first: null,
      last: null,
      enabled: false,
    });
  });

  it('failed probes (500, timeout) keep the previous entry; retired cams drop out', () => {
    expect(r['snowbasin-snowstake']).toMatchObject({
      asOf: '2026-01-15T15:50:00.000Z',
      checkedAt: '2026-01-15T15:55:00.000Z',
    });
    expect(r['snowbasin-base-of-wildcat']?.archive).toBeUndefined();
    expect(r['retired-cam']).toBeUndefined();
  });

  it('Roundshot daytime frame 09:40 MST; the 360 answering 404 is offline', () => {
    expect(r['snowbird-hidden-peak']?.asOf).toBe('2026-01-15T16:40:00.000Z');
    expect(r['snowbird-hidden-peak-360']?.online).toBe(false);
  });

  it('Brighton stake: the same ETag for 4 h 25 min -> hidden, asOf = when it first appeared', () => {
    expect(r['brighton-snowstake-skiutah']).toMatchObject({ hidden: true, asOf: '2026-01-15T12:30:00.000Z' });
  });
});

describe('cam-status validation gate', () => {
  it('throws ValidationError on garbage and when no probe answered', () => {
    expect(() => row('<html>Just a moment</html>', LIVE_NOW)).toThrow(ValidationError);
    const dead = { probes: { prism: { status: 200, body: { nope: 1 } }, 'do:alta-mount-superior': { status: 503 } } };
    expect(() => camStatus.parse(dead as never, { now: LIVE_NOW, prev: {} })).toThrow(ValidationError);
  });
});
