import { describe, expect, it } from 'vitest';
import { mtnIso, mtnLiftState, parseMtnPowder } from './mtnpowder.ts';

const NOW = Date.parse('2026-12-28T13:30:00Z'); // Mon 06:30 MST
const area = (v: (string | number)[]) => ({
  SinceLiftsClosedIn: v[0],
  BaseIn: v[1],
  Last24HoursIn: v[2],
  Last48HoursIn: v[3],
  Last72HoursIn: v[4],
  Last7DaysIn: v[5],
});
const DASH = area(['--', '--', '--', '--', '--', '--']);

function feed(over: Record<string, unknown> = {}, sr: Record<string, unknown> = {}) {
  return {
    Name: 'Solitude',
    SnowReport: {
      LastUpdate: '2026-12-28T05:24:00-0700',
      BaseConditions: 'Powder',
      Report: '--',
      StormTotalIn: '14.0',
      SeasonTotalIn: 131,
      TotalOpenLifts: 0,
      TotalLifts: '9',
      BaseArea: DASH,
      MidMountainArea: area(['8.0', '48', '9.0', '14', '14', '--']),
      SummitArea: DASH,
      ...sr,
    },
    MountainAreas: [
      {
        Name: 'Moonbeam Area',
        Lifts: [
          { Id: 536, Name: 'Moonbeam Express', Status: 'Scheduled', StatusEnglish: 'open', Hours: {} },
          null,
          { Id: 542, Name: 'Honeycomb Return', Status: 'Bogus Status', StatusEnglish: 'x' },
        ],
      },
    ],
    ...over,
  };
}
const OPENED = { seasonOpenedAt: '2026-11-20T08:30:00-07:00' };

describe('mtnLiftState (§5.5 table)', () => {
  it('maps the exact slugs, including the ones Liftie gets wrong', () => {
    const cases: [string, string][] = [
      ['Open', 'open'],
      ['Open First Tracks', 'open'],
      ['30 Mins or Less', 'open'],
      ['Mechanical Hold', 'hold'],
      ['Lightning Hold', 'hold'],
      ['Delayed', 'scheduled'],
      ['Pending Avalanche Mitigation', 'scheduled'],
      ['Anticipated Weather Impact', 'scheduled'],
      ['Wind Closure', 'closed'],
      ['Closed for Season', 'closed'],
      ['Open Uphill Only', 'closed'],
      ['Open Ski & Ride School Only', 'closed'],
    ];
    for (const [raw, state] of cases) expect([raw, mtnLiftState(raw)]).toEqual([raw, { state, known: true }]);
  });

  it('falls back by regex, then to closed (logged), and to unknown when empty', () => {
    expect(mtnLiftState('Hold for Patrol').state).toBe('hold');
    expect(mtnLiftState('Mitigation Underway').state).toBe('scheduled');
    expect(mtnLiftState('Patrol Closure Today').state).toBe('closed');
    expect(mtnLiftState('Open Lower Mountain').state).toBe('open');
    expect(mtnLiftState('Spinning Backwards')).toEqual({ state: 'closed', known: false });
    expect(mtnLiftState('')).toEqual({ state: 'unknown', known: false });
    expect(mtnLiftState(undefined)).toEqual({ state: 'unknown', known: false });
  });
});

describe('mtnIso', () => {
  it('adds the colon to ±HHMM offsets and rejects zone-less or placeholder stamps', () => {
    expect(mtnIso('2026-10-07T15:50:41-0600')).toBe('2026-10-07T15:50:41-06:00');
    expect(mtnIso('2026-10-07T15:50:41-06:00')).toBe('2026-10-07T15:50:41-06:00');
    expect(mtnIso('2026-10-07T15:50:41')).toBeNull();
    expect(mtnIso('--')).toBeNull();
  });
});

describe('parseMtnPowder', () => {
  it('gates on the exact Name and a SnowReport object', () => {
    expect(parseMtnPowder(null, 'solitude', NOW, null)).toMatchObject({ ok: false });
    expect(parseMtnPowder({ Name: 'Solitude ' }, 'solitude', NOW, null)).toMatchObject({ ok: false });
    expect(parseMtnPowder(feed(), 'deer-valley', NOW, null)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not Deer Valley/),
    });
    expect(parseMtnPowder(feed({ SnowReport: '--' }), 'solitude', NOW, null)).toEqual({
      ok: false,
      error: 'SnowReport missing',
    });
  });

  it('reads tolerant numbers, skips null lifts, prefers Status over StatusEnglish and reports unmapped values', () => {
    const r = parseMtnPowder(feed(), 'solitude', NOW, OPENED);
    if (!r.ok) throw new Error(r.error);
    const { snow, lifts, season } = r.data;
    expect(season).toBe('open'); // a lift is scheduled now
    expect(snow).toMatchObject({ overnightIn: 8, new24hIn: 9, new48hIn: 14, new7dIn: null, seasonTotalIn: 131 });
    expect(snow).toMatchObject({ reportAt: '2026-12-28T05:24:00-07:00', reportIsToday: true, area: 'mid' });
    expect(lifts).toMatchObject({ open: 0, scheduled: 1, total: 9 });
    expect(lifts.list.map((l) => [l.id, l.state, l.opensAt])).toEqual([
      ['536', 'scheduled', null],
      ['542', 'closed', null],
    ]);
    expect(r.unmapped).toEqual(['Bogus Status']);
    expect(r.data.parking).toEqual({ state: 'unknown', raw: null });
  });

  it('report before 03:00 or from another day is not today', () => {
    const early = parseMtnPowder(feed({}, { LastUpdate: '2026-12-28T02:10:00-0700' }), 'solitude', NOW, OPENED);
    const old = parseMtnPowder(feed({}, { LastUpdate: '2026-12-27T06:00:00-0700' }), 'solitude', NOW, OPENED);
    expect(early.ok && early.data.snow.reportIsToday).toBe(false);
    expect(old.ok && old.data.snow.reportIsToday).toBe(false);
  });

  it('uses another area only when Mid has no 24 h number, and adds summit only when it has numbers', () => {
    const summitOnly = feed({}, { MidMountainArea: DASH, SummitArea: area([2, 60, 4, 6, 8, 12]) });
    const r = parseMtnPowder(summitOnly, 'solitude', NOW, OPENED);
    expect(r.ok && r.data.snow).toMatchObject({ area: 'summit', new24hIn: 4, baseDepthIn: 60 });
    expect(r.ok && r.data.snow.summit).toBeUndefined();
    const both = feed({}, { SummitArea: area(['10', '50', '12', '--', '--', '--']) });
    const b = parseMtnPowder(both, 'solitude', NOW, OPENED);
    expect(b.ok && b.data.snow.summit).toEqual({ overnightIn: 10, new24hIn: 12 });
  });

  it('pre-season nulls numeric snow and surface; implausible values are dropped', () => {
    const r = parseMtnPowder(feed({}, { SeasonTotalIn: '9999' }), 'solitude', NOW, null);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.season).toBe('preseason'); // scheduled lifts alone never open the season
    expect(r.data.snow).toMatchObject({ overnightIn: null, stormTotalIn: null, surface: null, reportIsToday: true });
    const open = parseMtnPowder(feed({}, { SeasonTotalIn: '9999' }), 'solitude', NOW, OPENED);
    expect(open.ok && open.data.snow).toMatchObject({ seasonTotalIn: null, stormTotalIn: 14, surface: 'Powder' });
  });

  it('ignores a malformed prev and opens the season from TotalOpenLifts after the floor', () => {
    const r = parseMtnPowder(feed({}, { TotalOpenLifts: '3' }), 'solitude', NOW, { seasonOpenedAt: 'yesterday' });
    expect(r.ok && r.data).toMatchObject({ season: 'open', seasonOpenedAt: '2026-12-28T06:30:00-07:00' });
    expect(r.ok && r.data.lifts.open).toBe(3);
  });
});
