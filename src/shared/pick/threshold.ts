// Save-thresholds and the day term (spec §10.2 step 3, Appendix C.9). A capped group spends a day only when eff
// reaches its threshold T(g), the depth exceeded on a share u = R/Sx of days; u >= 1 is use-it-or-lose-it.
import { TRIP } from '../../../config/ikon.ts';
import { STRATEGY } from '../../../config/strategy.ts';
import { type CapDay, capOf, crewRemaining, GROUP_IDS } from '../caps.ts';
import { addDays, daysBetween } from '../time.ts';
import type { CapGroupId, GroupThreshold } from '../types.ts';

const EPS = 1e-9;
type ExceedGroup = keyof typeof STRATEGY.exceedance;

export interface GroupState {
  remaining: number; // R: crew min of days left in the group; Infinity for Solitude
  u: number; // R / Sx
  threshold: number; // T in inches; 0 when free
  expiringFrom: string | null;
}

export interface DayTerm {
  value: number;
  cls: 0 | 1 | 2;
  kind: 'free' | 'use' | 'spend' | 'save';
}

/** Trip days D from `target` to TRIP.end inclusive, and the expected ski days Sx = max(1, D x fraction). */
export function skiDaysLeft(target: string, fraction: number): { days: number; sx: number } {
  const days = Math.max(0, daysBetween(target, TRIP.end) + 1);
  return { days, sx: Math.max(1, days * fraction) };
}

/** Depth x with exceedance_g(x) = q on the piecewise-linear ladder; 0 for q >= 1, 14 at or below the last point. */
export function invExceed(g: ExceedGroup, q: number): number {
  const ex: readonly number[] = STRATEGY.exceedance[g];
  const ladder: readonly number[] = STRATEGY.ladder;
  const last = ex.length - 1;
  if (q >= 1) return 0;
  if (q <= (ex[last] ?? 0)) return ladder[last] ?? 0;
  for (let i = 0; i < last; i++) {
    const hi = ex[i] ?? 0;
    const lo = ex[i + 1] ?? 0;
    if (q <= hi && q > lo) {
      const x0 = ladder[i] ?? 0;
      return x0 + ((hi - q) / (hi - lo)) * ((ladder[i + 1] ?? 0) - x0);
    }
  }
  return 0;
}

/** First date the group turns use-it-or-lose-it: TRIP.end - floor(R / fraction) + 1 (clamped to the trip start). */
export function expiringFrom(remaining: number, fraction: number): string | null {
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const date = addDays(TRIP.end, 1 - Math.floor(remaining / fraction + EPS));
  return date < TRIP.start ? TRIP.start : date;
}

/** R, u, T and expiringFrom per group for the members (none = one skier with every day unused). */
export function groupStates(
  days: readonly CapDay[],
  memberIds: readonly string[],
  target: string,
  sx: number,
  fraction: number,
): Record<CapGroupId, GroupState> {
  const out = {} as Record<CapGroupId, GroupState>;
  for (const g of GROUP_IDS) {
    const remaining = memberIds.length ? crewRemaining(days, memberIds, g, target) : capOf(g);
    const u = remaining / sx;
    const threshold = g === 'solitude' || u >= 1 - EPS ? 0 : invExceed(g, u);
    out[g] = { remaining, u, threshold, expiringFrom: expiringFrom(remaining, fraction) };
  }
  return out;
}

/** Solitude is free; use-it-or-lose-it earns a bonus; at/above T a day is spent; below T the day is saved. */
export function dayTerm(g: CapGroupId, eff: number, st: GroupState): DayTerm {
  if (g === 'solitude') return { value: 0, cls: 0, kind: 'free' };
  if (st.u >= 1 - EPS) return { value: STRATEGY.useBonus, cls: 0, kind: 'use' };
  if (eff >= st.threshold) return { value: 0, cls: 1, kind: 'spend' };
  return { value: -(STRATEGY.saveBasePen + st.threshold - eff), cls: 2, kind: 'save' };
}

/** The JSON-safe `thresholds` block of PickResult (the tracker's Thresholds panel reads it). */
export function thresholdsOut(states: Record<CapGroupId, GroupState>): Record<CapGroupId, GroupThreshold> {
  const out = {} as Record<CapGroupId, GroupThreshold>;
  for (const g of GROUP_IDS) {
    const s = states[g];
    out[g] = {
      remaining: Number.isFinite(s.remaining) ? s.remaining : null,
      threshold: s.threshold,
      expiringFrom: s.expiringFrom,
    };
  }
  return out;
}
