// Section freshness for the conditions panels: the worst badge among a panel's source rows, with its oldest age.
import { ageMin, type Badge, badge } from '../../../shared/freshness.ts';
import type { Meta } from '../../../shared/types.ts';

const RANK: Record<Badge, number> = { grey: 0, green: 1, amber: 2, red: 3 };

export interface PanelFreshness {
  badge: Badge;
  age: number | null; // minutes; null = never fetched
}

/** null (never fetched) counts as the oldest age. */
const isOlder = (a: number | null, b: number | null): boolean => b !== null && (a === null || a > b);

export function worstMeta(metas: readonly (Meta | null | undefined)[], nowMs: number): PanelFreshness | null {
  let out: PanelFreshness | null = null;
  for (const m of metas) {
    if (!m) continue;
    const b = badge(m, nowMs);
    const age = ageMin(m, nowMs);
    if (!out || RANK[b] > RANK[out.badge] || (RANK[b] === RANK[out.badge] && isOlder(age, out.age))) {
      out = { badge: b, age };
    }
  }
  return out;
}
