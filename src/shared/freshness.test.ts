import { describe, expect, it } from 'vitest';
import { ageMin, badge, freshLabel, freshSummary, isCritical, usable } from './freshness.ts';
import type { Meta } from './types.ts';

const NOW = Date.parse('2027-01-05T13:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const meta = (over: Partial<Meta> = {}): Meta => ({
  source: 'test',
  fetchedAt: minutesAgo(0),
  okAt: minutesAgo(0),
  asOf: null,
  status: 'ok',
  failCount: 0,
  staleAfterMin: 30,
  ...over,
});

describe('freshness', () => {
  it('derives age from okAt', () => {
    expect(ageMin(meta({ okAt: minutesAgo(12) }), NOW)).toBeCloseTo(12, 9);
    expect(ageMin(meta({ okAt: null }), NOW)).toBeNull();
  });

  it('ages from green to amber to red at 1x and 2x staleAfter', () => {
    expect(badge(meta({ okAt: minutesAgo(30) }), NOW)).toBe('green');
    expect(badge(meta({ okAt: minutesAgo(31) }), NOW)).toBe('amber');
    expect(badge(meta({ okAt: minutesAgo(60) }), NOW)).toBe('amber');
    expect(badge(meta({ okAt: minutesAgo(61) }), NOW)).toBe('red');
    expect(badge(meta({ okAt: null }), NOW)).toBe('red');
  });

  it('one failure is amber, two are red', () => {
    expect(badge(meta({ status: 'error', failCount: 1 }), NOW)).toBe('amber');
    expect(badge(meta({ status: 'blocked', failCount: 1 }), NOW)).toBe('amber');
    expect(badge(meta({ status: 'error', failCount: 2 }), NOW)).toBe('red');
  });

  it('offseason is grey whatever its age', () => {
    expect(badge(meta({ status: 'offseason', okAt: null }), NOW)).toBe('grey');
  });

  it('advisory rows (obs) never go red: amber is their ceiling', () => {
    expect(badge(meta({ source: 'obs', okAt: null }), NOW)).toBe('amber');
    expect(badge(meta({ source: 'obs', status: 'error', failCount: 156, okAt: minutesAgo(3 * 1440) }), NOW)).toBe(
      'amber',
    );
    expect(badge(meta({ source: 'obs' }), NOW)).toBe('green');
    expect(badge(meta({ source: 'snotel', okAt: null }), NOW)).toBe('red');
  });

  it('usable means green or amber', () => {
    expect(usable(meta(), NOW)).toBe(true);
    expect(usable(meta({ status: 'error', failCount: 1 }), NOW)).toBe(true);
    expect(usable(meta({ status: 'error', failCount: 2 }), NOW)).toBe(false);
    expect(usable(meta({ status: 'offseason' }), NOW)).toBe(false);
  });
});

describe('isCritical', () => {
  it('matches the row ids the worker writes', () => {
    for (const id of ['resort:alta', 'roads:lcc', 'nws:alta:summit', 'avy:uac']) expect(isCritical(id)).toBe(true);
    for (const id of ['nws:alta:base', 'nws:afd', 'snotel', 'cams:status']) expect(isCritical(id)).toBe(false);
  });

  it('exempts blocked rows the browser refetches (MtnPowder), not other blocked rows', () => {
    expect(isCritical('resort:solitude', 'blocked')).toBe(false);
    expect(isCritical('resort:deer-valley', 'blocked')).toBe(false);
    expect(isCritical('resort:solitude', 'error')).toBe(true);
    expect(isCritical('resort:brighton', 'blocked')).toBe(true);
  });
});

describe('freshSummary and freshLabel', () => {
  const CRITICAL = [
    ...['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley', 'snowbasin'].flatMap((r) => [
      `resort:${r}`,
      `nws:${r}:summit`,
    ]),
    ...['lcc', 'bcc', 'parleys', 'snowbasin'].map((c) => `roads:${c}`),
    'avy:uac',
  ];
  const rows = (over: Record<string, Partial<Meta>> = {}): Meta[] => [
    ...CRITICAL.map((source) => meta({ source, ...over[source] })),
    meta({ source: 'obs', okAt: null }), // advisory and not critical: never counted
    meta({ source: 'cams:status', okAt: null }),
  ];
  const down: Partial<Meta> = { status: 'error', failCount: 2 };

  it('one resort row down out of 17 is "1 source down", not the whole site', () => {
    const f = freshSummary(rows({ 'resort:snowbasin': down }), NOW);
    expect(f).toEqual({ badge: 'red', red: 1, amber: 0, total: 17 });
    expect(freshLabel(f)).toEqual({ long: '1 source down', short: '1 down' });
    const two = freshSummary(rows({ 'resort:snowbasin': down, 'roads:lcc': down }), NOW);
    expect(freshLabel(two)).toEqual({ long: '2 sources down', short: '2 down' });
  });

  it('half or more of the rows that count down is "Data down"', () => {
    const nine = Object.fromEntries(CRITICAL.slice(0, 9).map((id) => [id, down]));
    expect(freshLabel(freshSummary(rows(nine), NOW))).toEqual({ long: 'Data down', short: 'Down' });
  });

  it('off-season rows do not count, and blocked MtnPowder rows are not critical', () => {
    const off = Object.fromEntries(
      CRITICAL.filter((id) => id.startsWith('resort:')).map((id) => [id, { status: 'offseason' } as const]),
    );
    const f = freshSummary(
      rows({ ...off, 'resort:snowbasin': down, 'resort:solitude': { status: 'blocked', failCount: 9 } }),
      NOW,
    );
    expect(f).toEqual({ badge: 'red', red: 1, amber: 0, total: 12 });
    const allOff = freshSummary(
      CRITICAL.slice(0, 2).map((source) => meta({ source, status: 'offseason' })),
      NOW,
    );
    expect(freshLabel(allOff)).toEqual({ long: 'Off-season', short: 'Off' });
  });

  it('amber counts its rows; green and no rows have their own words', () => {
    const stale = freshSummary(
      rows({ 'avy:uac': { okAt: minutesAgo(45) }, 'roads:bcc': { okAt: minutesAgo(45) } }),
      NOW,
    );
    expect(freshLabel(stale)).toEqual({ long: '2 sources stale', short: 'Stale' });
    expect(freshLabel(freshSummary(rows(), NOW))).toEqual({ long: 'Data OK', short: 'OK' });
    expect(freshSummary([meta({ source: 'obs' })], NOW)).toBeNull();
    expect(freshLabel(null)).toEqual({ long: 'No data yet', short: '—' });
  });
});
