import { describe, expect, it } from 'vitest';
import type { ResortSnapshot } from '../../shared/types.ts';
import sol20220314 from './fixtures/mtnpowder/20220314-inseason-solitude.json?raw';
import sol20230119 from './fixtures/mtnpowder/20230119-inseason-solitude.json?raw';
import liveDv from './fixtures/mtnpowder/20261012-live-deer-valley.json?raw';
import liveSol from './fixtures/mtnpowder/20261012-live-solitude.json?raw';
import dvSynthetic from './fixtures/mtnpowder/mtnpowder-synthetic.json?raw';
import { deerValley, MTNPOWDER_SOURCES, type MtnPowderRow, solitude } from './mtnpowder.ts';
import { BlockedError, type FetchCtx, type FetchOpts, type FetchX, ValidationError } from './types.ts';

const LIVE_NOW = Date.parse('2026-10-13T01:55:55Z'); // Mon 2026-10-12 19:55 MDT, when the live files were fetched
const opened = (id: string, at: string) => ({ [id]: { seasonOpenedAt: at } });
const row = (out: { rows: Record<string, unknown> }, id: string) => out.rows[id] as ResortSnapshot;

function ctxWith(status: number, body: string, seen: { url: string; opts?: FetchOpts }[] = []): FetchCtx {
  const fx = async (url: string, opts?: FetchOpts) => {
    seen.push({ url, opts });
    return { status, url, headers: new Headers(), data: body, bytes: body.length, blocked: true, wallMs: 1 };
  };
  const fetch = Object.assign(fx, { remaining: () => 44, used: () => 1 }) as unknown as FetchX;
  return { fetch, now: LIVE_NOW, slot: 2, morning: false, keyed: { yt: false, udot: false }, secrets: {}, prev: {} };
}

describe('mtnpowder live feeds (2026-10-12, pre-season)', () => {
  it('Solitude: pre-season gating nulls the leftover snow numbers but keeps lifts, gates and weather', () => {
    const s = row(solitude.parse(liveSol, { now: LIVE_NOW, prev: {} }), 'resort:solitude');
    expect(s).toMatchObject({ id: 'solitude', season: 'preseason', seasonOpenedAt: null, operatingToday: false });
    expect(s.snow).toMatchObject({ overnightIn: null, new24hIn: null, seasonTotalIn: null, baseDepthIn: null });
    expect(s.snow).toMatchObject({ reportAt: '2026-10-07T15:50:41-06:00', reportIsToday: false, area: 'mid' });
    expect(s.snow.summit).toBeUndefined();
    expect(s.snow.text).toMatch(/^Winter is coming! .*November 20\.$/);
    expect(s.weather).toMatchObject({ midTempF: 32, baseTempF: null, summitWindMph: null, sky: 'Snow' });
    expect(s.weather.obsAt).toBe('2026-10-12T19:52:48-06:00');
    expect(s.lifts).toMatchObject({ open: 0, hold: 0, scheduled: 0, total: 9 });
    expect(s.lifts.list).toHaveLength(10);
    expect(s.lifts.list[0]).toMatchObject({ id: '535', name: 'Link', state: 'closed', raw: 'Closed' });
    expect(s.lifts.list[0]).toMatchObject({ area: 'Moonbeam Area', opensAt: '09:00', closesAt: '16:00' });
    expect(s.trails).toEqual({ open: 0, total: 82, groomed: 0 });
    expect(s.gates.map((g) => g.name)).toContain('Honeycomb Canyon');
    expect(s.gates).toHaveLength(7);
    expect(s.gates.every((g) => g.state === 'closed')).toBe(true);
    expect(s.alerts).toEqual([]);
    expect(s.roadHint).toBeUndefined();
  });

  it('Deer Valley: three weather stations, Roads[] hint, closed-for-season lifts', () => {
    const d = row(deerValley.parse(liveDv, { now: LIVE_NOW, prev: {} }), 'resort:deer-valley');
    expect(d).toMatchObject({ id: 'deer-valley', season: 'preseason', operatingToday: false });
    expect(d.snow).toMatchObject({ new24hIn: null, surface: null, reportAt: '2026-09-21T09:42:57-06:00' });
    expect(d.weather).toMatchObject({ baseTempF: 40, midTempF: 37, summitTempF: 33 });
    expect(d.weather).toMatchObject({ summitWindMph: 27, summitGustMph: 31, windDir: 'S', sky: 'Rain' });
    expect(d.lifts).toMatchObject({ open: 0, total: 31 });
    expect(d.lifts.list).toHaveLength(32);
    expect(d.lifts.list.every((l) => l.state === 'closed' && l.raw === 'Closed for Season')).toBe(true);
    expect(d.trails.total).toBe(202);
    expect(d.gates).toEqual([]);
    expect(d.roadHint).toEqual({ state: 'open', raw: 'I-80: Open; US-40: Open; SR-224: Open; SR-248: Open' });
  });

  it('marks the season opened on the first open lift on or after Nov 1, then carries it forward', () => {
    const feed = JSON.parse(liveSol);
    feed.MountainAreas[0].Lifts[1].Status = 'Open';
    const opening = Date.parse('2026-11-20T15:30:00Z'); // 08:30 MST
    const s = row(solitude.parse(JSON.stringify(feed), { now: opening, prev: {} }), 'resort:solitude');
    expect(s).toMatchObject({ season: 'open', seasonOpenedAt: '2026-11-20T08:30:00-07:00', operatingToday: true });
    expect(s.snow).toMatchObject({ new24hIn: 0, seasonTotalIn: 0 });
    const summer = row(solitude.parse(JSON.stringify(feed), { now: LIVE_NOW, prev: {} }), 'resort:solitude');
    expect(summer.season).toBe('preseason');
    const later = solitude.parse(liveSol, {
      now: opening,
      prev: opened('resort:solitude', '2026-11-20T08:30:00-07:00'),
    });
    expect(row(later, 'resort:solitude')).toMatchObject({ season: 'closed-for-day', operatingToday: true });
  });
});

describe('mtnpowder in-season samples', () => {
  it('Solitude 2022-03-14 07:40 (Wayback): 11" day, Honeycomb Return pending mitigation', () => {
    const now = Date.parse('2022-03-14T13:40:32Z');
    const prev = opened('resort:solitude', '2021-11-19T09:00:00-07:00');
    const s = row(solitude.parse(sol20220314, { now, prev }), 'resort:solitude');
    expect(s).toMatchObject({ season: 'open', seasonOpenedAt: '2021-11-19T09:00:00-07:00', operatingToday: true });
    expect(s.snow).toMatchObject({ overnightIn: 5, new24hIn: 11, new48hIn: 11, new72hIn: 11, new7dIn: 0 });
    expect(s.snow).toMatchObject({ stormTotalIn: 11, seasonTotalIn: 304, baseDepthIn: 88, surface: 'Powder' });
    expect(s.snow).toMatchObject({ reportAt: '2022-03-14T05:23:02-06:00', reportIsToday: true });
    expect(s.lifts).toMatchObject({ open: 8, total: 8, hold: 0, scheduled: 1 });
    const hc = s.lifts.list.find((l) => l.name === 'Honeycomb Return');
    expect(hc).toMatchObject({ id: 'honeycomb-return', state: 'scheduled', raw: 'Pending Mitigation' });
    expect(s.trails).toEqual({ open: 77, total: 82, groomed: 26 });
    expect(s.weather).toMatchObject({ midTempF: 11, sky: 'Clear', summitWindMph: null });
  });

  it('Solitude 2023-01-19 02:41 (Wayback): storm numbers, yesterday’s report, lifts closed for the night', () => {
    const now = Date.parse('2023-01-19T09:41:58Z');
    const prev = opened('resort:solitude', '2022-11-23T09:00:00-07:00');
    const s = row(solitude.parse(sol20230119, { now, prev }), 'resort:solitude');
    expect(s.season).toBe('closed-for-day');
    expect(s.snow).toMatchObject({ overnightIn: 3, new24hIn: 6, new48hIn: 22, new72hIn: 34, new7dIn: 45 });
    expect(s.snow).toMatchObject({ stormTotalIn: 43, seasonTotalIn: 375, baseDepthIn: 122, reportIsToday: false });
    expect(s.snow.text).toMatch(/^The powdery fun continues today/);
    expect(s.trails).toEqual({ open: 79, total: 82, groomed: 23 });
    expect(s.lifts).toMatchObject({ open: 0, total: 8 });
  });

  it('Deer Valley synthetic 2025-12-28 09:30: summit numbers, holds, parking alert, chains', () => {
    const now = Date.parse('2025-12-28T16:30:00Z');
    const prev = opened('resort:deer-valley', '2025-12-06T09:00:00-07:00');
    const d = row(deerValley.parse(dvSynthetic, { now, prev }), 'resort:deer-valley');
    expect(d.season).toBe('open');
    expect(d.snow).toMatchObject({ overnightIn: 5, new24hIn: 5, new48hIn: 8, new7dIn: 12, stormTotalIn: 8 });
    expect(d.snow).toMatchObject({ seasonTotalIn: 62, baseDepthIn: 30, reportIsToday: true, area: 'mid' });
    expect(d.snow.summit).toEqual({ overnightIn: 9, new24hIn: 10 });
    expect(d.snow.text).toBe(
      'Good morning! 10" at the summit since the lifts closed. Patrol is working on Lady Morgan this morning.',
    );
    expect(d.weather).toMatchObject({ summitTempF: 9, summitWindMph: 17, summitGustMph: 18, windDir: 'WNW' });
    expect(d.lifts).toMatchObject({ open: 21, total: 31, hold: 2, scheduled: 2 });
    expect(d.lifts.list.find((l) => l.id === '151')).toMatchObject({
      state: 'scheduled',
      opensAt: '09:00',
      closesAt: '15:00',
    });
    expect(d.alerts).toEqual([
      'Deer Valley parking is at capacity today, 12/28. Please park at the Richardson Flat Park & Ride.',
    ]);
    expect(d.roadHint?.state).toBe('traction');
    expect(d).not.toHaveProperty('unmapped');
  });

  it('returns unmapped lift statuses in the row (parse stays pure, nothing is logged)', () => {
    const feed = JSON.parse(dvSynthetic);
    const area = feed.MountainAreas.find((a: { Lifts?: unknown[] }) => (a.Lifts?.length ?? 0) > 0);
    area.Lifts[0].Status = 'Bogus Status';
    const ctx = { now: Date.parse('2025-12-28T16:30:00Z'), prev: {} };
    const d = deerValley.parse(JSON.stringify(feed), ctx).rows['resort:deer-valley'] as MtnPowderRow;
    expect(d.unmapped).toEqual(['Bogus Status']);
  });
});

describe('mtnpowder validation and fetch', () => {
  it('garbage, a block page or the wrong resort fails the gate with ValidationError', () => {
    const ctx = { now: LIVE_NOW, prev: {} };
    expect(() => solitude.parse('<html>Request unsuccessful</html>', ctx)).toThrow(ValidationError);
    expect(() => solitude.parse('{"Name":"Solitude"}', ctx)).toThrow(/SnowReport missing/);
    expect(() => deerValley.parse(liveSol, ctx)).toThrow(ValidationError);
    expect(() => deerValley.parse('{"Name":"Deer Valley Summer","SnowReport":{"x":1}}', ctx)).toThrow(
      /not Deer Valley/,
    );
  });

  it('fetch sends one GET (no redirects, Accept JSON) and returns the JSON body', async () => {
    const seen: { url: string; opts?: FetchOpts }[] = [];
    await expect(solitude.fetch(ctxWith(200, liveSol, seen))).resolves.toBe(liveSol);
    expect(seen).toEqual([
      {
        url: 'https://mtnpowder.com/feed?resortId=65',
        opts: expect.objectContaining({ follow: false, allowBlocked: true, headers: { Accept: 'application/json' } }),
      },
    ]);
  });

  it('fetch flags an HTML body (Imperva) as blocked and other failures as errors', async () => {
    const block = '<html><head><META NAME="ROBOTS"></head><iframe src="/_Incapsula_Resource?x=1"></iframe></html>';
    await expect(deerValley.fetch(ctxWith(200, block))).rejects.toBeInstanceOf(BlockedError);
    await expect(deerValley.fetch(ctxWith(403, 'Request unsuccessful. Incapsula incident ID: 1'))).rejects.toThrow(
      /^blocked: HTTP 403/,
    );
    await expect(deerValley.fetch(ctxWith(503, '{"error":"down"}'))).rejects.toThrow('HTTP 503');
    await expect(deerValley.fetch(ctxWith(302, ''))).rejects.toThrow('HTTP 302');
  });

  it('declares one subrequest per job, the shared probe host and 40 min staleness', () => {
    for (const src of MTNPOWDER_SOURCES) {
      expect(src.maxSubrequests(ctxWith(200, ''))).toBe(1);
      expect(src.probes).toEqual([{ hostId: 'mtnpowder', url: expect.stringMatching(/^https:\/\/mtnpowder\.com\//) }]);
      expect(src.staleAfterMin).toBe(40);
      expect(src.rows).toEqual([src.id]);
    }
    expect(MTNPOWDER_SOURCES.map((s) => s.id)).toEqual(['resort:solitude', 'resort:deer-valley']);
  });
});
