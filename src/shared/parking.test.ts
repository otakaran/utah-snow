import { describe, expect, it } from 'vitest';
import { TRIP } from '../../config/ikon.ts';
import { inSpans, parkingCal, priceText, weekday } from './parking.ts';
import { addDays } from './time.ts';

// Appendix C.7, one expectation per table row, checked on every trip date.
interface Row {
  alta: boolean;
  brighton: boolean;
  solitude: boolean;
  busy: boolean; // Snowbird tier Fri–Sun+Hol, Snowbasin Earl's A–E
  night: boolean;
}
const WEEKEND = { alta: true, brighton: true, solitude: true, busy: true, night: true };

function expected(date: string): Row {
  const dow = weekday(date);
  if (date >= '2026-12-27' && date <= '2027-01-03') {
    return { ...WEEKEND, night: date !== '2026-12-29' && date !== '2026-12-31' };
  }
  if (dow === 5 || dow === 6 || dow === 0 || date === '2027-01-18') return WEEKEND;
  if (date === '2027-01-19') return { alta: false, brighton: true, solitude: false, busy: false, night: false };
  return { alta: false, brighton: false, solitude: false, busy: false, night: dow !== 2 };
}

function tripDates(): string[] {
  const out: string[] = [];
  for (let d: string = TRIP.start; d <= TRIP.end; d = addDays(d, 1)) out.push(d);
  return out;
}

describe('parkingCal (Appendix C.7)', () => {
  it('matches every row of the C.7 table on every trip date', () => {
    const dates = tripDates();
    expect(dates).toHaveLength(TRIP.days);
    for (const date of dates) {
      const want = expected(date);
      const got: Row = {
        alta: parkingCal('alta', date).required,
        brighton: parkingCal('brighton', date).required,
        solitude: parkingCal('solitude', date).required,
        busy: parkingCal('snowbird', date).busy,
        night: parkingCal('brighton', date).nightRiding === true,
      };
      expect({ date, ...got }).toEqual({ date, ...want });
      expect(parkingCal('snowbasin', date).busy).toBe(want.busy);
      expect(parkingCal('deer-valley', date)).toMatchObject({ required: false, liftReservation: true });
      expect(parkingCal('snowbird', date).required).toBe(false);
    }
  });

  it('marks weekday busy days of the resorts without published holidays as assumed (†)', () => {
    expect(parkingCal('snowbird', '2027-01-18')).toMatchObject({ busy: true, assumedHoliday: true });
    expect(parkingCal('snowbasin', '2026-12-29').summary).toContain('†');
    expect(parkingCal('snowbird', '2027-01-09')).toMatchObject({ busy: true, assumedHoliday: false });
    expect(parkingCal('alta', '2027-01-18').assumedHoliday).toBe(false);
  });

  it('carries window, price, booking link and cancel time', () => {
    expect(parkingCal('alta', '2027-01-09')).toMatchObject({
      window: '08:00–13:00',
      priceUsd: 25,
      book: 'https://reserve.altaparking.com/',
      cancelBy: '08:00',
      summary: 'Reservation required 08:00–13:00 · $25',
    });
    expect(parkingCal('alta', '2027-01-09').notes).toContain('Early lot 06:00–08:00: $25');
    expect(parkingCal('alta', '2027-01-12').notes).toContain('Early lot 06:00–08:00: $15');
    expect(parkingCal('alta', '2027-01-12')).toMatchObject({ window: null, priceUsd: null });
    expect(parkingCal('solitude', '2027-01-08').summary).toBe(
      'Reservation required before 11:00 · $35 (1–3 in car) / free (4+)',
    );
    expect(parkingCal('snowbird', '2027-01-12').book).toBe('https://www.parkwhiz.com/');
    expect(parkingCal('deer-valley', '2027-01-12')).toMatchObject({
      book: 'https://account.ikonpass.com/en/login',
      cancelBy: '11:00',
    });
  });

  it('honours seasons and exceptions outside the trip', () => {
    expect(parkingCal('alta', '2026-12-05').required).toBe(false); // a Saturday before the Alta season
    expect(parkingCal('brighton', '2026-12-25').required).toBe(false); // except
    expect(parkingCal('solitude', '2026-12-18').required).toBe(true); // explicit date
  });

  it('helpers: weekday, spans, prices', () => {
    expect(weekday('2026-12-27')).toBe(0);
    expect(weekday('2027-01-01')).toBe(5);
    expect(inSpans('2027-01-17', ['2027-01-16..2027-01-19'])).toBe(true);
    expect(inSpans('2027-01-20', ['2027-01-16..2027-01-19', '2027-02-15'])).toBe(false);
    expect(priceText(0)).toBe('free');
    expect(priceText(null)).toBe('free');
    expect(priceText({ '1-3': 25, '4+': 10 })).toBe('$25 (1–3 in car) / $10 (4+)');
  });
});
