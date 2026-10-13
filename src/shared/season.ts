// Resort season state and report freshness (spec §5.5 "Season state", reportIsToday), shared by every resort adapter
// and the MtnPowder parser. Pure; all clock math goes through time.ts.
import { SEASON_FLOOR } from '../../config/resorts.ts';
import { isoLocal, isoToMs, localDate, localParts, type When } from './time.ts';
import type { LiftState, ResortSnapshot } from './types.ts';

const REPORT_HOUR = 3; // a report stamped before 03:00 local still describes the night before
const DAY_RE = /^\d{4}-\d{2}-\d{2}/;

export type SeasonState = Pick<ResortSnapshot, 'season' | 'seasonOpenedAt' | 'operatingToday'>;

export interface SeasonOpts {
  /**
   * The resort's own season flag (Alta `seasonal.is_winter`, Snowbasin `-winter-season`); default true. While false
   * the row is preseason, and a running lift does not set seasonOpenedAt (summer or employee-day operations).
   */
  winter?: boolean;
  /** Running-lift evidence beyond `states`, e.g. MtnPowder `TotalOpenLifts > 0`. */
  running?: boolean;
}

/** `seasonOpenedAt` of a last-good row when it is a zoned timestamp; null otherwise, so the season can latch again. */
export function prevOpenedAt(prevRow: unknown): string | null {
  const v = prevRow && typeof prevRow === 'object' ? (prevRow as { seasonOpenedAt?: unknown }).seasonOpenedAt : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return isoToMs(s) === null ? null : s;
}

/**
 * seasonOpenedAt is copied forward, and set to now (Denver ISO with offset) the first time, on or after
 * SEASON_FLOOR, that a lift is open or on hold. The season is preseason while it is null or the resort says summer;
 * then open while any lift is open, on hold or scheduled, else closed-for-day.
 */
export function seasonState(
  states: readonly LiftState[],
  openedBefore: string | null,
  now: number,
  opts: SeasonOpts = {},
): SeasonState {
  const winter = opts.winter ?? true;
  const running = opts.running === true || states.some((s) => s === 'open' || s === 'hold');
  const openedAt = openedBefore ?? (winter && running && localDate(now) >= SEASON_FLOOR ? isoLocal(now) : null);
  let season: SeasonState['season'] = 'preseason';
  if (openedAt && winter) season = running || states.includes('scheduled') ? 'open' : 'closed-for-day';
  return { season, seasonOpenedAt: openedAt, operatingToday: season !== 'preseason' };
}

/**
 * The report's Denver date is today and it was stamped at 03:00 or later. When the feed also sends a raw local
 * date (`localDay`, 'YYYY-MM-DD…', Snowbird), that must fall on today too, so a same-day edit of yesterday's report
 * does not count.
 */
export function reportIsToday(reportAt: When | null | undefined, now: number, localDay?: string | null): boolean {
  if (reportAt === null || reportAt === undefined) return false;
  const p = localParts(reportAt);
  const today = localDate(now);
  if (!p || p.date !== today || p.hour < REPORT_HOUR) return false;
  return localDay && DAY_RE.test(localDay) ? localDay.slice(0, 10) === today : true;
}
