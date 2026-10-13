import { describe, expect, it } from 'vitest';
import { toMs } from '../../shared/time.ts';
import { BlockedError, createFetchx } from '../lib/fetchx.ts';
import { liftState } from './brighton/feed.ts';
import { type BrightonRow, brighton } from './brighton.ts';
import jan from './fixtures/brighton/20260120-inseason.json?raw';
import mar from './fixtures/brighton/20260328-inseason.json?raw';
import live from './fixtures/brighton/20261012-live.json?raw';
import { type FetchCtx, ValidationError } from './types.ts';

const OPENED = { 'resort:brighton': { seasonOpenedAt: '2025-11-21T09:00:00-07:00' } };
const run = (raw: string, iso: string, prev: Record<string, unknown> = {}) =>
  brighton.parse(raw, { now: toMs(iso), prev }).rows['resort:brighton'] as BrightonRow;

function fetchCtx(res: () => Response): { ctx: FetchCtx; used: () => number } {
  const fx = createFetchx({ fetchImpl: async () => res() });
  const ctx: FetchCtx = {
    fetch: fx,
    now: 0,
    slot: 2,
    morning: false,
    keyed: { yt: false, udot: false },
    secrets: {},
    prev: {},
  };
  return { ctx, used: fx.used };
}

describe('brighton parse: live off-season feed (2026-10-12)', () => {
  it('is preseason with last season numbers hidden and leftover counts zeroed', () => {
    const r = run(live, '2026-10-12T20:00:00Z');
    expect(r).toMatchObject({ id: 'brighton', season: 'preseason', seasonOpenedAt: null, operatingToday: false });
    expect(r.resortStatus).toBe('Closed');
    const { snow } = r;
    for (const v of [snow.overnightIn, snow.new24hIn, snow.new7dIn, snow.seasonTotalIn, snow.baseDepthIn]) {
      expect(v).toBeNull();
    }
    expect(snow).toMatchObject({ reportAt: '2026-10-12T14:21:14Z', reportIsToday: true, area: 'primary', text: null });
    expect(r.lifts).toMatchObject({ open: 0, hold: 0, scheduled: 0, total: 8 });
    expect(r.lifts.list.every((l) => l.state === 'closed')).toBe(true);
    expect(r.trails).toEqual({ open: 0, total: 76, groomed: 0 }); // the feed still says 23 open
    expect(r.parking).toMatchObject({ state: 'closed', raw: 'Closed' });
    expect(r.gates.map((g) => g.state)).toEqual(['closed', 'closed']);
    expect(r.weather).toMatchObject({ baseTempF: null, summitWindMph: null, src: 'none' });
    expect(r.alerts).toEqual([]);
    expect(r.roadHint).toBeUndefined();
  });

  it('shows the numbers on a closed in-season day once the season has opened', () => {
    const r = run(live, '2026-10-12T20:00:00Z', OPENED);
    expect(r.season).toBe('closed-for-day');
    expect(r.seasonOpenedAt).toBe('2025-11-21T09:00:00-07:00');
    expect(r.snow).toMatchObject({ seasonTotalIn: 284, baseDepthIn: 67, new24hIn: 0, stormTotalIn: null });
  });

  it('opens the season on the first running lift on or after Nov 1, not before', () => {
    const feed = JSON.parse(live);
    feed.operations.resortStatus = 'Open';
    Object.assign(feed.facilities.areas.area[1].lifts.lift[0], { status: 'Open', statusIcon: 'open' });
    const raw = JSON.stringify(feed);
    const r = run(raw, '2026-11-20T15:00:00Z');
    expect(r).toMatchObject({ season: 'open', seasonOpenedAt: '2026-11-20T08:00:00-07:00', operatingToday: true });
    expect(r.lifts.open).toBe(1);
    expect(run(raw, '2026-10-20T15:00:00Z').season).toBe('preseason');
  });
});

describe('brighton parse: in-season Wayback samples', () => {
  it('2026-01-20: 5 open, 3 scheduled, lot 90% full', () => {
    const r = run(jan, '2026-01-20T23:30:00Z', OPENED);
    expect(r).toMatchObject({ season: 'open', operatingToday: true, resortStatus: 'Open' });
    expect(r.lifts).toMatchObject({ open: 5, hold: 0, scheduled: 3, total: 8 });
    expect(r.lifts.list.find((l) => l.name === 'Caterpillar')).toMatchObject({
      id: 'caterpillar',
      state: 'scheduled',
      raw: 'Scheduled',
      opensAt: '09:00',
      closesAt: '16:00',
    });
    expect(r.lifts.list.find((l) => l.id === 'snake-creek')).toMatchObject({
      state: 'open',
      area: 'Snake Creek Express',
    });
    expect(r.trails).toEqual({ open: 72, total: 76, groomed: 27 });
    expect(r.snow).toMatchObject({
      overnightIn: 0,
      new24hIn: 0,
      new72hIn: 0,
      seasonTotalIn: 148,
      baseDepthIn: 67,
      reportAt: '2026-01-20T23:00:04Z',
      reportIsToday: true,
    });
    expect(r.snow.text).toMatch(/^JANUARY 9: The cold front/);
    expect(r.parking).toMatchObject({ state: 'filling', percentFull: 90, raw: 'Open' });
    expect(r.roadHint).toMatchObject({ state: 'open' });
    expect(r.roadHint?.raw).toMatch(/^Big Cottonwood Canyon \(SR-190\) is open/);
  });

  it('2026-03-28: 4 open, gates open, report goes stale the next morning', () => {
    const r = run(mar, '2026-03-28T03:00:00Z', OPENED);
    expect(r.lifts).toMatchObject({ open: 4, scheduled: 0, total: 8 });
    expect(r.lifts.list.find((l) => l.name === 'Milly Express')).toMatchObject({ state: 'closed', closesAt: '20:00' });
    expect(r.gates).toEqual([
      { name: "Lost Maid / Catherine's Pass Access", state: 'open', note: null },
      { name: 'Easy Out / Twin Lake Pass Access', state: 'open', note: null },
    ]);
    expect(r.trails).toEqual({ open: 65, total: 76, groomed: 27 });
    expect(r.snow).toMatchObject({ seasonTotalIn: 233, baseDepthIn: 68, reportIsToday: true });
    expect(r.parking.state).toBe('available');
    expect(r.roadHint).toBeUndefined();
    expect(run(mar, '2026-03-28T16:00:00Z', OPENED).snow.reportIsToday).toBe(false);
  });
});

describe('brighton normalizers', () => {
  it('maps statusIcon, then the status text; unlisted -> closed', () => {
    expect(liftState('on-hold', 'On Hold')).toBe('hold');
    expect(liftState(null, 'On Hold')).toBe('hold');
    expect(liftState('delayed', '')).toBe('scheduled');
    expect(liftState('scenic-only', 'Scenic Only')).toBe('closed');
    expect(liftState('constructor', null)).toBe('closed');
    expect(liftState(null, undefined)).toBe('unknown');
  });
});

describe('brighton validation gate', () => {
  it('throws ValidationError on garbage, a foreign feed or a feed without location[0]', () => {
    const now = toMs('2026-01-20T23:30:00Z');
    for (const raw of ['garbage', '{"name":"Solitude"}', '{"name":"Brighton"}']) {
      expect(() => brighton.parse(raw, { now, prev: {} })).toThrow(ValidationError);
    }
  });

  it('throws BlockedError on an HTML body (row status blocked)', () => {
    const ctx = { now: toMs('2026-01-20T23:30:00Z'), prev: {} };
    expect(() => brighton.parse('<html>Service unavailable</html>', ctx)).toThrow(BlockedError);
  });
});

describe('brighton fetch', () => {
  it('returns the body on 200', async () => {
    const { ctx, used } = fetchCtx(() => new Response(jan, { headers: { 'content-type': 'application/json' } }));
    expect(await brighton.fetch(ctx)).toBe(jan);
    expect(used()).toBe(1);
  });

  it('surfaces a Cloudflare challenge as BlockedError (row status blocked)', async () => {
    const page = '<!DOCTYPE html><title>Just a moment...</title>';
    const { ctx, used } = fetchCtx(() => new Response(page, { status: 403, headers: { 'cf-mitigated': 'challenge' } }));
    await expect(brighton.fetch(ctx)).rejects.toBeInstanceOf(BlockedError);
    expect(used()).toBe(1);
  });

  it('does not follow redirects', async () => {
    const { ctx, used } = fetchCtx(() => new Response(null, { status: 302, headers: { location: 'https://x.test/' } }));
    await expect(brighton.fetch(ctx)).rejects.toThrow(/HTTP 302/);
    expect(used()).toBe(1);
  });
});
