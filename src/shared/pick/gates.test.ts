// Live gates of the pick (spec §10.2 steps 4-5) and the date/route rules behind them (C.7, §4.5).
import { describe, expect, it } from 'vitest';
import { BASES } from '../../../config/bases.ts';
import type { PickArgs, PickResult, ResortId, RoadStatus } from '../types.ts';
import { parkingRequired, routeCorridors } from './calendar.ts';
import { pick } from './index.ts';
import { all, scenario } from './test-snap.ts';

const lccStorm = all(3, { alta: 14, snowbird: 14 });
const entry = (res: PickResult, r: ResortId) => res.ranked.find((x) => x.resort === r);
const excludedWhy = (res: PickResult, r: ResortId) => res.excluded.find((x) => x.resort === r)?.reasons ?? [];

function withRoad(args: PickArgs, patch: Partial<RoadStatus>): PickArgs {
  const road = args.snap.roads.lcc.data;
  if (road) Object.assign(road, patch);
  return args;
}

describe('road gates', () => {
  it('penalizes an ETO by 10:00, frees one by 08:30 and excludes a later or unknown one', () => {
    const at = (eto: string | null) =>
      pick(withRoad(scenario('2027-01-05 06:30', { o: lccStorm }), { state: 'closed', eto, reason: 'avalanche' }));
    const mid = at('9:30 AM');
    expect(entry(mid, 'alta')?.net).toBeCloseTo(15.9 - 2, 6);
    expect(entry(mid, 'alta')?.reasons).toContain('SR-210 closed for avalanche control, ETO 9:30 AM (−2)');
    const early = at('8:00AM');
    expect(entry(early, 'alta')?.net).toBeCloseTo(15.9, 6);
    expect(entry(early, 'alta')?.reasons).toContain(
      'SR-210 closed for avalanche control, ETO 8:00 AM – opens before first chair',
    );
    expect(excludedWhy(at('11:00 AM'), 'alta')).toContain('SR-210 closed, ETO 11:00 AM');
    expect(excludedWhy(at(null), 'snowbird')).toContain('SR-210 closed, ETO unknown');
  });

  it('adds Parleys for a Wasatch Back base going to the Cottonwoods', () => {
    const pc = BASES['park-city-old-town'].lon;
    expect(routeCorridors(pc, 'alta')).toEqual(['lcc', 'parleys']);
    expect(routeCorridors(BASES['cottonwood-heights'].lon, 'alta')).toEqual(['lcc']);
    expect(routeCorridors(BASES['cottonwood-heights'].lon, 'deer-valley')).toEqual(['parleys']);
    const args = scenario('2027-01-05 06:30', { o: lccStorm, roads: { parleys: 'interlodge' } });
    expect(pick({ ...args, base: 'park-city-old-town' }).excluded.map((x) => x.resort)).toContain('alta');
    expect(pick(args).excluded.map((x) => x.resort)).toEqual(['deer-valley']);
  });
});

describe('lift, wind and avalanche gates', () => {
  it('charges holds pro rata and excludes all-hold resorts from 09:30', () => {
    const hold = (hm: string, open: number, held: number) => {
      const args = scenario(`2027-01-05 ${hm}`);
      const lifts = args.snap.resorts.brighton.data?.lifts;
      if (lifts) Object.assign(lifts, { open, hold: held });
      return pick(args);
    };
    expect(entry(hold('08:00', 6, 3), 'brighton')?.reasons).toContain('3 of 9 lifts on hold (−1)');
    expect(entry(hold('09:00', 0, 4), 'brighton')?.reasons).toContain('4 of 4 lifts on hold (−3)');
    expect(excludedWhy(hold('09:45', 0, 4), 'brighton')).toContain('All lifts on hold');
  });

  it('reads summit gusts from the live observation after 07:00 and the NWS day max before', () => {
    const late = scenario('2027-01-05 08:00', { o: lccStorm });
    late.snap.obs.data = { HDP: { station: 'HDP', tempF: 10, windMph: 30, gustMph: 55, dirDeg: 270, at: null } };
    expect(entry(pick(late), 'snowbird')?.reasons).toContain(
      'Snowbird summit gusts 55 mph – upper lifts may hold (−3)',
    );
    const early = scenario('2027-01-05 06:30', { o: lccStorm });
    const fc = early.snap.forecast['alta:summit']?.data;
    if (fc) fc.days = [{ date: '2027-01-05', gustMaxMph: 40 } as (typeof fc.days)[number]];
    expect(entry(pick(early), 'alta')?.net).toBeCloseTo(15.9 - 1, 6);
  });

  it('charges high avalanche danger', () => {
    const args = scenario('2027-01-05 06:30');
    const zone = args.snap.avalanche.data?.find((z) => z.zoneId === 1737);
    if (zone) Object.assign(zone, { level: 4, danger: 'high' });
    expect(entry(pick(args), 'snowbasin')?.reasons).toContain('UAC avalanche danger high (level 4) (−1)');
  });
});

describe('parking calendar (C.7)', () => {
  it('requires reservations on holiday-period, weekend and MLK days only', () => {
    const req = (date: string) => (['alta', 'brighton', 'solitude'] as const).map((r) => parkingRequired(r, date));
    expect(req('2026-12-27')).toEqual([true, true, true]);
    expect(req('2027-01-05')).toEqual([false, false, false]);
    expect(req('2027-01-09')).toEqual([true, true, true]);
    expect(req('2027-01-18')).toEqual([true, true, true]);
    expect(req('2027-01-19')).toEqual([false, true, false]);
    expect(parkingRequired('snowbird', '2027-01-09')).toBe(false);
  });
});
