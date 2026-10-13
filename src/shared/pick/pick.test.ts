// Spec §10.4 scenario tests (expected rank-1 and net) plus the mode/scope checks M1-M4.
import { describe, expect, it, vi } from 'vitest';
import { isoToMs } from '../time.ts';
import type { PickResult, ResortId } from '../types.ts';
import { pick, pickTomorrow } from './index.ts';
import { all, EVA, OTAKAR, type Scenario, scenario } from './test-snap.ts';
import { expiringFrom, invExceed, skiDaysLeft } from './threshold.ts';

const run = (date: string, s: Scenario = {}): PickResult => pick(scenario(`${date} 06:30`, s));
const entry = (res: PickResult, r: ResortId) => res.ranked.find((x) => x.resort === r);
const net = (res: PickResult, r: ResortId) => entry(res, r)?.net ?? Number.NaN;
const why = (res: PickResult, r: ResortId) => [
  ...(entry(res, r)?.reasons ?? []),
  ...(res.excluded.find((x) => x.resort === r)?.reasons ?? []),
];
const threshold = (res: PickResult, g: keyof PickResult['thresholds']) => res.thresholds[g]?.threshold ?? Number.NaN;

describe('save-thresholds', () => {
  it('matches the trip-start values and the Jan 24 use-it-or-lose-it date', () => {
    const u = 7 / skiDaysLeft('2026-12-27', 0.85).sx;
    expect(invExceed('alta-snowbird', u)).toBeCloseTo(4.2, 1);
    expect(invExceed('brighton', u)).toBeCloseTo(2.7, 1);
    expect(invExceed('deer-valley', u)).toBeCloseTo(2.6, 1);
    expect(invExceed('snowbasin', u)).toBeCloseTo(3.3, 1);
    expect(invExceed('brighton', 1)).toBe(0);
    expect(invExceed('brighton', 0.01)).toBe(14);
    expect(expiringFrom(7, 0.85)).toBe('2027-01-24');
  });
});

describe('pick scenarios (§10.4)', () => {
  it('P1 quiet day after 4 Solitude days: Solitude; no capped day is free', () => {
    const res = run('2026-12-31', { people: [{ ...OTAKAR, used: { solitude: 4 } }] });
    expect(res.pick).toBe('solitude');
    expect(net(res, 'solitude')).toBeCloseTo(-0.33, 2);
    expect(threshold(res, 'alta-snowbird')).toBeCloseTo(3.35, 2);
    expect(threshold(res, 'brighton')).toBeCloseTo(2.19, 2);
    expect(threshold(res, 'deer-valley')).toBeCloseTo(2.12, 2);
    expect(threshold(res, 'snowbasin')).toBeCloseTo(2.65, 2);
    expect(res.ranked[1]?.resort).toBe('brighton');
    expect(net(res, 'brighton')).toBeCloseTo(-4.79, 2);
    expect(res.ranked.filter((x) => x.resort !== 'solitude').every((x) => x.cls === 2)).toBe(true);
    expect(res.lowValue).toBe(false);
    expect(res.tier).toBe('quiet');
  });

  it('P2 14″ LCC storm: Snowbird wins the band on drive', () => {
    const res = run('2027-01-05', { o: all(3, { alta: 14, snowbird: 14, brighton: 8, solitude: 8 }) });
    expect(res.pick).toBe('snowbird');
    expect(net(res, 'snowbird')).toBeCloseTo(16.1, 2);
    expect(net(res, 'alta')).toBeCloseTo(15.9, 2);
    expect(entry(res, 'alta')?.cls).toBe(1);
    expect(why(res, 'snowbird').some((s) => s.includes('14″ ≥ save-threshold 2.4″'))).toBe(true);
    expect(res.tier).toBe('deep');
  });

  it('P3 equal storm at trip start: Alta; Snowbird busy; Solitude third', () => {
    const res = run('2026-12-27', { o: all(14) });
    expect(res.pick).toBe('alta');
    expect(net(res, 'alta')).toBeCloseTo(15.9, 2);
    expect(net(res, 'snowbird')).toBeCloseTo(15.1, 2);
    expect(res.ranked[2]?.resort).toBe('solitude');
    expect(net(res, 'solitude')).toBeCloseTo(13.67, 2);
    const small = run('2026-12-27', { o: all(4) });
    expect(small.pick).toBe('solitude');
    expect(net(small, 'solitude')).toBeCloseTo(3.67, 2);
    expect(entry(small, 'alta')?.cls).toBe(2);
  });

  it('P4 LCC interlodge: Solitude beats Brighton in the band on cls', () => {
    const o = all(3, { alta: 14, snowbird: 14, brighton: 8, solitude: 8 });
    const res = run('2027-01-05', { o, roads: { lcc: 'interlodge' } });
    expect(res.pick).toBe('solitude');
    expect(net(res, 'solitude')).toBeCloseTo(7.67, 2);
    expect(net(res, 'brighton')).toBeCloseTo(7.4, 2);
    for (const r of ['alta', 'snowbird'] as const) expect(why(res, r)).toContain('SR-210: interlodge');
  });

  it('P5 snowboarder in the crew: Snowbird; Otakar diverges to Alta', () => {
    const people = [OTAKAR, { ...EVA, mode: 'board' as const }];
    const o = all(6, { alta: 16, snowbird: 12 });
    const res = run('2027-01-06', { people, o });
    expect(res.pick).toBe('snowbird');
    expect(net(res, 'snowbird')).toBeCloseTo(13.8, 2);
    for (const r of ['alta', 'deer-valley'] as const) {
      expect(why(res, r).some((s) => s.startsWith('Eva snowboards – ') && s.endsWith('skiers-only'))).toBe(true);
    }
    const me = run('2027-01-06', { people, o, scope: 'me', memberIds: ['o'] });
    expect(me.pick).toBe('alta');
    expect(net(me, 'alta')).toBeCloseTo(18.2, 2);
    expect(res.divergences).toHaveLength(1);
    expect(res.divergences[0]).toMatchObject({ personId: 'o', name: 'Otakar', resort: 'alta' });
    expect(res.divergences[0]?.gain).toBeCloseTo(4.4, 2);
    expect(why(res, 'snowbird')).toContain('Otakar would pick Alta (+4.4)');
  });

  it('P6 member with unknown mode: Alta, with a confirm line', () => {
    const people = [OTAKAR, { ...EVA, mode: 'unknown' as const }];
    const res = run('2027-01-06', { people, o: all(6, { alta: 16, snowbird: 12 }) });
    expect(res.pick).toBe('alta');
    expect(net(res, 'alta')).toBeCloseTo(18.2, 2);
    expect(why(res, 'alta')).toContain('Confirm ski/board for Eva');
    expect(net(res, 'deer-valley')).toBeCloseTo(3.7, 2);
  });

  it('P7 last week with unused Deer Valley and Snowbasin days: Deer Valley', () => {
    const used = { alta: 4, snowbird: 3, brighton: 6, 'deer-valley': 3, snowbasin: 2 };
    const res = run('2027-01-28', { people: [{ ...OTAKAR, used }] });
    expect(res.pick).toBe('deer-valley');
    expect(net(res, 'deer-valley')).toBeCloseTo(0.6, 2);
    expect(net(res, 'solitude')).toBeCloseTo(-0.33, 2);
    expect(net(res, 'snowbasin')).toBeCloseTo(-1, 2);
    expect(net(res, 'brighton')).toBeCloseTo(-4.17, 2);
    expect(threshold(res, 'brighton')).toBeCloseTo(1.57, 2);
    for (const r of ['alta', 'snowbird'] as const) {
      expect(why(res, r).some((s) => s.includes('0 Alta/Snowbird days left'))).toBe(true);
    }
    expect(why(res, 'deer-valley').some((s) => s.startsWith('Use-it-or-lose-it: 4 Deer Valley days left'))).toBe(true);
  });

  it('P8 Saturday with required parking: Brighton; without bookings Solitude', () => {
    const o = all(2, { brighton: 10, solitude: 10, alta: 4, snowbird: 4 });
    const res = run('2027-01-02', { o, bookings: [{ date: '2027-01-02', kind: 'brighton-parking', personId: '*' }] });
    expect(res.pick).toBe('brighton');
    expect(net(res, 'brighton')).toBeCloseTo(9.4, 2);
    expect(net(res, 'solitude')).toBeCloseTo(8.17, 2);
    expect(res.actions).toEqual([]);
    const none = run('2027-01-02', { o, bookings: [] });
    expect(none.pick).toBe('solitude');
    expect(net(none, 'brighton')).toBeCloseTo(7.9, 2);
    expect(none.actions.map((a) => a.label)).toContain('Book Solitude parking');
  });
});

describe('modes and scope', () => {
  it('M1 at 15:30 MST runs a forecast-only tomorrow pick that ignores live roads (TZ Los Angeles)', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    try {
      const nowMs = isoToMs('2027-01-05T22:30:00Z') ?? 0;
      const live = { roads: { lcc: 'interlodge' as const }, tonight: { alta: 10 }, tomorrowDay: { alta: 4 } };
      const args = scenario('2027-01-05 15:30', live);
      expect(args.nowMs).toBe(nowMs);
      const t = pickTomorrow(args);
      expect(t?.mode).toBe('tomorrow');
      expect(t?.date).toBe('2027-01-06');
      expect(t && entry(t, 'alta')?.eff).toBeCloseTo(0.8 * 10 + 0.5 * 4, 6);
      expect(t?.excluded.map((x) => x.resort)).not.toContain('alta');
      expect(t?.pick).toBe('alta');
      const today = pick(args);
      expect(today.mode).toBe('today');
      expect(today.excluded.map((x) => x.resort)).toContain('alta');
      expect(pickTomorrow(scenario('2027-01-05 14:59'))).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('M2 before the trip: preview of Dec 27 without opening, parking or DV checks', () => {
    const res = pick(scenario('2026-10-12 12:00', { operating: false, bookings: [] }));
    expect(res.mode).toBe('preview');
    expect(res.date).toBe('2026-12-27');
    expect(res.ranked.length).toBeGreaterThanOrEqual(1);
    const text = [...res.excluded.flatMap((x) => x.reasons), ...res.ranked.flatMap((x) => x.reasons)].join('\n');
    expect(text).not.toMatch(/Not open yet|parking reservation|DV Ikon/);
    expect(res.ranked[0]?.reasons[0]).toBe('Preview – resorts not open yet; bookings not checked');
    expect(res.actions).toEqual([]);
  });

  it('placeholder {} payloads (the e2e seed) still rank every resort instead of throwing', () => {
    const args = scenario('2026-10-12 12:00', { operating: false, bookings: [] });
    const blank = { data: {}, meta: args.snap.resorts.alta.meta } as unknown as (typeof args.snap.resorts)['alta'];
    const resorts = Object.fromEntries(Object.keys(args.snap.resorts).map((r) => [r, blank]));
    const forecast = Object.fromEntries(Object.keys(args.snap.forecast).map((k) => [k, blank]));
    const snap = { ...args.snap, resorts, forecast } as unknown as typeof args.snap;
    const res = pick({ ...args, snap });
    expect(res.ranked).toHaveLength(6);
    expect(res.ranked[0]?.fresh.source).toBe('none');
    expect(pickTomorrow({ ...args, snap, nowMs: Date.parse('2027-01-04T23:00:00Z') })?.pick).toBeTruthy();
  });

  it('M3 crew minimum: Eva has 1 A/S day, so the crew takes Solitude while Otakar alone takes Alta', () => {
    const people = [OTAKAR, { ...EVA, used: { alta: 6 } }];
    const o = all(6, { alta: 8, snowbird: 8 });
    const crew = run('2026-12-30', { people, o });
    expect(crew.pick).toBe('solitude');
    expect(threshold(crew, 'alta-snowbird')).toBeCloseTo(13.8, 1);
    expect(crew.thresholds['alta-snowbird']?.remaining).toBe(1);
    const me = run('2026-12-30', { people, o, scope: 'me', memberIds: ['o'] });
    expect(me.pick).toBe('alta');
    expect(net(me, 'alta')).toBeCloseTo(9.0, 2);
    expect(crew.divergences.map((d) => d.personId)).toEqual(['o']);
  });

  it('M4 after the trip: post, no pick', () => {
    const res = run('2027-02-01');
    expect(res.mode).toBe('post');
    expect(res.pick).toBeNull();
    expect(res.ranked).toEqual([]);
  });
});
