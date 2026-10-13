import { describe, expect, it } from 'vitest';
import type { NwsDay, ResortSnapshot } from '../../../shared/types.ts';
import { daysLeft, driveInfo, groupByArea, hm12, hoursLines, levelStatus, resortData, span12 } from './resort-model.ts';

const lift = (id: string, area: string | null) => ({ id, name: id, state: 'open' as const, raw: 'Open', area });
const day = (o: Partial<NwsDay>): NwsDay => ({
  date: '2027-01-09',
  snowIn: 0,
  snowDayIn: 0,
  snowNightIn: 0,
  qpfIn: 0.3,
  snowLevelMinFt: null,
  snowLevelMaxFt: null,
  gustMaxMph: null,
  windMaxMph: null,
  tMinF: null,
  tMaxF: null,
  popMax: null,
  ...o,
});

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

  it('judges the snow level against the true elevation', () => {
    expect(levelStatus(day({ snowLevelMinFt: 5000, snowLevelMaxFt: 6000 }), 8530)?.word).toBe('Snow');
    expect(levelStatus(day({ snowLevelMinFt: 8000, snowLevelMaxFt: 9000 }), 8530)?.word).toBe('Mix');
    expect(levelStatus(day({ snowLevelMinFt: 9000, snowLevelMaxFt: 9500 }), 8530)?.word).toBe('Rain');
    expect(levelStatus(day({ qpfIn: 0, snowLevelMaxFt: 9500 }), 8530)).toBeNull();
  });

  it('builds the drive line and the days left', () => {
    const min = { alta: 26, snowbird: 23, brighton: 32, solitude: 28, 'deer-valley': 44, snowbasin: 72 };
    const matrix = { min, approx: false };
    expect(driveInfo({ id: 'cottonwood-heights', label: 'Cottonwood Heights' }, 'alta', matrix, 4)).toEqual({
      min: 26,
      mi: 13.3,
      via: null,
      from: 'Cottonwood Heights',
      approx: false,
      delayMin: 4,
    });
    expect(driveInfo({ id: 'custom', label: 'Cabin' }, 'alta', { ...matrix, approx: true }, undefined)).toMatchObject({
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
