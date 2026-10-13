// Pure mapping of src/shared/caps.ts `summary` to the "Days left" table (spec §9.2, §9.5): one row per person and
// a crew-minimum row, each cell a tone + word + number (status = shape + word + color). Red at 0 left.
import { CAP_GROUPS } from '../../../../config/ikon.ts';
import { type CapDay, GROUP_IDS, summary } from '../../../shared/caps.ts';
import type { CapGroupId } from '../../../shared/types.ts';
import type { Tone } from '../../ui/status.ts';

/** At or below this many days left a group turns amber. */
export const LOW_LEFT = 2;

export interface CapCell {
  group: CapGroupId;
  label: string;
  cap: number | null; // null = unlimited
  skied: number;
  planned: number;
  remaining: number | null; // null = unlimited; negative = over the cap
  tone: Tone;
  word: string;
}

export interface CapRow {
  id: string;
  name: string;
  cells: CapCell[];
}

export interface CapTable {
  groups: { id: CapGroupId; label: string; cap: number | null }[];
  rows: CapRow[];
  /** Fewest days left per group across the crew; null with fewer than two people. */
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

const cell = (g: CapGroupId, skied: number, planned: number, left: number | null): CapCell => ({
  group: g,
  label: CAP_GROUPS[g].label,
  cap: CAP_GROUPS[g].cap,
  skied,
  planned,
  remaining: left,
  tone: capTone(left),
  word: capWord(left),
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
          const lefts = rows.map((r) => r.cells[i]?.remaining ?? null);
          const capped = lefts.filter((n): n is number => n !== null);
          const skied = rows.reduce((n, r) => n + (r.cells[i]?.skied ?? 0), 0);
          const planned = rows.reduce((n, r) => n + (r.cells[i]?.planned ?? 0), 0);
          return cell(g, skied, planned, capped.length > 0 ? Math.min(...capped) : null);
        });
  return {
    groups: GROUP_IDS.map((id) => ({ id, label: CAP_GROUPS[id].label, cap: CAP_GROUPS[id].cap })),
    rows,
    crew,
  };
}
