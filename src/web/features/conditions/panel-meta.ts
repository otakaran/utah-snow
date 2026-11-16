// Section freshness for the conditions panels: the worst badge among a panel's source rows, with its oldest age and
// how many rows carry it (one late resort report must not read as every report being down).
import { ageMin, type Badge, badge } from '../../../shared/freshness.ts';
import type { Meta } from '../../../shared/types.ts';

const RANK: Record<Badge, number> = { grey: 0, green: 1, amber: 2, red: 3 };

export interface PanelFreshness {
  badge: Badge;
  age: number | null; // minutes; null = never fetched
  bad: number; // rows on that worst badge
  total: number; // rows in the panel
}

/** null (never fetched) counts as the oldest age. */
const isOlder = (a: number | null, b: number | null): boolean => b !== null && (a === null || a > b);

export function worstMeta(metas: readonly (Meta | null | undefined)[], nowMs: number): PanelFreshness | null {
  let worst: Badge | null = null;
  let age: number | null = null;
  let bad = 0;
  let total = 0;
  for (const m of metas) {
    if (!m) continue;
    total++;
    const b = badge(m, nowMs);
    const a = ageMin(m, nowMs);
    if (worst === null || RANK[b] > RANK[worst]) [worst, age, bad] = [b, a, 1];
    else if (b === worst) {
      bad++;
      if (isOlder(a, age)) age = a;
    }
  }
  return worst === null ? null : { badge: worst, age, bad, total };
}

/** '1 of 6 down' when only some of a panel's rows are red or amber; null when one word covers the panel. */
export function partialWord(f: PanelFreshness): string | null {
  if ((f.badge !== 'red' && f.badge !== 'amber') || f.bad >= f.total) return null;
  return `${f.bad} of ${f.total} ${f.badge === 'red' ? 'down' : 'stale'}`;
}
