import { describe, expect, it } from 'vitest';
import { type CapDay, crewRemaining, exceedsCap, GROUP_VALUES, group, remaining, skiersOnly, summary } from './caps.ts';
import type { TrackerResort } from './types.ts';

const days = (personId: string, resorts: TrackerResort[], status: CapDay['status'] = 'skied'): CapDay[] =>
  resorts.map((resortId, i) => ({ personId, resortId, status, date: `2027-01-${String(i + 1).padStart(2, '0')}` }));

describe('cap groups', () => {
  it('maps alta, snowbird and the combo day to one group', () => {
    expect(['alta', 'snowbird', 'alta-snowbird'].map((r) => group(r as TrackerResort))).toEqual([
      'alta-snowbird',
      'alta-snowbird',
      'alta-snowbird',
    ]);
    expect(group('brighton')).toBe('brighton');
    expect([...GROUP_VALUES['alta-snowbird']].sort()).toEqual(['alta', 'alta-snowbird', 'snowbird']);
    expect(skiersOnly('alta-snowbird')).toBe(true);
    expect(skiersOnly('snowbird')).toBe(false);
  });

  it('shares 7 days between Alta and Snowbird; a combo day counts once', () => {
    const rows = days('p1', ['alta', 'alta', 'snowbird', 'snowbird', 'alta-snowbird', 'alta', 'snowbird']);
    expect(remaining(rows, 'p1', 'alta-snowbird')).toBe(0);
    expect(remaining(days('p1', ['alta-snowbird', 'alta-snowbird']), 'p1', 'alta-snowbird')).toBe(5);
  });

  it('caps each other resort at 7 on its own; planned days reserve', () => {
    const rows = [...days('p1', Array(7).fill('brighton'), 'planned')];
    expect(remaining(rows, 'p1', 'brighton')).toBe(0);
    expect(remaining(rows, 'p1', 'deer-valley')).toBe(7);
    expect(remaining(rows, 'p2', 'brighton')).toBe(7);
  });

  it('leaves Solitude unlimited', () => {
    const rows = days('p1', Array(20).fill('solitude'));
    expect(remaining(rows, 'p1', 'solitude')).toBe(Number.POSITIVE_INFINITY);
    expect(exceedsCap(rows, { personId: 'p1', date: '2027-01-25', resortId: 'solitude' })).toBe(false);
  });

  it('rejects the 8th day but allows editing an existing date', () => {
    const rows = days('p1', Array(7).fill('snowbasin'));
    expect(exceedsCap(rows, { personId: 'p1', date: '2027-01-20', resortId: 'snowbasin' })).toBe(true);
    expect(exceedsCap(rows, { personId: 'p1', date: '2027-01-03', resortId: 'snowbasin' })).toBe(false);
    expect(
      exceedsCap(days('p1', Array(6).fill('alta')), { personId: 'p1', date: '2027-01-20', resortId: 'snowbird' }),
    ).toBe(false);
  });

  it('takes the crew minimum and summarizes per person', () => {
    const rows = [...days('p1', ['alta', 'alta']), ...days('p2', ['snowbird'], 'planned')];
    expect(crewRemaining(rows, ['p1', 'p2'], 'alta-snowbird')).toBe(5);
    expect(crewRemaining(rows, ['p1', 'p2'], 'alta-snowbird', '2027-01-02')).toBe(6);
    const s = summary(rows, ['p1', 'p2', 'p3']);
    expect(s.p2?.['alta-snowbird']).toEqual({ cap: 7, skied: 0, planned: 1, remaining: 6 });
    expect(s.p3?.solitude).toEqual({ cap: null, skied: 0, planned: 0, remaining: null });
  });
});
