// Display helpers and clock/month parsing of src/shared/time.ts (all Denver). Import through time.ts.
import { DATE_RE, dateMs, pad } from './base.ts';
import { daysBetween } from './days.ts';
import { localDate, localParts, type When } from './zone.ts';

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = [
  ...['January', 'February', 'March', 'April', 'May', 'June'],
  ...['July', 'August', 'September', 'October', 'November', 'December'],
];

/** '3:05 PM' / '11:40 am' -> '15:05' / '11:40'; null when no 12 h clock is found. */
export function hm24(clock: string): string | null {
  const m = /(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]?/.exec(clock);
  const raw = Number(m?.[1]);
  if (!m || raw < 1 || raw > 12 || Number(m[2]) > 59) return null;
  return `${pad((raw % 12) + (m[3]?.toLowerCase() === 'p' ? 12 : 0))}:${m[2]}`;
}

/** Month number 1-12 for 'Jan' / 'JAN' / 'january' (3-letter or full English name, any case); 0 otherwise. */
export function monthNum(name: string): number {
  const n = name.trim().toLowerCase();
  const i = n.length === 3 ? MON_SHORT.findIndex((m) => m.toLowerCase() === n) : -1;
  return (i >= 0 ? i : MON_LONG.findIndex((m) => m.toLowerCase() === n)) + 1;
}

/** '6:05 AM' in Denver time. */
export function formatClock(when: When): string {
  const p = localParts(when);
  if (!p) return '';
  return `${p.hour % 12 || 12}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

export type DateStyle = 'short' | 'long' | 'md' | 'weekday';

/**
 * A local date ('YYYY-MM-DD') or an instant, as 'Sat, Dec 27' (short), 'Saturday, December 27' (long),
 * 'Dec 27' (md) or 'Sat' (weekday).
 */
export function formatLocalDate(dateOrWhen: string | When, style: DateStyle = 'short'): string {
  const date = typeof dateOrWhen === 'string' && DATE_RE.test(dateOrWhen) ? dateOrWhen : localDate(dateOrWhen);
  if (!date) return '';
  const wd = new Date(dateMs(date)).getUTCDay();
  const mo = +date.slice(5, 7) - 1;
  const day = +date.slice(8, 10);
  if (style === 'weekday') return WD_SHORT[wd] ?? '';
  if (style === 'md') return `${MON_SHORT[mo]} ${day}`;
  if (style === 'long') return `${WD_LONG[wd]}, ${MON_LONG[mo]} ${day}`;
  return `${WD_SHORT[wd]}, ${MON_SHORT[mo]} ${day}`;
}

/** Clock time relative to now: '6:05 AM', '3:05 PM yesterday', '6:00 AM tomorrow', else 'Dec 27 3:05 PM'. */
export function formatClockRel(when: When, now: When): string {
  const date = localDate(when);
  const today = localDate(now);
  if (!date || !today) return '';
  const clock = formatClock(when);
  const diff = daysBetween(today, date);
  if (diff === 0) return clock;
  if (diff === -1) return `${clock} yesterday`;
  if (diff === 1) return `${clock} tomorrow`;
  return `${formatLocalDate(date, 'md')} ${clock}`;
}
