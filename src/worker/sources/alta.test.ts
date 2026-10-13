import { describe, expect, it } from 'vitest';
import { toMs } from '../../shared/time.ts';
import type { ResortSnapshot } from '../../shared/types.ts';
import { createFetchx } from '../lib/fetchx.ts';
import { parkingState, roadState } from './alta/alerts.ts';
import { liftState } from './alta/lifts.ts';
import { ALTA_URL, alta } from './alta.ts';
import { parseAltaWeather } from './alta-weather.ts';
import dec from './fixtures/alta/20251226-inseason.html?raw';
import feb from './fixtures/alta/20260212-inseason.html?raw';
import mar from './fixtures/alta/20260301-inseason.html?raw';
import live from './fixtures/alta/20261012-live.html?raw';
import wx from './fixtures/alta-weather/20260218-inseason.html?raw';
import { type FetchCtx, ValidationError } from './types.ts';

const OPENED = '2025-11-21T09:15:00-07:00';
const run = (html: string, iso: string, prev: Record<string, unknown> = {}) =>
  alta.parse(html, { now: toMs(iso), prev }).rows['resort:alta'] as ResortSnapshot;
const opened = (extra: Record<string, unknown> = {}) => ({ 'resort:alta': { seasonOpenedAt: OPENED, ...extra } });
const states = (r: ResortSnapshot) => Object.fromEntries(r.lifts.list.map((l) => [l.name, l.state]));
const gate = (r: ResortSnapshot, name: string) => r.gates.find((g) => g.name === name)?.state;

describe('alta parse: live off-season page (2026-10-12 19:55 MDT)', () => {
  const r = run(live, '2026-10-13T01:55:00Z', opened());

  it('is preseason while seasonal.is_winter is false, even with a seasonOpenedAt', () => {
    expect(r).toMatchObject({ id: 'alta', season: 'preseason', seasonOpenedAt: OPENED, operatingToday: false });
    expect(run(live, '2026-10-13T01:55:00Z').seasonOpenedAt).toBeNull();
  });

  it('nulls every snow number (year_to_date 323 is last season) but keeps the report time', () => {
    const { snow } = r;
    for (const k of ['overnightIn', 'new12hIn', 'new24hIn', 'new48hIn', 'new7dIn', 'stormTotalIn'] as const) {
      expect(snow[k]).toBeNull();
    }
    expect(snow).toMatchObject({ seasonTotalIn: null, baseDepthIn: null, morningOvernightIn: null, area: 'primary' });
    expect(snow).toMatchObject({ reportAt: '2026-10-12T18:10:07-06:00', reportIsToday: true });
    expect(snow.text).toBe('Mostly cloudy throughout the day.');
  });

  it('reads live weather, all lifts and gates closed, summer road ignored', () => {
    expect(r.weather).toEqual({
      baseTempF: 39,
      midTempF: 33,
      summitTempF: 31.1,
      summitWindMph: 11.7,
      summitGustMph: null,
      windDir: 'WSW',
      sky: 'Partly Cloudy',
      obsAt: '2026-10-12T08:00:00-06:00',
      src: 'alta',
    });
    expect(r.lifts).toMatchObject({ open: 0, hold: 0, scheduled: 0, total: 5 });
    expect(r.lifts.list.find((l) => l.name === 'Collins')).toMatchObject({
      state: 'closed',
      note: 'OPEN FOR EMPLOYEE SKI DAY',
      opensAt: '09:15',
      closesAt: '16:30',
      updatedAt: '2026-04-27T10:28:09-06:00',
    });
    expect(r.gates).toHaveLength(16);
    expect(r.gates.every((g) => g.state === 'closed')).toBe(true);
    expect(r.trails).toEqual({ open: 0, total: 118, groomed: null });
    expect(r.parking).toMatchObject({ state: 'available', raw: 'Available' });
    expect(r.alerts).toEqual([]);
    expect(r.roadHint).toBeUndefined();
  });
});

describe('alta parse: 2025-12-26 10:00 MST (4 of 5 lifts running)', () => {
  const morning = { snow: { morningOvernightIn: { date: '2025-12-26', value: 3 } } };
  const r = run(dec, '2025-12-26T17:00:32Z', opened(morning));

  it('normalizes lifts inside their hours and keeps the season open', () => {
    expect(r).toMatchObject({ season: 'open', seasonOpenedAt: OPENED, operatingToday: true });
    expect(r.lifts).toMatchObject({ open: 4, hold: 0, scheduled: 0, total: 5 });
    expect(states(r).Supreme).toBe('closed');
    expect(r.trails).toEqual({ open: 49, total: 118, groomed: 9 });
  });

  it('maps snow numbers, and from 10:00 the overnight value saved this morning', () => {
    expect(r.snow).toMatchObject({
      overnightIn: 3,
      morningOvernightIn: { date: '2025-12-26', value: 3 },
      new12hIn: 0,
      new24hIn: 0,
      new48hIn: null, // no alta:weather row in prev
      stormTotalIn: 0,
      seasonTotalIn: 59,
      baseDepthIn: 28,
      reportAt: '2025-12-26T09:05:07-07:00',
      reportIsToday: true,
    });
  });

  it('reads last12 as overnight inside [04:00, 10:00) and saves it', () => {
    const early = run(dec, '2025-12-26T16:30:00Z', opened());
    expect(early.snow).toMatchObject({ overnightIn: 0, morningOvernightIn: { date: '2025-12-26', value: 0 } });
  });

  it('maps gates, terrain areas, parking, road and the alert bar', () => {
    expect(gate(r, 'Blackjack Traverse')).toBe('open');
    expect(gate(r, 'Sugarloaf Pass')).toBe('closed');
    expect(gate(r, 'EBT/East Baldy Traverse')).toBe('open');
    expect(r.parking.state).toBe('reservation-required');
    expect(r.parking.note).toContain('January 4th');
    expect(r.roadHint).toEqual({ raw: 'Open', state: 'open' });
    expect(r.alerts).toEqual(['Parking reservations are required 8am–1pm daily through January 4th. Learn more']);
  });

  it('opens the season only on or after 2026-11-01 with a lift running', () => {
    expect(run(dec, '2025-12-26T17:00:32Z').season).toBe('preseason');
    const next = run(dec, '2026-12-26T17:00:32Z');
    expect(next).toMatchObject({ season: 'open', seasonOpenedAt: '2026-12-26T10:00:00-07:00' });
    expect(next.snow.reportIsToday).toBe(false);
  });
});

describe('alta parse: 2026-02-12 11:46 MST (all lifts, parking full)', () => {
  const weather = parseAltaWeather(wx, { now: toMs('2026-02-18T06:46:04Z'), prev: {} }).rows['alta:weather'];
  const r = run(feb, '2026-02-12T18:46:24Z', { ...opened(), 'alta:weather': weather });

  it('builds 48h/72h/7d from last24 plus the alta:weather day totals', () => {
    expect(r.snow).toMatchObject({ new12hIn: 1, new24hIn: 4, stormTotalIn: 11, seasonTotalIn: 154, baseDepthIn: 67 });
    expect(r.snow).toMatchObject({ new48hIn: 8.8, new72hIn: 10.5, new7dIn: 11, overnightIn: null });
  });

  it('carries the multi-day values forward on a tick without alta:weather, same report day only', () => {
    const prevSnow = { reportAt: '2026-02-12T10:05:05-07:00', new48hIn: 8.8, new72hIn: 10.5, new7dIn: 11 };
    const kept = run(feb, '2026-02-12T18:46:24Z', opened({ snow: prevSnow }));
    expect(kept.snow).toMatchObject({ new48hIn: 8.8, new72hIn: 10.5, new7dIn: 11 });
    const stale = run(
      feb,
      '2026-02-12T18:46:24Z',
      opened({ snow: { ...prevSnow, reportAt: '2026-02-11T22:05:05-07:00' } }),
    );
    expect(stale.snow).toMatchObject({ new48hIn: null, new72hIn: null, new7dIn: null });
  });

  it('reads lifts, gates and parking', () => {
    expect(r.lifts).toMatchObject({ open: 5, total: 5 });
    expect(gate(r, 'White Cliffs')).toBe('closed');
    expect(gate(r, 'Keyhole')).toBe('open');
    expect(gate(r, 'Backside')).toBe('closed');
    expect(r.parking).toMatchObject({ state: 'full', raw: 'Full' });
    expect(r.trails).toEqual({ open: 104, total: 118, groomed: 23 });
  });
});

describe('alta parse: open flags left on overnight (2026-02-28 22:37 MST snapshot)', () => {
  it('closes every lift and gate after closing time', () => {
    const r = run(mar, '2026-03-01T05:37:19Z', opened());
    expect(r.lifts).toMatchObject({ open: 0, hold: 0, scheduled: 0, total: 5 });
    expect(r.lifts.list.find((l) => l.name === 'Supreme')?.note).toBe('DELAYED');
    expect(r.gates.slice(0, 4).every((g) => g.state === 'closed')).toBe(true);
    expect(r.season).toBe('closed-for-day');
  });

  it('shows yesterday’s lifts as scheduled before opening; no overnight from a stale report', () => {
    const r = run(mar, '2026-03-01T14:00:00Z', opened());
    expect(r.lifts).toMatchObject({ open: 0, scheduled: 5 });
    expect(r.season).toBe('open');
    expect(gate(r, 'Sugarloaf Pass')).toBe('scheduled');
    expect(gate(r, 'White Cliffs')).toBe('closed');
    expect(r.snow).toMatchObject({ reportIsToday: false, overnightIn: null });
  });

  it('has no overnight value from 00:00 to 03:59 and carries morningOvernightIn forward', () => {
    const saved = { date: '2026-02-28', value: 2 };
    const r = run(mar, '2026-03-01T09:00:00Z', opened({ snow: { morningOvernightIn: saved } }));
    expect(r.snow).toMatchObject({ overnightIn: null, morningOvernightIn: saved });
  });
});

describe('alta normalizers', () => {
  const clock = { hm: '11:00', today: '2026-02-12', winter: true };
  const lift = (open: boolean, notes: string | null) => ({ open, notes, opening_at: '09:15', closing_at: '16:30' });

  it('maps notes inside lift hours', () => {
    expect(liftState(lift(true, 'On hold'), clock, false)).toBe('hold');
    expect(liftState(lift(false, 'Wind'), clock, false)).toBe('hold');
    expect(liftState(lift(false, 'Expected later'), clock, false)).toBe('scheduled');
    expect(liftState(lift(false, null), clock, false)).toBe('closed');
    expect(liftState(lift(false, null), { ...clock, hm: '08:00' }, true)).toBe('scheduled');
    expect(liftState(lift(false, null), { ...clock, hm: '08:00', winter: false }, true)).toBe('closed');
  });

  it('classifies road and parking text', () => {
    expect(roadState('4x4 or Chains Req')).toBe('traction');
    expect(roadState('Closed: avalanche control')).toBe('closed');
    expect(roadState('Interlodge in effect')).toBe('interlodge');
    expect(roadState('Open')).toBe('open');
    expect(roadState('See UDOT')).toBe('unknown');
    expect(parkingState('Reservation Req')).toBe('reservation-required');
    expect(parkingState('Available')).toBe('available');
  });
});

describe('alta validation gate and fetch', () => {
  it('throws ValidationError on garbage, a page without liftStatus, or broken JSON', () => {
    const now = toMs('2026-02-12T18:00:00Z');
    expect(() => alta.parse('<html><body>Bad gateway</body></html>', { now, prev: {} })).toThrow(ValidationError);
    const notFound = '<script>window.Alta = {"seasonal":{},"conditions":{"last24":"4.0"}};</script>';
    expect(() => alta.parse(notFound, { now, prev: {} })).toThrow(ValidationError);
    expect(() => alta.parse('<script>window.Alta = {"liftStatus":</script>', { now, prev: {} })).toThrow(
      ValidationError,
    );
  });

  it('falls back to a balanced-brace scan when more script follows the object', () => {
    const json = live.slice(live.indexOf('window.Alta = ') + 14, live.indexOf(';</script>'));
    const page = `<script>window.Alta = ${json}; window.Other = {"a":"}"};</script>`;
    expect(run(page, '2026-10-13T01:55:00Z').lifts.total).toBe(5);
  });

  it('uses exactly maxSubrequests() = 1 and rejects redirects', async () => {
    const ctxWith = (res: () => Response): { ctx: FetchCtx; used: () => number } => {
      const fx = createFetchx({ fetchImpl: async () => res() });
      const keyed = { yt: false, udot: false };
      return { ctx: { fetch: fx, now: 0, slot: 1, morning: false, keyed, secrets: {}, prev: {} }, used: fx.used };
    };
    const ok = ctxWith(() => new Response(live, { status: 200 }));
    expect(alta.maxSubrequests(ok.ctx)).toBe(1);
    expect(await alta.fetch(ok.ctx)).toBe(live);
    expect(ok.used()).toBe(1);
    const moved = ctxWith(() => new Response('', { status: 301, headers: { location: `${ALTA_URL}/` } }));
    await expect(alta.fetch(moved.ctx)).rejects.toThrow(/HTTP 301/);
    expect(moved.used()).toBe(1);
  });
});
