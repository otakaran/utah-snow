// Season state for a resort row (spec §5.5 "Season state"). Pure; the same rule applies to every resort adapter.
import { denverOffsetMin, localDate, localParts } from '../../../shared/time.ts';
import type { LiftState, ResortSnapshot } from '../../../shared/types.ts';

// Lifts running on or after this local date open the season (all summer lift operations have ended by then).
export const SEASON_FROM = '2026-11-01';

export interface SeasonState {
  season: ResortSnapshot['season'];
  seasonOpenedAt: string | null;
  operatingToday: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** An instant as Denver wall time with its offset, e.g. '2026-11-20T06:05:00-07:00' (no Date getters here). */
export function isoAt(ms: number): string {
  const p = localParts(ms);
  if (!p) return '';
  const off = denverOffsetMin(ms);
  const abs = Math.abs(off);
  return `${p.date}T${p.hm}:00${off < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** `seasonOpenedAt` of the last-good row, if it is a non-empty string. */
export function prevOpenedAt(prevRow: unknown): string | null {
  if (!prevRow || typeof prevRow !== 'object') return null;
  const v = (prevRow as { seasonOpenedAt?: unknown }).seasonOpenedAt;
  return typeof v === 'string' && v ? v : null;
}

/**
 * `seasonOpenedAt` is copied forward and set to now the first time, on or after SEASON_FROM, that any lift is
 * open or on hold. preseason while it is null; open while any lift is open, on hold or scheduled; else closed-for-day.
 */
export function seasonState(states: LiftState[], openedBefore: string | null, now: number): SeasonState {
  const running = states.some((s) => s === 'open' || s === 'hold');
  const openedAt = openedBefore ?? (running && localDate(now) >= SEASON_FROM ? isoAt(now) : null);
  let season: SeasonState['season'] = 'preseason';
  if (openedAt) season = running || states.includes('scheduled') ? 'open' : 'closed-for-day';
  return { season, seasonOpenedAt: openedAt, operatingToday: season !== 'preseason' };
}
