// Source freshness (spec §5.8), shared by the client badges, /api/health and the pick.
// The client passes nowMs = Date.now() + skew, where skew = server Date header - local time.
import { isoToMs } from './time.ts';
import type { Meta } from './types.ts';

export type Badge = 'green' | 'amber' | 'red' | 'grey';

/** Critical rows (§8.1) drive the global badge and /api/health strict: resort:*, roads:*, nws:*:summit, avy:uac. */
export const isCritical = (id: string): boolean =>
  id.startsWith('resort:') || id.startsWith('roads:') || /^nws:[^:]+:summit$/.test(id) || id === 'avy:uac';

/** Minutes since the last good fetch, or null when there never was one. */
export function ageMin(meta: Pick<Meta, 'okAt'>, nowMs: number): number | null {
  const ok = isoToMs(meta.okAt);
  return ok === null ? null : (nowMs - ok) / 60_000;
}

/**
 * grey: offseason. red: never ok, older than 2 x staleAfter, or error/blocked twice in a row.
 * amber: older than staleAfter, or one failed fetch. green: otherwise.
 */
export function badge(meta: Meta, nowMs: number): Badge {
  if (meta.status === 'offseason') return 'grey';
  const age = ageMin(meta, nowMs);
  const failing = meta.status === 'error' || meta.status === 'blocked';
  if (age === null || age > 2 * meta.staleAfterMin || (failing && meta.failCount >= 2)) return 'red';
  if (age > meta.staleAfterMin || failing) return 'amber';
  return 'green';
}

/** Green or amber: one failed fetch keeps last-good data usable, so the pick does not flip on blips. */
export function usable(meta: Meta, nowMs: number): boolean {
  const b = badge(meta, nowMs);
  return b === 'green' || b === 'amber';
}
