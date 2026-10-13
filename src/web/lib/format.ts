// Display helpers: thin wrappers over src/shared/time.ts and units.ts. No Date or Intl here (check-repo rule 4).
// Every helper returns '—' for missing or invalid input so views never print 'NaN' or ''.
import { TRIP } from '../../../config/ikon.ts';
import type { When } from '../../shared/time.ts';
import {
  daysBetween,
  formatClock,
  formatClockRel,
  formatLocalDate,
  localDate,
  tripDayNumber,
} from '../../shared/time.ts';
import { fmt, type Kind, type Units } from '../../shared/units.ts';

const DASH = '—';
const orDash = (s: string): string => s || DASH;

/** '6:05 AM' (Denver). */
export const clock = (when: When): string => orDash(formatClock(when));

/** 'Sat, Dec 27' (Denver). */
export const shortDate = (when: When): string => orDash(formatLocalDate(when, 'short'));

/** 'Saturday, December 27' (Denver). */
export const longDate = (when: When): string => orDash(formatLocalDate(when, 'long'));

/** '6:05 AM', '3:05 PM yesterday' or 'Dec 27 3:05 PM', relative to now; '—' when missing. */
export function clockRel(when: string | null | undefined, nowMs: number): string {
  return when ? orDash(formatClockRel(when, nowMs)) : DASH;
}

/** Age in minutes as 'just now', '7 min ago', '3 h ago', '2 d ago'; 'never' when null. */
export function ageText(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return 'never';
  const m = Math.max(0, Math.round(min));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

/** An imperial value in the chosen units: qty('snow', 3.46, 'imperial') === '3.5″'. */
export const qty = (kind: Kind, imperial: number | null | undefined, units: Units): string =>
  fmt(kind, imperial, units).text;

/** 'Trip day 3 of 36', '76 days until the trip' or 'Trip over'. */
export function tripLine(nowMs: number): string {
  const today = localDate(nowMs);
  if (!today) return DASH;
  const day = tripDayNumber(today);
  if (day !== null) return `Trip day ${day} of ${TRIP.days}`;
  const until = daysBetween(today, TRIP.start);
  if (until > 0) return until === 1 ? 'Trip starts tomorrow' : `${until} days until the trip`;
  return 'Trip over';
}
