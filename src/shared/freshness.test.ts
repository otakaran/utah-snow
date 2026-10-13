import { describe, expect, it } from 'vitest';
import { ageMin, badge, isCritical, usable } from './freshness.ts';
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
