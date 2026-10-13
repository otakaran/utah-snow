// Calendar and trip-day helpers of src/shared/time.ts (local dates are 'YYYY-MM-DD'). Import through time.ts.
import { TRIP } from '../../../config/ikon.ts';
import { DAY, dateMs } from './base.ts';
import { localHM, localParts, type When } from './zone.ts';

/** Calendar arithmetic on local dates. */
export function addDays(date: string, n: number): string {
  return new Date(dateMs(date) + n * DAY).toISOString().slice(0, 10);
}

/** Whole days from date a to date b (b - a). */
export const daysBetween = (a: string, b: string): number => Math.round((dateMs(b) - dateMs(a)) / DAY);

export const isTripDay = (date: string): boolean => date >= TRIP.start && date <= TRIP.end;

/** Trip days left including `today`: all of them before the trip, 0 after it. */
export function daysRemaining(today: string): number {
  if (today > TRIP.end) return 0;
  if (today < TRIP.start) return TRIP.days;
  return daysBetween(today, TRIP.end) + 1;
}

/** 1-based trip day number, or null outside the trip. */
export const tripDayNumber = (date: string): number | null =>
  isTripDay(date) ? daysBetween(TRIP.start, date) + 1 : null;

/** Local time within [from, to); wraps past midnight when from > to. */
export function isBetweenLocal(when: When, from: string, to: string): boolean {
  const hm = localHM(when);
  if (!hm) return false;
  return from <= to ? hm >= from && hm < to : hm >= from || hm < to;
}

/**
 * Briefing targets (§10): today always; tomorrow too once localHM >= tomorrowFrom and tomorrow is a trip day.
 */
export function pickMode(now: When, tomorrowFrom: string): { today: string; tomorrow: string | null } {
  const p = localParts(now);
  if (!p) return { today: '', tomorrow: null };
  const next = addDays(p.date, 1);
  return { today: p.date, tomorrow: p.hm >= tomorrowFrom && isTripDay(next) ? next : null };
}
