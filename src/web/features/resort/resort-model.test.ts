import { describe, expect, it } from 'vitest';
import type { ResortSnapshot } from '../../../shared/types.ts';
import { daysLeft, driveInfo, groupByArea, hm12, hoursLines, resortData, span12 } from './resort-model.ts';

const lift = (id: string, area: string | null) => ({ id, name: id, state: 'open' as const, raw: 'Open', area });

describe('resort page helpers', () => {
  it('groups lifts by area, flattening feeds whose areas are the lift names', () => {
    expect(groupByArea([lift('a', 'Peruvian'), lift('b', 'Peruvian'), lift('c', null)]).map((g) => g.area)).toEqual([
      'Peruvian',
      'Lifts',
    ]);
    const flat = groupByArea([lift('x', 'x'), lift('y', 'y')]);
    expect(flat).toHaveLength(1);
    expect(flat[0]?.lifts.map((l) => l.id)).toEqual(['x', 'y']);
  });

  it('formats HH:MM and C.8 hours', () => {
    expect(hm12('09:15')).toBe('9:15 AM');
    expect(hm12('16:30')).toBe('4:30 PM');
    expect(hm12('12:00')).toBe('12:00 PM');
    expect(span12(null, '15:45')).toBe('?–3:45 PM');
    expect(span12(null, null)).toBe('');
    const brighton = hoursLines('brighton');
    expect(brighton.at(-1)).toMatchObject({ hours: '4:00 PM–9:00 PM', note: 'not Tues, Dec 24, Dec 25, Dec 31' });
    expect(hoursLines('alta')[0]).toEqual({ label: 'Collins, Sunnyside', hours: '9:15 AM–4:30 PM' });
  });

  it('builds the drive line and the days left', () => {
    const min = { alta: 26, snowbird: 23, brighton: 32, solitude: 28, 'deer-valley': 44, snowbasin: 72 };
    const matrix = { min, exact: { alta: { mi: 13.3 }, brighton: { mi: 31, via: 'BCC mouth', warning: 'w' } } };
    expect(driveInfo({ label: 'Cottonwood Heights' }, 'alta', matrix, 4)).toEqual({
      min: 26,
      mi: 13.3,
      via: null,
      warning: null,
      from: 'Cottonwood Heights',
      approx: false,
      delayMin: 4,
    });
    expect(driveInfo({ label: 'Cabin' }, 'brighton', matrix, 0)).toMatchObject({ via: 'BCC mouth', warning: 'w' });
    expect(driveInfo({ label: 'Cabin' }, 'snowbird', matrix, undefined)).toMatchObject({
      min: 23,
      mi: null,
      approx: true,
      delayMin: null,
    });
    const days = [{ personId: 'p1', date: '2027-01-02', resortId: 'snowbird' as const, status: 'skied' as const }];
    expect(daysLeft('alta', days, ['p1', 'p2'], 'p1')).toEqual({ group: 'Alta/Snowbird', cap: 7, me: 6, crew: 6 });
    expect(daysLeft('solitude', days, ['p1'], 'p1')).toMatchObject({ cap: null, me: null });
    expect(daysLeft('alta', [], [], null)).toMatchObject({ me: null, crew: null });
  });

  it('rejects partial resort rows', () => {
    expect(resortData({} as ResortSnapshot)).toBeNull();
    expect(resortData(null)).toBeNull();
  });
});
