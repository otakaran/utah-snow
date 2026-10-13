// Pure mapping of src/shared/caps.ts `summary` to the "Days left" table (spec §9.2, §9.5): one row per person and
// a crew-minimum row, each cell a tone + word (status = shape + word + color, red at 0 left) and punch-card pips.
import { CAP_GROUPS } from '../../../../config/ikon.ts';
import { type CapDay, GROUP_IDS, summary } from '../../../shared/caps.ts';
import type { CapGroupId, GroupThreshold } from '../../../shared/types.ts';
import type { Tone } from '../../ui/status.ts';

/** At or below this many days left a group turns amber. */
export const LOW_LEFT = 2;

/** One punch-card pip per day of the cap: skied and planned days are used, the rest are left. */
export type Pip = 'skied' | 'planned' | 'left';

export interface CapCell {
  group: CapGroupId;
  label: string;
  cap: number | null; // null = unlimited
  skied: number;
  planned: number;
  remaining: number | null; // null = unlimited; negative = over the cap
  tone: Tone;
  word: string;
  pips: Pip[]; // [] when unlimited; longer than the cap when over it
}

export interface CapRow {
  id: string;
  name: string;
  cells: CapCell[];
}

export interface CapTable {
  groups: { id: CapGroupId; label: string; cap: number | null }[];
  rows: CapRow[];
  /** Fewest days left per group across the crew (that person's skied/planned split); null under two people. */
  crew: CapCell[] | null;
}

export function capTone(left: number | null): Tone {
  if (left === null) return 'ok';
  if (left <= 0) return 'bad';
  return left <= LOW_LEFT ? 'warn' : 'ok';
}

export function capWord(left: number | null): string {
  if (left === null) return 'Unlimited';
  if (left < 0) return `${-left} over`;
  return left === 0 ? 'None left' : `${left} left`;
}

/** Skied pips first, then planned, then the days left; none for an unlimited group. */
export function pips(cap: number | null, skied: number, planned: number): Pip[] {
  if (cap === null) return [];
  const used = skied + planned;
  return Array.from({ length: Math.max(cap, used) }, (_, i) => (i < skied ? 'skied' : i < used ? 'planned' : 'left'));
}

const cell = (g: CapGroupId, skied: number, planned: number, left: number | null): CapCell => ({
  group: g,
  label: CAP_GROUPS[g].label,
  cap: CAP_GROUPS[g].cap,
  skied,
  planned,
  remaining: left,
  tone: capTone(left),
  word: capWord(left),
  pips: pips(CAP_GROUPS[g].cap, skied, planned),
});

/** The table for the active crew (in crew order); days of anyone not listed are ignored. */
export function capTable(people: readonly { id: string; name: string }[], days: readonly CapDay[]): CapTable {
  const sum = summary(
    days,
    people.map((p) => p.id),
  );
  const rows: CapRow[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    cells: GROUP_IDS.map((g) => {
      const c = sum[p.id]?.[g];
      return cell(g, c?.skied ?? 0, c?.planned ?? 0, c ? c.remaining : CAP_GROUPS[g].cap);
    }),
  }));
  const crew =
    rows.length < 2
      ? null
      : GROUP_IDS.map((g, i) => {
          let low: CapCell | undefined;
          for (const r of rows) {
            const c = r.cells[i];
            if (c && c.remaining !== null && c.remaining < (low?.remaining ?? Number.POSITIVE_INFINITY)) low = c;
          }
          return cell(g, low?.skied ?? 0, low?.planned ?? 0, low?.remaining ?? null);
        });
  return {
    groups: GROUP_IDS.map((id) => ({ id, label: CAP_GROUPS[id].label, cap: CAP_GROUPS[id].cap })),
    rows,
    crew,
  };
}

/** A chip's save line: the pick's threshold in inches (0 = free), null for '—'; `from` = the use-it-or-lose-it date. */
export interface ChipSave {
  threshold: number | null;
  from: string | null;
}

/**
 * The pick's threshold counts days left without the target day, the chip with it, so a group whose last day is
 * planned today would read "None left" beside a save number: the chip's own count gates the threshold.
 */
export function chipSave(c: CapCell, t: GroupThreshold | undefined): ChipSave {
  if (c.cap === null || !t || (t.remaining ?? 0) <= 0 || (c.remaining ?? 0) <= 0)
    return { threshold: null, from: null };
  return { threshold: t.threshold, from: t.threshold > 0 ? t.expiringFrom : null };
}
