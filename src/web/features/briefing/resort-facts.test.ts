import { describe, expect, it } from 'vitest';
import type { CapDay } from '../../../shared/caps.ts';
import type { ResortSnapshot } from '../../../shared/types.ts';
import { daysLeftText, driveText, liftsText, preseasonLine, resortStatus, windText } from './resort-facts.ts';

describe('resortStatus', () => {
  it('maps season and holds to a tone and word, tolerating empty rows', () => {
    expect(resortStatus({})).toEqual({ tone: 'off', word: 'No report' });
    expect(resortStatus({ season: 'preseason' })).toEqual({ tone: 'off', word: 'Pre-season' });
    const lifts = { open: 5, hold: 2, scheduled: 0, total: 9, list: [] };
    const open = { season: 'open', operatingToday: true, lifts } as Partial<ResortSnapshot>;
    expect(resortStatus(open)).toEqual({ tone: 'warn', word: 'Holds' });
    expect(resortStatus({ ...open, lifts: { ...lifts, hold: 0 } })).toEqual({ tone: 'ok', word: 'Open' });
  });
});

describe('card facts', () => {
  it('formats lifts, wind, drive and the pre-season line', () => {
    expect(liftsText({ open: 8, hold: 2, total: 11 })).toBe('8/11 (+2 hold)');
    expect(liftsText(undefined)).toBe('—');
    expect(windText({ summitWindMph: 22, summitGustMph: 41, windDir: 'WNW' }, 'imperial')).toBe('WNW 22 mph, gust 41');
    expect(windText({ summitWindMph: 22, summitGustMph: null, windDir: null }, 'metric')).toBe('35 km/h');
    expect(windText({}, 'imperial')).toBe('—');
    expect(driveText(26, 8, false)).toBe('26 min (+8 live)');
    expect(driveText(26, 0, true)).toBe('≈ 26 min');
    expect(preseasonLine('alta')).toBe('Pre-season – projected open Nov 20');
    expect(preseasonLine('brighton')).toBe('Pre-season – projected open TBA');
  });
});

describe('daysLeftText', () => {
  const days: CapDay[] = [
    { personId: 'ana', date: '2026-12-27', resortId: 'brighton', status: 'skied' },
    { personId: 'eva', date: '2026-12-27', resortId: 'brighton', status: 'skied' },
    { personId: 'eva', date: '2026-12-28', resortId: 'brighton', status: 'planned' },
  ];

  it('shows me and the crew minimum, unlimited for Solitude, full caps without a crew', () => {
    expect(daysLeftText('brighton', days, ['ana', 'eva'], 'ana')).toBe('me 6 · crew min 5');
    expect(daysLeftText('brighton', days, ['ana', 'eva'], null)).toBe('crew min 5');
    expect(daysLeftText('solitude', days, ['ana'], 'ana')).toBe('Unlimited');
    expect(daysLeftText('alta', [], [], null)).toBe('7 each (no crew yet)');
  });
});
