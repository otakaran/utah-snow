import { describe, expect, it } from 'vitest';
import { createFetchx } from '../lib/fetchx.ts';
import dec25 from './fixtures/snowbird/20251225-inseason.json?raw';
import mar17 from './fixtures/snowbird/20260317-inseason.json?raw';
import apr15 from './fixtures/snowbird/20260415-inseason.json?raw';
import live from './fixtures/snowbird/20261012-live.json?raw';
import { liftState } from './snowbird/lifts.ts';
import { parseSnowbird, SNOWBIRD_URLS, type SnowbirdRaw, type SnowbirdRow, snowbird } from './snowbird.ts';
import { type FetchCtx, ValidationError } from './types.ts';

const at = (s: string) => Date.parse(s);
const fx = (s: string) => JSON.parse(s) as SnowbirdRaw;
const OPENED = { seasonOpenedAt: '2025-11-21T16:00:00.000Z' }; // a prior tick already saw the season open
const prev = (row: Partial<SnowbirdRow>) => ({ 'resort:snowbird': row });
const parse = (raw: SnowbirdRaw, now: number, p: Partial<SnowbirdRow> = {}) =>
  snowbird.parse(raw, { now, prev: prev(p) }).rows['resort:snowbird'] as SnowbirdRow;

describe('snowbird live 2026-10-12 (off-season)', () => {
  const row = parse(fx(live), at('2026-10-13T01:55:00Z'));

  it('stays preseason with null snow numbers while lifts are closed for the season', () => {
    expect(row.season).toBe('preseason');
    expect(row.seasonOpenedAt).toBeNull();
    expect(row.operatingToday).toBe(false);
    const { overnightIn, new24hIn, new48hIn, new72hIn, new7dIn, seasonTotalIn, baseDepthIn } = row.snow;
    expect([overnightIn, new24hIn, new48hIn, new72hIn, new7dIn, seasonTotalIn, baseDepthIn]).toEqual(
      Array(7).fill(null),
    ); // computed.total still reads last season's 305
    expect(row.snow.reportAt).toBe('2026-10-12T22:00:54.000Z');
    expect(row.snow.reportIsToday).toBe(true);
    expect(row.snow.text).toContain('Opening Day is scheduled for November 27');
  });

  it('reads lifts, gates, winter trails and sensors', () => {
    expect(row.lifts).toMatchObject({ open: 0, hold: 0, scheduled: 0, total: 14 });
    expect(row.lifts.list[0]).toMatchObject({
      id: 'aerial-tram',
      name: 'Aerial Tram',
      state: 'closed',
      raw: 'closed',
      area: 'Peruvian Gulch',
      opensAt: null,
      note: 'Closed for the season',
      updatedAt: '2026-10-12T13:10:24.000Z',
    });
    expect(row.trails).toEqual({ open: 0, total: 150, groomed: 0 }); // 26 summer trails read 'open'
    expect(row.trailsEtag).toBe('W/"24f73-OyUSjzoPT1K9DTZlt3Mf6iKS7Gg"');
    expect(row.gates).toHaveLength(7);
    expect(row.gates.every((g) => g.state === 'closed')).toBe(true);
    expect(row.weather).toEqual({
      baseTempF: 36,
      midTempF: 32,
      summitTempF: 28,
      summitWindMph: 5,
      summitGustMph: 13,
      windDir: 'WSW',
      sky: null,
      obsAt: '2026-10-13T01:45:00.000Z',
      src: 'snowbird-sensors',
    });
  });

  it('does not open the season for lifts running before Nov 1', () => {
    const raw = fx(mar17); // all 14 lifts open
    expect(parse(raw, at('2026-10-20T18:00:00Z')).season).toBe('preseason');
    const first = parse(raw, at('2026-12-27T16:00:00Z'));
    expect(first.seasonOpenedAt).toBe('2026-12-27T09:00:00-07:00');
    expect(first.season).toBe('open');
    expect(first.snow.reportIsToday).toBe(false);
  });
});

describe('snowbird in-season (Wayback)', () => {
  it('2025-12-25: 2" overnight, 5 of 14 lifts, sensors', () => {
    const row = parse(fx(dec25), at('2025-12-25T20:17:49Z'), OPENED);
    expect(row.season).toBe('open');
    expect(row.seasonOpenedAt).toBe(OPENED.seasonOpenedAt);
    expect(row.snow).toMatchObject({
      overnightIn: 2,
      new12hIn: null,
      new24hIn: 2,
      new48hIn: 2,
      new72hIn: 2,
      new7dIn: 5,
      stormTotalIn: null,
      seasonTotalIn: 57,
      baseDepthIn: 28,
      reportAt: '2025-12-25T13:04:10.000Z',
      reportIsToday: true,
      area: 'primary',
    });
    expect(row.lifts).toMatchObject({ open: 5, hold: 0, scheduled: 0, total: 14 });
    const tram = row.lifts.list.find((l) => l.name === 'Aerial Tram');
    expect(tram).toMatchObject({ state: 'open', opensAt: '09:00', closesAt: '15:45', note: null });
    expect(row.lifts.list.find((l) => l.name === 'Peruvian')).toMatchObject({ state: 'closed', note: 'TBD' });
    expect(row.trails).toEqual({ open: 19, total: 148, groomed: 7 });
    expect(row.weather).toMatchObject({ baseTempF: 37, midTempF: 28, summitTempF: 24, summitGustMph: 52 });
    expect(row.weather.obsAt).toBe('2025-12-25T20:00:00.000Z');
    expect(row.gates).toEqual([]); // no terrains capture, no last-good gates
  });

  it('O12: new24hIn is max(overnight_amount, computed 24_hour)', () => {
    const raw = fx(dec25);
    const dec20 = (raw.report as unknown[])[1]; // overnight 3, computed 24_hour 0
    const row = parse({ ...raw, report: [dec20] }, at('2025-12-20T15:00:00Z'), OPENED);
    expect(row.snow.overnightIn).toBe(3);
    expect(row.snow.new24hIn).toBe(3);
    expect(row.snow.seasonTotalIn).toBe(55);
  });

  it('2026-03-17: all lifts open, base 88, Hidden Peak wind', () => {
    const gates = [{ name: 'Mineral Basin', state: 'open' as const, note: null }];
    const row = parse(fx(mar17), at('2026-03-17T17:33:20Z'), { ...OPENED, gates });
    expect(row.lifts).toMatchObject({ open: 14, total: 14 });
    expect(row.snow).toMatchObject({ overnightIn: 0, new24hIn: 0, baseDepthIn: 88, seasonTotalIn: 248 });
    expect(row.snow.reportIsToday).toBe(true);
    expect(row.trails).toEqual({ open: 141, total: 149, groomed: 50 });
    expect(row.weather).toMatchObject({ summitTempF: 32, summitWindMph: 49, summitGustMph: 59, windDir: 'WNW' });
    expect(row.weather.obsAt).toBe('2026-03-17T17:15:00.000Z');
    expect(row.gates).toEqual(gates); // terrains missing: last-good gates copied forward
  });

  it('2026-04-15 after closing: expected lifts are scheduled, gates open, weather kept', () => {
    const weather = { ...parse(fx(mar17), at('2026-03-17T17:33:20Z'), OPENED).weather };
    const row = parse(fx(apr15), at('2026-04-15T23:28:21Z'), { ...OPENED, weather });
    expect(row.season).toBe('open');
    expect(row.lifts).toMatchObject({ open: 1, hold: 0, scheduled: 8, total: 14 });
    expect(row.lifts.list.find((l) => l.name === 'Gad 2')).toMatchObject({ state: 'scheduled', raw: 'expected' });
    expect(row.snow).toMatchObject({ new72hIn: 4, new7dIn: 4, baseDepthIn: 72, seasonTotalIn: 281 });
    expect(row.gates.filter((g) => g.state === 'open').map((g) => g.name)).toEqual([
      'Mineral Basin',
      'Peruvian Gulch',
      'Road to Provo',
      'Snowbird/Alta Connection',
    ]);
    expect(row.trails).toEqual({ open: 91, total: 149, groomed: 34 });
    expect(row.weather).toEqual(weather); // sensors capture missing
  });

  it('copies trails and their ETag forward when trails were not fetched', () => {
    const trails = { open: 3, total: 150, groomed: 1 };
    const row = parse({ ...fx(dec25), trails: null }, at('2025-12-25T20:17:49Z'), {
      ...OPENED,
      trails,
      trailsEtag: 'W/"x"',
    });
    expect(row.trails).toEqual(trails);
    expect(row.trailsEtag).toBe('W/"x"');
  });
});

describe('snowbird validation and budget', () => {
  it('normalizes statuses (§5.5; hours: src/shared/lifts.test.ts)', () => {
    expect(['open', 'Opening', 'on-hold', 'Expected Opening', 'delayed'].map(liftState)).toEqual([
      'open',
      'open',
      'hold',
      'scheduled',
      'scheduled',
    ]);
    expect(['Closed For The Season', 'close', 'groomed', null].map(liftState)).toEqual(Array(4).fill('closed'));
  });

  it('throws ValidationError on garbage payloads', () => {
    const now = at('2026-10-13T01:55:00Z');
    const html = '<html>Internal Server Error</html>';
    expect(() => parseSnowbird({ report: html, lifts: html }, { now, prev: {} })).toThrow(ValidationError);
    expect(() => parseSnowbird({ ...fx(live), lifts: [] }, { now, prev: {} })).toThrow(ValidationError);
    expect(() => parseSnowbird({ ...fx(live), report: [{ updated: 1 }] }, { now, prev: {} })).toThrow(ValidationError);
  });

  async function run(slot: number, etag: string | null) {
    const seen: { url: string; inm: string | null; cc: string | null }[] = [];
    const body = (url: string) => (url.startsWith(SNOWBIRD_URLS.trails) ? '[]' : '{}');
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const h = new Headers(init?.headers);
      seen.push({ url, inm: h.get('If-None-Match'), cc: h.get('Cache-Control') });
      return new Response(body(url), { status: url.endsWith('/sensors') ? 500 : 200 });
    }) as typeof fetch;
    const ctx = {
      fetch: createFetchx({ fetchImpl }),
      now: at('2026-12-27T15:05:00Z'),
      slot,
      morning: true,
      keyed: { yt: false, udot: false },
      secrets: {},
      prev: etag ? prev({ trailsEtag: etag, trails: { open: 1, total: 150, groomed: 0 } }) : {},
    } satisfies FetchCtx;
    const raw = await snowbird.fetch(ctx);
    return { seen, raw, max: snowbird.maxSubrequests(ctx), used: ctx.fetch.used() };
  }

  it('maxSubrequests is the worst case: 4, or 5 in the trails slot (If-None-Match)', async () => {
    const plain = await run(3, null);
    expect(plain.max).toBe(4);
    expect(plain.used).toBe(4);
    expect(plain.raw.sensors).toBeNull(); // optional call failed (500) without failing the job
    const trails = await run(1, 'W/"abc"');
    expect(trails.max).toBe(5);
    expect(trails.used).toBe(5);
    // max-age=0 stops cache:'no-store' from adding no-cache, which makes the API ignore If-None-Match
    expect(trails.seen.find((s) => s.url === SNOWBIRD_URLS.trails)).toMatchObject({ inm: 'W/"abc"', cc: 'max-age=0' });
  });
});
