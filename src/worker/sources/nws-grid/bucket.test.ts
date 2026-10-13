import { describe, expect, it, vi } from 'vitest';
import live from '../fixtures/nws-grid/20261012-live.json?raw';
import {
  bucketDays,
  durationHours,
  expand,
  type GridValue,
  intervals,
  overnightWindow,
  parseValidTime,
  windowHours,
  windowSnowIn,
} from './bucket.ts';

const H = 3_600_000;
const props = (JSON.parse(live) as { properties: Record<string, { values: GridValue[] }> }).properties;
const read = (key: string) => intervals(props[key]?.values ?? []);
const liveFields = () => ({
  snow: read('snowfallAmount'),
  qpf: read('quantitativePrecipitation'),
  snowLevel: read('snowLevel'),
  gust: read('windGust'),
  wind: read('windSpeed'),
  temp: read('temperature'),
  pop: read('probabilityOfPrecipitation'),
});

describe('durations and validTime', () => {
  it('reads P{n}DT{n}H{n}M as whole hours', () => {
    expect(durationHours('PT1H')).toBe(1);
    expect(durationHours('PT15H')).toBe(15);
    expect(durationHours('P1D')).toBe(24);
    expect(durationHours('P7DT12H')).toBe(180);
    expect(durationHours('PT2H30M')).toBe(3);
    expect(durationHours('PT0H')).toBeNull();
    expect(durationHours('5H')).toBeNull();
  });
  it('splits start and duration', () => {
    expect(parseValidTime('2026-10-12T13:00:00+00:00/PT5H')).toEqual({ h0: Date.UTC(2026, 9, 12, 13) / H, n: 5 });
    expect(parseValidTime('2026-10-12T13:00:00/PT5H')).toBeNull(); // zone-less start is rejected
    expect(parseValidTime('garbage')).toBeNull();
  });
});

describe('expand', () => {
  it('splits accumulations evenly and repeats state values', () => {
    const t0 = Date.UTC(2027, 0, 5, 0) / H;
    const g = expand({
      snow: [{ h0: t0, n: 6, value: 60 }],
      temp: [{ h0: t0 + 1, n: 3, value: -5 }],
    });
    expect(g?.n).toBe(6);
    expect(g?.f.snow).toEqual([10, 10, 10, 10, 10, 10]);
    expect(g?.f.temp.map((v) => (Number.isNaN(v) ? null : v))).toEqual([null, -5, -5, -5, null, null]);
    // 00Z Jan 5 is 17:00 MST Jan 4
    expect(g?.slots[0]).toEqual({ date: '2027-01-04', hour: 17 });
    expect(g?.slots[5]).toEqual({ date: '2027-01-04', hour: 22 });
  });
  it('rejects an empty or oversized span', () => {
    expect(expand({})).toBeNull();
    expect(expand({ snow: [{ h0: 0, n: 17 * 24, value: 0 }] })).toBeNull();
  });
});

describe('bucketDays on live Alta base (SLC/108,167, updateTime 2026-10-12T19:56Z)', () => {
  const g = expand(liveFields());
  if (!g) throw new Error('fixture did not expand');
  const days = bucketDays(g);
  const oct13 = days.find((d) => d.date === '2026-10-13');

  it('covers 8 local dates from the grid start', () => {
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
    ]);
  });
  it('matches the values verified against the raw grid (§5.7)', () => {
    expect(oct13).toMatchObject({ snowIn: 3.5, qpfIn: 0.3, gustMaxMph: 23, snowLevelMinFt: 7778 });
    expect(days.find((d) => d.date === '2026-10-14')?.snowIn).toBe(2);
    const total = days.reduce((s, d) => s + d.snowIn, 0);
    expect(total).toBeCloseTo(5.5, 1); // 139.7 mm over 7.5 days
  });
  it('splits day (06-18) and night (18 -> 06 next morning)', () => {
    expect(oct13?.snowDayIn).toBe(2.2);
    expect(oct13?.snowNightIn).toBe(2.7);
    expect(oct13?.tMinF).toBe(30);
    expect(oct13?.tMaxF).toBe(36);
    expect(oct13?.popMax).toBe(95);
  });
  it('sums the overnight window ending Oct 14 08:00 to 3.3 in', () => {
    expect(windowSnowIn(g, overnightWindow('2026-10-14'))).toBe(3.3);
    expect(windowSnowIn(g, windowHours('2026-10-13', '08:00', '2026-10-13', '16:00'))).toBe(1.5);
  });
});

describe('Intl budget', () => {
  it('bucketing two grids, one across the DST change, makes <= 400 formatToParts calls', () => {
    // Test-only instrumentation (spec §5.7 step 8); check-repo allows `vi.spyOn(Intl.` in tests, nothing else.
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts');
    const shift = 20 * 24; // 2026-11-01 08Z falls inside the shifted grid
    const shifted = Object.fromEntries(
      Object.entries(liveFields()).map(([k, list]) => [k, list.map((iv) => ({ ...iv, h0: iv.h0 + shift }))]),
    );
    for (const f of [liveFields(), shifted]) {
      const g = expand(f);
      expect(g).not.toBeNull();
      if (!g) continue;
      bucketDays(g);
      windowSnowIn(g, overnightWindow(g.slots[40]?.date ?? ''));
    }
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(400);
    spy.mockRestore();
  });
});
