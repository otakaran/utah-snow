import { describe, expect, it } from 'vitest';
import type { CapDay } from '../../../shared/caps.ts';
import { altReason, crewNames, memberCosts, peakFractions } from './labels.ts';

describe('altReason', () => {
  it('prefers a scored effect, then the day cost, then the first reason', () => {
    const snow = '12″ overnight (resort report 5:45 AM)';
    const cost = 'Spends 1 Alta/Snowbird day each (crew min 4 → 3): 12″ ≥ save-threshold 4.2″';
    const road = 'SR-210 closed for avalanche control, ETO 9:30 AM (−2)';
    expect(altReason([snow, cost, road])).toBe(road);
    expect(altReason([snow, cost])).toBe(cost);
    expect(altReason([snow])).toBe(snow);
    expect(altReason([])).toBe('');
  });
});

describe('memberCosts', () => {
  const ana = { id: 'ana', name: 'Ana', mode: 'ski' as const };
  const eva = { id: 'eva', name: 'Eva', mode: 'board' as const };
  const days: CapDay[] = [
    { personId: 'ana', date: '2026-12-27', resortId: 'alta', status: 'skied' },
    { personId: 'ana', date: '2026-12-28', resortId: 'alta-snowbird', status: 'planned' },
    { personId: 'ana', date: '2026-12-30', resortId: 'snowbird', status: 'planned' }, // the target day itself
  ];

  it('counts every other planned or skied day of the group, then spends one', () => {
    expect(memberCosts([ana, eva], days, 'alta-snowbird', '2026-12-30', 1)).toEqual([
      { id: 'ana', name: 'Ana', before: 5, after: 4 },
      { id: 'eva', name: 'Eva', before: 7, after: 6 },
    ]);
  });

  it('is empty for the unlimited group', () => {
    expect(memberCosts([ana], days, 'solitude', '2026-12-30', 0)).toEqual([]);
  });
});

describe('peakFractions', () => {
  it('scales to the deepest night with a 6″ floor, keeps a sliver for 0 and flattens missing values', () => {
    expect(peakFractions([12, 6, 0, null])).toEqual([1, 0.5, 0.08, 0]);
    expect(peakFractions([3, 1.5])).toEqual([0.5, 0.25]);
  });
});

describe('crewNames', () => {
  it('marks boarders and unknown modes', () => {
    const names = crewNames([
      { id: 'a', name: 'Ana', mode: 'ski' },
      { id: 'k', name: 'Kuba', mode: 'board' },
      { id: 'p', name: 'Petr', mode: 'unknown' },
    ]);
    expect(names).toBe('Ana, Kuba (board), Petr (ski/board?)');
  });
});
