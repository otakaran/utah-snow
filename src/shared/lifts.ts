// Lift-list text shared by the resort parsers (spec §5.5): stable lift ids and posted hours. Pure.
import { hm24 } from './time.ts';

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
