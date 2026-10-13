// Pure text helpers for the pick card (unit-tested in labels.test.ts). No DOM, no signals.
import { TRIP } from '../../../../config/ikon.ts';
import type { CapDay } from '../../../shared/caps.ts';
import { remaining } from '../../../shared/caps.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { CapGroupId, PickMember, Tier } from '../../../shared/types.ts';

export const TIER_LABEL: Record<Tier, string> = { deep: 'Deep', good: 'Good', soft: 'Soft', quiet: 'Quiet' };

/** 'Preview (trip starts Dec 27)'. */
export const previewLabel = (): string => `Preview (trip starts ${formatLocalDate(TRIP.start, 'md')})`;

/** The §10.3 day-cost reason ('Spends 1 Alta/Snowbird day each (crew min 4 → 3): …'). */
export const isDayCost = (reason: string): boolean => reason.startsWith('Spends ');

/** A reason that carries a signed score effect, e.g. 'SR-210 closed …, ETO 9:30 AM (−2)'. */
const SIGNED = /\([−+-]\d/;

/** The one reason an alternative shows: a scored effect first, then the day cost, then the first reason. */
export function altReason(reasons: readonly string[]): string {
  return reasons.find((r) => SIGNED.test(r)) ?? reasons.find(isDayCost) ?? reasons[0] ?? '';
}

export interface MemberCost {
  id: string;
  name: string;
  before: number;
  after: number;
}

/** Each member's remaining days in a capped group before and after today ('Ana 4 → 3'); [] for unlimited. */
export function memberCosts(
  members: readonly PickMember[],
  days: readonly CapDay[],
  g: CapGroupId,
  date: string,
  spends: number,
): MemberCost[] {
  const out: MemberCost[] = [];
  for (const m of members) {
    const before = remaining(days, m.id, g, { excludeDate: date });
    if (!Number.isFinite(before)) return [];
    out.push({ id: m.id, name: m.name, before, after: before - spends });
  }
  return out;
}

/** 'Otakar, Ana, Kuba (board)' for the crew line; unknown modes get '(ski/board?)'. */
export function crewNames(members: readonly PickMember[]): string {
  return members
    .map((m) => (m.mode === 'board' ? `${m.name} (board)` : m.mode === 'unknown' ? `${m.name} (ski/board?)` : m.name))
    .join(', ');
}

/** Peak heights as 0..1 fractions of the tallest plausible night (a 6″ floor keeps a 1″ night from looking deep). */
export function peakFractions(values: readonly (number | null)[], floorIn = 6): number[] {
  const top = Math.max(floorIn, ...values.map((v) => v ?? 0));
  return values.map((v) => (v === null || !Number.isFinite(v) ? 0 : Math.max(0.08, Math.min(1, v / top))));
}
