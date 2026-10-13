// Ikon cap-group math (spec §9.2), pure. Groups and caps come only from config/ikon.ts.
// A planned day reserves a day; an 'alta-snowbird' row (both resorts, same day) counts once.
import { CAP_GROUPS, SKIERS_ONLY } from '../../config/ikon.ts';
import type { CapGroupId, TrackerResort } from './types.ts';

export type DayStatus = 'planned' | 'skied';

/** The fields of a tracker day row that cap math needs (GET /api/tracker `days[]`). */
export interface CapDay {
  personId: string;
  date: string;
  resortId: TrackerResort;
  status: DayStatus;
}

export interface CapCount {
  cap: number | null; // null = unlimited (JSON-safe)
  skied: number;
  planned: number;
  remaining: number | null; // null = unlimited
}

export const GROUP_IDS = Object.keys(CAP_GROUPS) as CapGroupId[];

const GROUP_OF = new Map<string, CapGroupId>();
for (const g of GROUP_IDS) {
  GROUP_OF.set(g, g);
  for (const r of CAP_GROUPS[g].resorts) GROUP_OF.set(r, g);
}

/** alta, snowbird and alta-snowbird -> 'alta-snowbird'; any other value maps to itself. */
export function group(r: TrackerResort): CapGroupId {
  return GROUP_OF.get(r) ?? (r as CapGroupId);
}

/** Tracker values that count toward each group, for generating SQL IN (...) lists. */
export const GROUP_VALUES = Object.fromEntries(
  GROUP_IDS.map((g) => [g, [...GROUP_OF].filter(([, v]) => v === g).map(([k]) => k as TrackerResort)]),
) as Record<CapGroupId, TrackerResort[]>;

/** Days allowed in a group; Infinity when unlimited (solitude). */
export function capOf(g: CapGroupId): number {
  return CAP_GROUPS[g].cap ?? Number.POSITIVE_INFINITY;
}

/** Skiers-only terrain (Alta, Deer Valley); the combined alta-snowbird day includes Alta. */
export function skiersOnly(r: TrackerResort): boolean {
  return r === 'alta-snowbird' || (SKIERS_ONLY as readonly string[]).includes(r);
}

function used(days: readonly CapDay[], personId: string, g: CapGroupId, excludeDate?: string): CapDay[] {
  return days.filter((d) => d.personId === personId && d.date !== excludeDate && group(d.resortId) === g);
}

/** cap - (planned + skied days of the person in the group, ignoring excludeDate). Infinity for solitude. */
export function remaining(
  days: readonly CapDay[],
  personId: string,
  g: CapGroupId,
  opts: { excludeDate?: string } = {},
): number {
  return capOf(g) - used(days, personId, g, opts.excludeDate).length;
}

/** Fewest days left in the group across the crew (Infinity for an empty crew or solitude). */
export function crewRemaining(
  days: readonly CapDay[],
  members: readonly string[],
  g: CapGroupId,
  excludeDate?: string,
): number {
  return Math.min(...members.map((m) => remaining(days, m, g, { excludeDate })));
}

/** True when setting `day` (replacing any row on its date) would exceed the person's cap. */
export function exceedsCap(days: readonly CapDay[], day: Pick<CapDay, 'personId' | 'date' | 'resortId'>): boolean {
  return remaining(days, day.personId, group(day.resortId), { excludeDate: day.date }) <= 0;
}

/** {[personId]: {[group]: {cap, skied, planned, remaining}}} for GET /api/tracker. */
export function summary(
  days: readonly CapDay[],
  personIds: readonly string[],
): Record<string, Record<CapGroupId, CapCount>> {
  const out: Record<string, Record<CapGroupId, CapCount>> = {};
  for (const p of personIds) {
    const row = {} as Record<CapGroupId, CapCount>;
    for (const g of GROUP_IDS) {
      const rows = used(days, p, g);
      const skied = rows.filter((d) => d.status === 'skied').length;
      const cap = CAP_GROUPS[g].cap;
      row[g] = { cap, skied, planned: rows.length - skied, remaining: cap === null ? null : cap - rows.length };
    }
    out[p] = row;
  }
  return out;
}
