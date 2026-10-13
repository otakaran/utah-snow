// Pure model of the day grid (spec §9.5): trip dates x crew, default status per date, and the picker's resort
// choices with the reason a choice is off (skiers-only for a boarder, or the cap group used up). Dates are Denver
// 'YYYY-MM-DD' strings; `today` comes from the server clock.
import { CAP_GROUPS, TRIP } from '../../../../config/ikon.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import { type CapDay, type DayStatus, group, remaining, skiersOnly } from '../../../shared/caps.ts';
import { addDays, tripDayNumber } from '../../../shared/time.ts';
import type { SkiMode, TrackerResort } from '../../../shared/types.ts';

/** Picker order: the LCC pair and their combo first, then BCC, Park City and Ogden. */
export const PICKER_ORDER: readonly TrackerResort[] = [
  'alta',
  'snowbird',
  'alta-snowbird',
  'brighton',
  'solitude',
  'deer-valley',
  'snowbasin',
];

export const RESORT_LABEL: Record<TrackerResort, string> = {
  alta: RESORTS.alta.name,
  snowbird: RESORTS.snowbird.name,
  'alta-snowbird': `${RESORTS.alta.name} + ${RESORTS.snowbird.name}`,
  brighton: RESORTS.brighton.name,
  solitude: RESORTS.solitude.name,
  'deer-valley': RESORTS['deer-valley'].name,
  snowbasin: RESORTS.snowbasin.name,
};

export const STATUS_WORD: Record<DayStatus, string> = { planned: 'Planned', skied: 'Skied' };

export type When = 'past' | 'today' | 'future';

export interface GridCell<D extends CapDay = CapDay> {
  personId: string;
  date: string;
  day: D | null;
}

export interface GridRow<D extends CapDay = CapDay> {
  date: string;
  dayNo: number; // 1-based trip day
  when: When;
  cells: GridCell<D>[];
}

/** Every trip date, TRIP.start..TRIP.end inclusive (36). */
export function tripDates(): string[] {
  const out: string[] = [];
  for (let d: string = TRIP.start; d <= TRIP.end; d = addDays(d, 1)) out.push(d);
  return out;
}

const whenOf = (date: string, today: string): When => (date < today ? 'past' : date === today ? 'today' : 'future');

/** Past dates default to skied; today and future dates to planned. */
export const defaultStatus = (date: string, today: string): DayStatus => (date < today ? 'skied' : 'planned');

/** One row per trip date, one cell per person (in crew order); a day of someone not listed is ignored. */
export function gridRows<D extends CapDay>(
  people: readonly { id: string }[],
  days: readonly D[],
  today: string,
): GridRow<D>[] {
  const byKey = new Map<string, D>();
  for (const d of days) byKey.set(`${d.personId}|${d.date}`, d);
  return tripDates().map((date) => ({
    date,
    dayNo: tripDayNumber(date) ?? 0,
    when: whenOf(date, today),
    cells: people.map((p) => ({ personId: p.id, date, day: byKey.get(`${p.id}|${date}`) ?? null })),
  }));
}

/** Phone list order (spec §9.5): today, then upcoming dates, then past dates (most recent first, collapsed). */
export function dayListGroups<R extends { when: When }>(rows: readonly R[]): { head: R[]; past: R[] } {
  const today = rows.filter((r) => r.when === 'today');
  const upcoming = rows.filter((r) => r.when === 'future');
  const past = rows.filter((r) => r.when === 'past').reverse();
  return { head: [...today, ...upcoming], past };
}

/** The row to bring into view: today during the trip, else the first (before) or the last (after) trip day. */
export function focusDate(today: string): string {
  if (!today || today < TRIP.start) return TRIP.start;
  return today > TRIP.end ? TRIP.end : today;
}

export interface ResortChoice {
  resort: TrackerResort;
  label: string;
  disabled: boolean;
  /** Why the choice is off ('Skiers only', 'All 7 Alta/Snowbird days used'), else null. */
  reason: string | null;
  /** Days left in the group if this date takes one (null = unlimited). */
  left: number | null;
}

/**
 * The picker's options for one person on one date. Boarders cannot pick skiers-only terrain; a group with no day
 * left (not counting this date's own row) is off. Mode 'unknown' stays allowed (the server warns).
 */
export function resortChoices(
  person: { id: string; mode: SkiMode },
  days: readonly CapDay[],
  date: string,
): ResortChoice[] {
  return PICKER_ORDER.map((resort) => {
    const g = group(resort);
    const before = remaining(days, person.id, g, { excludeDate: date });
    const cap = CAP_GROUPS[g].cap;
    let reason: string | null = null;
    if (person.mode === 'board' && skiersOnly(resort)) reason = 'Skiers only';
    else if (before <= 0) reason = `All ${cap} ${CAP_GROUPS[g].label} days used`;
    return {
      resort,
      label: RESORT_LABEL[resort],
      disabled: reason !== null,
      reason,
      left: Number.isFinite(before) ? Math.max(0, before - 1) : null,
    };
  });
}

/** Cell caption: resort and status word, or null for an empty cell. */
export function cellText(day: Pick<CapDay, 'resortId' | 'status'> | null): { resort: string; status: string } | null {
  return day ? { resort: RESORT_LABEL[day.resortId], status: STATUS_WORD[day.status] } : null;
}

/** Accessible name of a grid cell or list chip: 'Ana, Sun, Dec 27: Alta, Skied. Change'. */
export function cellLabel(name: string, dateText: string, day: Pick<CapDay, 'resortId' | 'status'> | null): string {
  const t = cellText(day);
  return `${name}, ${dateText}: ${t ? `${t.resort}, ${t.status}` : 'no day recorded'}. Change`;
}
