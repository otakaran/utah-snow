// Snowbasin report time and the 48/72 h sums (spec §5.5). All clock math goes through shared/time.ts; season state
// and reportIsToday are the shared src/shared/season.ts rules.
import { addDays, DAY, hm24, localDate, zonedToUtc } from '../../../shared/time.ts';
import type { ResortSnapshot } from '../../../shared/types.ts';
import type { Stamp } from './scan.ts';

// ctx.prev key for this resort's resort_history rows ({ hour, payload }[]), supplied by the dispatcher (§5.5).
export const HISTORY_KEY = 'resort_history:snowbasin';
const pad = (n: number) => String(n).padStart(2, '0');

/** 'Feb 09, 4:19 AM' carries no year: the current Denver year, minus 1 when that lands > 1 day in the future. */
export function stampMs(stamp: Stamp | null, now: number): number | null {
  const hm = stamp ? hm24(stamp.clock) : null;
  if (!stamp || !hm) return null;
  const at = (y: number) => zonedToUtc(`${y}-${pad(stamp.month)}-${pad(stamp.day)} ${hm}`);
  const year = Number(localDate(now).slice(0, 4));
  const ms = at(year);
  if (ms === null || !Number.isFinite(year)) return null;
  return ms > now + DAY ? at(year - 1) : ms;
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
