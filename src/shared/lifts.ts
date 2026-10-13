// Lift-list text shared by the resort parsers (spec §5.5): stable lift ids and posted hours, plus the C.8 rule for
// when a closed lift is news. Pure.
import { type LiftHours, RESORTS } from '../../config/resorts.ts';
import { hm24, isBetweenLocal, type When } from './time.ts';
import type { ResortId, ResortSnapshot } from './types.ts';

// '9 am - 3:45 pm' (Snowbird), '9:00 AM – 4:00 PM' (Snowbasin), '9:00 a.m. to 4 p.m.'.
const HOURS_RE = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i;

/** Display name -> id slug: 'Aerial Tram' -> 'aerial-tram' (used when the feed has no lift id). */
export const liftId = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Posted hours -> 'HH:MM' opening and closing times; both null when the text holds no range ('TBD', 'Closed'). */
export function liftHours(hours: string | null | undefined): { opensAt: string | null; closesAt: string | null } {
  const m = hours ? HOURS_RE.exec(hours) : null;
  if (!m) return { opensAt: null, closesAt: null };
  return {
    opensAt: hm24(`${m[1]}:${m[2] ?? '00'} ${m[3]}m`),
    closesAt: hm24(`${m[4]}:${m[5] ?? '00'} ${m[6]}m`),
  };
}

/** The day's C.8 lift hours as one span: earliest opening to latest closing of the day and early-season windows. */
export function dayWindow(h: LiftHours): { open: string; close: string } {
  const windows = h.early ? [...h.day, h.early] : h.day;
  let open = '23:59';
  let close = '00:00';
  for (const w of windows) {
    if (w.open < open) open = w.open;
    if (w.close > close) close = w.close;
  }
  return { open, close };
}

/**
 * Lifts are running: the resort is in season (open or closed for the day) and Denver time is inside its C.8 day
 * span. Only then is a closed lift or gate news (red ◆ Closed); pre-season, unknown and outside those hours it is
 * the expected grey ◌ Closed. Night riding (Brighton) does not count: a closed day lift at 7 pm is no news.
 */
export function liftsRunning(id: ResortId, season: ResortSnapshot['season'] | undefined, now: When): boolean {
  if (season !== 'open' && season !== 'closed-for-day') return false;
  const { open, close } = dayWindow(RESORTS[id].liftHours);
  return isBetweenLocal(now, open, close);
}
