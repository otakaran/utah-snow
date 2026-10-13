// The ONLY module that touches time zones, Intl or Date getters (spec §5.7, §8.8; enforced by check-repo).
// Everything is America/Denver. Local dates are 'YYYY-MM-DD' strings, local times are 'HH:MM' (24 h).
// Strings passed as instants must carry a zone (ISO with Z/±hh:mm, or an HTTP date); zone-less strings
// are rejected because Date.parse would read them in the machine's zone. Invalid input yields '' / null.
import { TRIP } from '../../config/ikon.ts';

export const TZ = 'America/Denver';
export type When = number | string | Date;

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const MEMO_MAX = 4096;
const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
});
const offsets = new Map<number, number>(); // UTC hour index -> offset minutes
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ZONELESS_RE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+)?$/;
const LOCAL_RE = /(\d{4})\D?(\d{2})\D?(\d{2})(?:\D{0,3}(\d{1,2})\D?(\d{2})(?:\D?(\d{2}))?)?/;
const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = [
  ...['January', 'February', 'March', 'April', 'May', 'June'],
  ...['July', 'August', 'September', 'October', 'November', 'December'],
];
const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch ms for an instant, or NaN. */
export function toMs(when: When): number {
  if (typeof when === 'number') return when;
  if (when instanceof Date) return when.getTime();
  return ZONELESS_RE.test(when.trim()) ? Number.NaN : Date.parse(when);
}

/** Epoch ms for an ISO/HTTP timestamp, or null (missing, zone-less or unparseable). */
export function isoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = toMs(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Denver offset from UTC in minutes (-420 MST, -360 MDT). Memoized per UTC hour: one Intl call per hour. */
export function denverOffsetMin(utcMs: number): number {
  const key = Math.floor(utcMs / HOUR);
  const hit = offsets.get(key);
  if (hit !== undefined) return hit;
  const parts = FMT.formatToParts(key * HOUR);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const off = (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour')) - key * HOUR) / MIN;
  if (offsets.size >= MEMO_MAX) offsets.clear();
  offsets.set(key, off);
  return off;
}

export interface LocalParts {
  date: string; // YYYY-MM-DD
  hm: string; // HH:MM
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

/** Denver wall-clock fields for an instant, or null when invalid. */
export function localParts(when: When): LocalParts | null {
  const ms = toMs(when);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + denverOffsetMin(ms) * MIN);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return { date, hm: `${pad(hour)}:${pad(minute)}`, hour, minute, weekday: d.getUTCDay() };
}

export const localDate = (when: When): string => localParts(when)?.date ?? '';
export const localHM = (when: When): string => localParts(when)?.hm ?? '';
export const localHour = (when: When): number => localParts(when)?.hour ?? Number.NaN;

/**
 * Denver local hourly slots for `n` consecutive UTC hours from `startMs` (NWS bucketing, §5.7).
 * When both ends share an offset (the whole trip does) this costs at most two Intl calls.
 */
export function localSlots(startMs: number, n: number): { date: string; hour: number }[] {
  const endMs = startMs + Math.max(0, n - 1) * HOUR;
  const off = denverOffsetMin(startMs);
  const same = off === denverOffsetMin(endMs);
  const out: { date: string; hour: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ms = startMs + i * HOUR;
    const d = new Date(ms + (same ? off : denverOffsetMin(ms)) * MIN);
    out.push({
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      hour: d.getUTCHours(),
    });
  }
  return out;
}

type Fields = [y: number, mo: number, d: number, h: number, mi: number, s: number];

function parseLocal(local: string): Fields | null {
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const f = m.slice(1).map((x) => Number(x ?? 0)) as Fields;
  const [, mo, d, h, mi, s] = f;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return f;
}

/**
 * Denver wall time -> epoch ms. Accepts 'YYYY-MM-DD[ HH:MM[:SS]]' with any single separators
 * (e.g. '2026-12-27 06:00', '20261227_0600'). A nonexistent spring-forward time maps forward
 * (02:30 -> 03:30 MDT); an ambiguous fall-back time maps to its first (MDT) occurrence.
 */
export function zonedToUtc(local: string): number | null {
  const f = parseLocal(local);
  if (!f) return null;
  const guess = Date.UTC(f[0], f[1] - 1, f[2], f[3], f[4], f[5]);
  const off1 = denverOffsetMin(guess);
  const utc1 = guess - off1 * MIN;
  const off2 = denverOffsetMin(utc1);
  if (off2 === off1) return utc1;
  const utc2 = guess - off2 * MIN;
  return denverOffsetMin(utc2) === off2 ? utc2 : utc1;
}

/** SNOTEL stamps 'yyyy-MM-dd HH:mm' are PST all year (§5.7). */
export function pstToUtc(local: string): number | null {
  const f = parseLocal(local);
  return f ? Date.UTC(f[0], f[1] - 1, f[2], f[3], f[4], f[5]) + 8 * HOUR : null;
}

/** '3:05 PM' / '11:40 am' -> '15:05' / '11:40'; null when no 12 h clock is found. */
export function hm24(clock: string): string | null {
  const m = /(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]?/.exec(clock);
  const raw = Number(m?.[1]);
  if (!m || raw < 1 || raw > 12 || Number(m[2]) > 59) return null;
  return `${pad((raw % 12) + (m[3]?.toLowerCase() === 'p' ? 12 : 0))}:${m[2]}`;
}

const dateMs = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));

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
