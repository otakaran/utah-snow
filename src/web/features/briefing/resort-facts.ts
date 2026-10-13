// Pure display facts for a ResortCard (spec §8.2): status word, days left, lifts/trails, wind, drive and the
// pre-season line. Inputs are tolerant: a resort row may be `{}` or partial (seed data, a parser mid-season).
import { CAP_GROUPS } from '../../../../config/ikon.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import type { CapDay } from '../../../shared/caps.ts';
import { crewRemaining, group, remaining } from '../../../shared/caps.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { ResortId, ResortSnapshot } from '../../../shared/types.ts';
import { fmt, type Units } from '../../../shared/units.ts';
import type { Tone } from '../../ui/status.ts';

const DASH = '—';

/** Status plate word and tone for the card head. */
export function resortStatus(data: Partial<ResortSnapshot> | null | undefined): { tone: Tone; word: string } {
  if (!data?.season) return { tone: 'off', word: 'No report' };
  if (data.season === 'preseason') return { tone: 'off', word: 'Pre-season' };
  if (data.season === 'closed-for-day') return { tone: 'off', word: 'Closed for the day' };
  if (data.season === 'open' && data.operatingToday) {
    return (data.lifts?.hold ?? 0) > 0 ? { tone: 'warn', word: 'Holds' } : { tone: 'ok', word: 'Open' };
  }
  return { tone: 'off', word: 'Unknown' };
}

/** 'Pre-season – projected open Nov 20' (or 'TBA'). */
export function preseasonLine(id: ResortId): string {
  const d = RESORTS[id].projectedOpen;
  return `Pre-season – projected open ${d ? formatLocalDate(d, 'md') : 'TBA'}`;
}

/** '8/11 (+2 hold)'; '—' without a lift list. */
export function liftsText(l: Partial<ResortSnapshot['lifts']> | undefined): string {
  if (!l || typeof l.open !== 'number' || !l.total) return DASH;
  return `${l.open}/${l.total}${l.hold ? ` (+${l.hold} hold)` : ''}`;
}

/** '98/119'; '—' when either side is unknown. */
export function trailsText(t: Partial<ResortSnapshot['trails']> | undefined): string {
  return typeof t?.open === 'number' && t.total ? `${t.open}/${t.total}` : DASH;
}

/** 'WNW 22 mph, gust 41' in the chosen units; '—' without a summit wind. */
export function windText(w: Partial<ResortSnapshot['weather']> | undefined, units: Units): string {
  const speed = fmt('wind', w?.summitWindMph, units);
  if (speed.text === DASH) return DASH;
  const gust = fmt('wind', w?.summitGustMph, units);
  return `${w?.windDir ? `${w.windDir} ` : ''}${speed.text}${gust.text === DASH ? '' : `, gust ${gust.value}`}`;
}

/** '26 min (+8 live)', '≈ 26 min' for a custom base's nearest-preset row. */
export function driveText(min: number | undefined, live: number | undefined, approx: boolean): string {
  if (min === undefined) return DASH;
  return `${approx ? '≈ ' : ''}${min} min${live ? ` (+${live} live)` : ''}`;
}

/** 'me 6 · crew min 4', 'crew min 4', 'Unlimited', or the full cap before the crew is entered. */
export function daysLeftText(
  id: ResortId,
  days: readonly CapDay[],
  crewIds: readonly string[],
  meId: string | null,
): string {
  const g = group(id);
  const cap = CAP_GROUPS[g].cap;
  if (cap === null) return 'Unlimited';
  if (crewIds.length === 0 && !meId) return `${cap} each (no crew yet)`;
  const parts: string[] = [];
  if (meId) parts.push(`me ${remaining(days, meId, g)}`);
  if (crewIds.length > 0) parts.push(`crew min ${crewRemaining(days, crewIds, g)}`);
  return parts.join(' · ');
}
