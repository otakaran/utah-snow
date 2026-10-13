// Time-zone core of src/shared/time.ts: instants, Denver wall time and the Pacific day key. Import through time.ts.
import { HOUR, MIN, pad, ymd } from './base.ts';

export const TZ = 'America/Denver';
export type When = number | string | Date;

const MEMO_MAX = 4096;
const ZONELESS_RE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+)?$/;
const LOCAL_RE = /(\d{4})\D?(\d{2})\D?(\d{2})(?:\D{0,3}(\d{1,2})\D?(\d{2})(?:\D?(\d{2}))?)?/;

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

/** Offset-from-UTC (minutes) for one zone, memoized per UTC hour: one Intl call per hour. The formatter is lazy. */
function zoneOffset(timeZone: string): (utcMs: number) => number {
  let fmt: Intl.DateTimeFormat | null = null;
  const memo = new Map<number, number>(); // UTC hour index -> offset minutes
  return (utcMs) => {
    const key = Math.floor(utcMs / HOUR);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    fmt ??= new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });
    const parts = fmt.formatToParts(key * HOUR);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const off = (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour')) - key * HOUR) / MIN;
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(key, off);
    return off;
  };
}

/** Denver offset from UTC in minutes (-420 MST, -360 MDT). Memoized per UTC hour. */
export const denverOffsetMin: (utcMs: number) => number = zoneOffset(TZ);
const pacificOffsetMin = zoneOffset('America/Los_Angeles');

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
  return { date: ymd(d), hm: `${pad(hour)}:${pad(minute)}`, hour, minute, weekday: d.getUTCDay() };
}

export const localDate = (when: When): string => localParts(when)?.date ?? '';
export const localHM = (when: When): string => localParts(when)?.hm ?? '';
export const localHour = (when: When): number => localParts(when)?.hour ?? Number.NaN;

/** America/Los_Angeles calendar date ('YYYY-MM-DD') of an instant: the YouTube Data API quota day. '' when invalid. */
export function ptDate(ms: number): string {
  return Number.isFinite(ms) ? ymd(new Date(ms + pacificOffsetMin(ms) * MIN)) : '';
}

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
    out.push({ date: ymd(d), hour: d.getUTCHours() });
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
