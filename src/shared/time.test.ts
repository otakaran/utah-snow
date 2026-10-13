import { describe, expect, it, vi } from 'vitest';
import {
  addDays,
  daysRemaining,
  denverOffsetMin,
  formatClock,
  formatClockRel,
  formatLocalDate,
  hm24,
  isBetweenLocal,
  isTripDay,
  localDate,
  localHM,
  localSlots,
  pickMode,
  pstToUtc,
  tripDayNumber,
  zonedToUtc,
} from './time.ts';

const at = (iso: string) => Date.parse(iso);

describe('Denver local date and time', () => {
  it('rolls the date at local midnight, not UTC midnight', () => {
    expect(localDate('2026-12-31T06:59:00Z')).toBe('2026-12-30');
    expect(localDate('2026-12-31T07:00:00Z')).toBe('2026-12-31');
    expect([localDate('2027-01-01T06:30:00Z'), localHM('2027-01-01T06:30:00Z')]).toEqual(['2026-12-31', '23:30']);
    expect([localDate('2027-01-01T07:30:00Z'), localHM('2027-01-01T07:30:00Z')]).toEqual(['2027-01-01', '00:30']);
  });

  it('follows both DST transitions', () => {
    expect(denverOffsetMin(at('2026-11-01T07:59:00Z'))).toBe(-360);
    expect(denverOffsetMin(at('2026-11-01T08:00:00Z'))).toBe(-420);
    expect(localHM('2026-11-01T08:00:00Z')).toBe('01:00');
    expect(denverOffsetMin(at('2027-03-14T08:59:00Z'))).toBe(-420);
    expect(denverOffsetMin(at('2027-03-14T09:00:00Z'))).toBe(-360);
    expect(localHM('2027-03-14T09:00:00Z')).toBe('03:00');
  });

  it('rejects zone-less strings instead of reading them in the machine zone', () => {
    expect(localDate('2026-12-27T08:00')).toBe('');
    expect(localDate('2026-12-27')).toBe('');
    expect(localDate('Mon, 28 Dec 2026 13:00:00 GMT')).toBe('2026-12-28');
  });

  it('memoizes the offset per UTC hour', () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts');
    const base = at('2027-01-09T15:00:00Z');
    for (let i = 0; i < 500; i++) localHM(base + i * 7000);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    localSlots(at('2027-01-20T00:00:00Z'), 200);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
    spy.mockRestore();
  });

  it('expands hourly slots across a local midnight', () => {
    const slots = localSlots(at('2027-01-02T05:00:00Z'), 3);
    expect(slots).toEqual([
      { date: '2027-01-01', hour: 22 },
      { date: '2027-01-01', hour: 23 },
      { date: '2027-01-02', hour: 0 },
    ]);
  });
});

describe('zonedToUtc', () => {
  it('converts Denver wall time in MST and MDT', () => {
    expect(zonedToUtc('2026-12-27 06:00')).toBe(at('2026-12-27T13:00:00Z'));
    expect(zonedToUtc('2026-10-12T08:00:00')).toBe(at('2026-10-12T14:00:00Z'));
    expect(zonedToUtc('20261227_0605')).toBe(at('2026-12-27T13:05:00Z'));
    expect(zonedToUtc('2026-12-27')).toBe(at('2026-12-27T07:00:00Z'));
    expect(zonedToUtc('not a date')).toBeNull();
  });

  it('resolves the fall-back fold and the spring-forward gap', () => {
    expect(zonedToUtc('2026-11-01 01:30')).toBe(at('2026-11-01T07:30:00Z'));
    expect(zonedToUtc('2026-11-01 03:00')).toBe(at('2026-11-01T10:00:00Z'));
    expect(zonedToUtc('2027-03-14 02:30')).toBe(at('2027-03-14T09:30:00Z'));
  });

  it('reads SNOTEL PST stamps and 12 h clocks', () => {
    expect(pstToUtc('2027-01-05 16:00')).toBe(at('2027-01-06T00:00:00Z'));
    expect(hm24('Last Updated: Dec 27, 3:05 PM MT')).toBe('15:05');
    expect(hm24('12:10 am')).toBe('00:10');
    expect(hm24('12:10 PM')).toBe('12:10');
    expect(hm24('13:10 PM')).toBeNull();
  });
});

describe('trip days', () => {
  it('bounds isTripDay to TRIP inclusive', () => {
    expect(isTripDay('2026-12-26')).toBe(false);
    expect(isTripDay('2026-12-27')).toBe(true);
    expect(isTripDay('2027-01-31')).toBe(true);
    expect(isTripDay('2027-02-01')).toBe(false);
  });

  it('counts days remaining and the day number', () => {
    expect(daysRemaining('2026-10-12')).toBe(36);
    expect(daysRemaining('2026-12-27')).toBe(36);
    expect(daysRemaining('2027-01-31')).toBe(1);
    expect(daysRemaining('2027-02-01')).toBe(0);
    expect(tripDayNumber('2027-01-01')).toBe(6);
    expect(tripDayNumber('2027-02-01')).toBeNull();
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('switches on tomorrow at tomorrowFrom only when tomorrow is a trip day', () => {
    expect(pickMode('2027-01-05T21:59:00Z', '15:00')).toEqual({ today: '2027-01-05', tomorrow: null });
    expect(pickMode('2027-01-05T22:00:00Z', '15:00')).toEqual({ today: '2027-01-05', tomorrow: '2027-01-06' });
    expect(pickMode('2026-12-26T22:00:00Z', '15:00').tomorrow).toBe('2026-12-27');
    expect(pickMode('2027-01-31T23:00:00Z', '15:00').tomorrow).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats clocks, dates and relative stamps', () => {
    expect(formatClock('2027-01-05T13:05:00Z')).toBe('6:05 AM');
    expect(formatClock('2027-01-05T07:30:00Z')).toBe('12:30 AM');
    expect(formatClock('2027-01-05T19:00:00Z')).toBe('12:00 PM');
    expect(formatLocalDate('2026-12-27')).toBe('Sun, Dec 27');
    expect(formatLocalDate('2026-12-27', 'long')).toBe('Sunday, December 27');
    expect(formatLocalDate('2027-01-01T06:30:00Z', 'md')).toBe('Dec 31');
    expect(formatClockRel('2027-01-04T22:05:00Z', '2027-01-05T13:00:00Z')).toBe('3:05 PM yesterday');
    expect(formatClockRel('2027-01-05T13:05:00Z', '2027-01-05T14:00:00Z')).toBe('6:05 AM');
  });

  it('checks local windows, including ones that wrap midnight', () => {
    expect(isBetweenLocal('2027-01-05T13:30:00Z', '06:30', '18:30')).toBe(true);
    expect(isBetweenLocal('2027-01-06T01:30:00Z', '06:30', '18:30')).toBe(false);
    expect(isBetweenLocal('2027-01-06T05:00:00Z', '18:30', '06:30')).toBe(true);
  });
});
