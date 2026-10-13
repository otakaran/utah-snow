import { describe, expect, it } from 'vitest';
import { prevOpenedAt, reportIsToday, seasonState } from './season.ts';

const at = (iso: string) => Date.parse(iso);
const OCT = at('2026-10-20T16:00:00Z'); // before the 2026-11-01 floor
const DEC = at('2026-12-28T15:30:00Z'); // 08:30 MST
const OPENED = '2026-11-20T08:00:00-07:00';

describe('seasonState', () => {
  it('never latches before the floor; latches on the first open or held lift after it', () => {
    expect(seasonState(['open'], null, OCT)).toEqual({
      season: 'preseason',
      seasonOpenedAt: null,
      operatingToday: false,
    });
    expect(seasonState(['closed', 'scheduled'], null, DEC).season).toBe('preseason');
    expect(seasonState(['closed', 'hold'], null, DEC)).toEqual({
      season: 'open',
      seasonOpenedAt: '2026-12-28T08:30:00-07:00',
      operatingToday: true,
    });
  });

  it('copies seasonOpenedAt forward: open while anything runs or is scheduled, else closed-for-day', () => {
    expect(seasonState(['closed', 'scheduled'], OPENED, DEC)).toMatchObject({ season: 'open', seasonOpenedAt: OPENED });
    expect(seasonState(['closed', 'unknown'], OPENED, DEC)).toEqual({
      season: 'closed-for-day',
      seasonOpenedAt: OPENED,
      operatingToday: true,
    });
  });

  it('honors the resort winter flag and extra running evidence', () => {
    expect(seasonState(['open'], OPENED, DEC, { winter: false })).toMatchObject({ season: 'preseason' });
    expect(seasonState(['open'], null, DEC, { winter: false }).seasonOpenedAt).toBeNull();
    expect(seasonState([], null, DEC, { running: true })).toMatchObject({ season: 'open', operatingToday: true });
  });
});

describe('prevOpenedAt', () => {
  it('keeps only zoned timestamps from the last-good row', () => {
    expect(prevOpenedAt({ seasonOpenedAt: ` ${OPENED} ` })).toBe(OPENED);
    expect(prevOpenedAt({ seasonOpenedAt: '2025-11-21T16:00:00.000Z' })).toBe('2025-11-21T16:00:00.000Z');
    for (const row of [{ seasonOpenedAt: 'yesterday' }, { seasonOpenedAt: '2026-11-20' }, {}, null, '[]']) {
      expect(prevOpenedAt(row)).toBeNull();
    }
  });
});

describe('reportIsToday', () => {
  const now = at('2026-12-28T20:00:00Z'); // 13:00 MST
  it('needs today in Denver and a stamp at 03:00 or later', () => {
    expect(reportIsToday('2026-12-28T10:00:00Z', now)).toBe(true); // 03:00
    expect(reportIsToday('2026-12-28T09:59:00Z', now)).toBe(false); // 02:59
    expect(reportIsToday(at('2026-12-28T06:30:00Z'), now)).toBe(false); // 23:30 the day before
    expect(reportIsToday(null, now)).toBe(false);
    expect(reportIsToday('2026-12-28 05:00', now)).toBe(false); // zone-less
  });

  it('also checks a raw local date when the feed sends one', () => {
    expect(reportIsToday('2026-12-28T14:00:00Z', now, '2026-12-28 06:45:00')).toBe(true);
    expect(reportIsToday('2026-12-28T14:00:00Z', now, '2026-12-27 06:45:00')).toBe(false);
    expect(reportIsToday('2026-12-28T14:00:00Z', now, 'n/a')).toBe(true);
  });
});
