import { describe, expect, it } from 'vitest';
import { SLOTS } from '../../../config/schedule.ts';
import type { PointForecast } from '../../shared/types.ts';
import live from './fixtures/nws-grid/20261012-live.json?raw';
import synthetic from './fixtures/nws-grid/nws-grid-synthetic.json?raw';
import { NWS_GRID_SOURCES, nwsGrid } from './nws-grid.ts';
import { type FetchCtx, type FetchOpts, ValidationError } from './types.ts';

const altaBase = nwsGrid('alta', 'base');
const ROW = 'nws:alta:base';
const run = (raw: string | unknown, now: string, prev: Record<string, unknown> = {}) => {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return altaBase.parse(payload, { now: Date.parse(now), prev }).rows[ROW] as PointForecast;
};

describe('nws-grid on the live Alta base grid (2026-10-12, updateTime 19:56Z, starts 13:00Z)', () => {
  const pf = run(live, '2026-10-12T21:55:00Z'); // the 15:55 MDT fetch

  it('maps metadata and the grid cell elevation', () => {
    expect(pf).toMatchObject({ resortId: 'alta', point: 'base', grid: 'SLC/108,167', trueElevFt: 8530 });
    expect(pf.gridElevFt).toBe(9800); // 2987.04 m
    expect(pf.updateTime).toBe('2026-10-12T19:56:36+00:00');
    expect(pf.days[0]?.date).toBe('2026-10-12');
    expect(pf.days.find((d) => d.date === '2026-10-13')?.snowIn).toBe(3.5);
  });
  it('marks today overnight partial: the grid starts after D-1 16:00 and no frozen entry exists', () => {
    expect(pf.overnight).toMatchObject({
      from: '2026-10-11T22:00:00.000Z',
      to: '2026-10-12T14:00:00.000Z',
      coverage: 'partial',
      snowIn: 0,
    });
  });
  it('freezes tomorrow overnight (the grid covers all 16 hours)', () => {
    expect(Object.keys(pf.frozen)).toEqual(['2026-10-13']);
    expect(pf.frozen['2026-10-13']?.hourlyIn).toHaveLength(16);
    expect(pf.frozen['2026-10-13']?.updateTime).toBe(pf.updateTime);
    expect(pf.tonightSnowIn).toBe(0.3);
    expect(pf.tomorrowDaytimeSnowIn).toBe(1.5);
  });
  it('gives the 3.3 in overnight ending Oct 14 08:00 when D = Oct 13', () => {
    const d13 = run(live, '2026-10-13T12:00:00Z'); // 06:00 MDT
    expect(d13.overnight).toMatchObject({ snowIn: 0.3, coverage: 'full' });
    expect(d13.tonightSnowIn).toBe(3.3);
    expect(d13.frozen['2026-10-14']?.hourlyIn.reduce((a, b) => a + b, 0)).toBeCloseTo(3.33, 2);
  });
  it('fills hours before the grid start from frozen[D] and keeps the 3 newest dates', () => {
    const hourlyIn = new Array(16).fill(0.25);
    const old = { hourlyIn: [0], updateTime: 'x' };
    const prev = {
      [ROW]: {
        frozen: {
          '2026-10-09': { hourlyIn, updateTime: '2026-10-08T21:00:00+00:00' },
          '2026-10-10': { hourlyIn, updateTime: '2026-10-09T21:00:00+00:00' },
          '2026-10-11': { hourlyIn, updateTime: '2026-10-10T21:00:00+00:00' },
          '2026-10-12': { hourlyIn, updateTime: '2026-10-11T21:05:00+00:00' },
          bogus: old,
        },
      },
    };
    const out = run(live, '2026-10-12T21:55:00Z', prev);
    // 15 frozen hours x 0.25 in + the grid's 13:00Z hour (0)
    expect(out.overnight).toMatchObject({ snowIn: 3.8, coverage: 'frozen', issuedAt: '2026-10-11T21:05:00+00:00' });
    expect(Object.keys(out.frozen)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
  });
});

describe('nws-grid on the synthetic in-season grid (fetched 06:35 MST 2027-01-06)', () => {
  const now = '2027-01-06T13:35:00Z';
  const frozenD = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.2, 9, 9];
  const prev = { [ROW]: { frozen: { '2027-01-06': { hourlyIn: frozenD, updateTime: '2027-01-05T21:40:00+00:00' } } } };
  const pf = run(synthetic, now, prev);

  it('sums frozen hours before 13:00Z plus the grid hours after it', () => {
    // 7 x 0.1 + 6 x 0.5 + 0.2 frozen, then 2 grid hours x 0.3 (38.1 mm / 5 h); frozen 9s are superseded
    expect(pf.overnight).toMatchObject({ snowIn: 4.5, coverage: 'frozen', issuedAt: '2027-01-05T21:40:00+00:00' });
    expect(pf.overnight.from).toBe('2027-01-05T23:00:00.000Z'); // 16:00 MST
    expect(pf.overnight.to).toBe('2027-01-06T15:00:00.000Z'); // 08:00 MST
  });
  it('splits today and tonight at 08/16 local', () => {
    expect(pf.todayDaytimeSnowIn).toBe(1.3);
    expect(pf.tonightSnowIn).toBe(3.5);
    expect(pf.tomorrowDaytimeSnowIn).toBe(0.6);
  });
  it('converts units per day', () => {
    const jan6 = pf.days.find((d) => d.date === '2027-01-06');
    expect(jan6).toMatchObject({ snowIn: 3.3, tMinF: 10, tMaxF: 20, popMax: 100, gustMaxMph: 52, windMaxMph: 28 });
    expect(jan6?.snowLevelMinFt).toBe(4600); // 1402.08 m
    expect(jan6?.snowLevelMaxFt).toBe(5000); // 1524 m
    expect(pf.days.reduce((s, d) => s + d.snowIn, 0)).toBeCloseTo(6, 1);
  });
  it('replaces a frozen entry of the wrong length: hours before the grid are missing', () => {
    const bad = { [ROW]: { frozen: { '2027-01-06': { hourlyIn: [1, 2], updateTime: 'x' } } } };
    expect(run(synthetic, now, bad).overnight.coverage).toBe('partial');
  });
});

describe('nws-grid validation gate', () => {
  const now = '2026-10-12T21:55:00Z';
  it('throws ValidationError on garbage, a unit change, a stale or an expired grid', () => {
    expect(() => run({ error: 'Unexpected Problem' }, now)).toThrow(ValidationError);
    expect(() => run(null, now)).toThrow(ValidationError);
    const g = JSON.parse(live);
    expect(() =>
      run({ properties: { ...g.properties, snowfallAmount: { uom: 'wmoUnit:in', values: [] } } }, now),
    ).toThrow(ValidationError);
    expect(() => run(live, '2026-10-15T00:00:00Z')).toThrow(/not updated since/);
    const expired = { properties: { ...g.properties, updateTime: '2026-10-21T00:00:00+00:00' } };
    expect(() => run(expired, '2026-10-21T01:00:00Z')).toThrow(/ends before now/);
  });
});

describe('nws-grid source wiring', () => {
  it('has one instance per scheduled nws-grid job, each one subrequest', () => {
    const scheduled = SLOTS.flatMap((s) => s.always).filter((j) => j.startsWith('nws-grid:'));
    expect(NWS_GRID_SOURCES.map((s) => s.id).sort()).toEqual([...scheduled].sort());
    for (const s of NWS_GRID_SOURCES) {
      expect(s.maxSubrequests({} as FetchCtx)).toBe(1);
      expect(s.rows).toEqual([s.id.replace('nws-grid:', 'nws:')]);
      expect(s.staleAfterMin).toBe(180);
    }
  });
  it('GETs the grid as geo+json without following redirects', async () => {
    const calls: [string, FetchOpts | undefined][] = [];
    const fetch = (async (url: string, opts?: FetchOpts) => {
      calls.push([url, opts]);
      return { status: 200, url, headers: new Headers(), data: live, bytes: 0, blocked: false, wallMs: 0 };
    }) as unknown as FetchCtx['fetch'];
    const raw = await nwsGrid('snowbasin', 'summit').fetch({ fetch } as FetchCtx);
    expect(calls[0]?.[0]).toBe('https://api.weather.gov/gridpoints/SLC/103,195');
    expect(calls[0]?.[1]).toMatchObject({ headers: { Accept: 'application/geo+json' }, follow: false });
    expect((raw as { properties: { gridX: number } }).properties.gridX).toBe(108);
  });
});
