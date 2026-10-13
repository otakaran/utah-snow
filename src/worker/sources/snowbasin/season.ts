// Snowbasin report time, season state and the 48/72 h sums (spec §5.5). All clock math goes through shared/time.ts.
import { addDays, denverOffsetMin, hm24, localDate, localParts, zonedToUtc } from '../../../shared/time.ts';
import type { LiftStatus, ResortSnapshot } from '../../../shared/types.ts';
import type { Stamp } from './scan.ts';

// seasonOpenedAt is set only on or after this local date, after all summer lift operations have ended (§5.5).
export const SEASON_FLOOR = '2026-11-01';
// ctx.prev key for this resort's resort_history rows ({ hour, payload }[]), supplied by the dispatcher (§5.5).
export const HISTORY_KEY = 'resort_history:snowbasin';
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Denver wall time with its offset, e.g. '2026-02-09T04:19:00-07:00'; '' when invalid. */
export function isoLocal(ms: number): string {
  const p = localParts(ms);
  if (!p) return '';
  const off = denverOffsetMin(ms);
  const a = Math.abs(off);
  return `${p.date}T${p.hm}:00${off < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** 'Feb 09, 4:19 AM' carries no year: the current Denver year, minus 1 when that lands > 1 day in the future. */
export function stampMs(stamp: Stamp | null, now: number): number | null {
  const hm = stamp ? hm24(stamp.clock) : null;
  if (!stamp || !hm) return null;
  const at = (y: number) => zonedToUtc(`${y}-${pad(stamp.month)}-${pad(stamp.day)} ${hm}`);
  const year = Number(localDate(now).slice(0, 4));
  const ms = at(year);
  if (ms === null || !Number.isFinite(year)) return null;
  return ms > now + DAY_MS ? at(year - 1) : ms;
}

/** Report is today's when its local date is today and it was stamped at 03:00 or later. */
export function isToday(reportMs: number | null, now: number): boolean {
  if (reportMs === null) return false;
  const p = localParts(reportMs);
  return !!p && p.date === localDate(now) && p.hour >= 3;
}

export function seasonOf(
  pageSeason: 'winter' | 'summer',
  lifts: LiftStatus[],
  prev: Partial<ResortSnapshot> | undefined,
  now: number,
): Pick<ResortSnapshot, 'season' | 'seasonOpenedAt' | 'operatingToday'> {
  const turning = lifts.some((l) => l.state === 'open' || l.state === 'hold');
  let seasonOpenedAt = typeof prev?.seasonOpenedAt === 'string' ? prev.seasonOpenedAt : null;
  if (seasonOpenedAt === null && turning && localDate(now) >= SEASON_FLOOR) seasonOpenedAt = isoLocal(now);
  let season: ResortSnapshot['season'] = 'closed-for-day';
  if (seasonOpenedAt === null || pageSeason === 'summer') season = 'preseason';
  else if (turning || lifts.some((l) => l.state === 'scheduled')) season = 'open';
  return { season, seasonOpenedAt, operatingToday: season !== 'preseason' };
}

type HistRow = { hour?: unknown; payload?: unknown };

/** Daily '24 hours' by local report date from resort_history payloads (latest row of a date wins). */
function dailyNew24(history: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(history)) return out;
  const rows = (history as HistRow[]).filter((r) => r && typeof r === 'object');
  rows.sort((a, b) => String(a.hour ?? '').localeCompare(String(b.hour ?? '')));
  for (const r of rows) {
    const snow = (r.payload as Partial<ResortSnapshot> | null)?.snow;
    const at = typeof snow?.reportAt === 'string' ? snow.reportAt : null;
    const date = at ? localDate(at) : '';
    if (date && typeof snow?.new24hIn === 'number') out.set(date, snow.new24hIn);
  }
  return out;
}

/** 48 h = today's '24 hours' + the previous report day's; 72 h adds the day before. Null when a day is missing. */
export function multiDay(
  new24: number | null,
  reportMs: number | null,
  history: unknown,
): { new48hIn: number | null; new72hIn: number | null } {
  if (new24 === null || reportMs === null) return { new48hIn: null, new72hIn: null };
  const daily = dailyNew24(history);
  const date = localDate(reportMs);
  const d1 = daily.get(addDays(date, -1));
  const d2 = daily.get(addDays(date, -2));
  const new48hIn = d1 === undefined ? null : new24 + d1;
  return { new48hIn, new72hIn: new48hIn === null || d2 === undefined ? null : new48hIn + d2 };
}
