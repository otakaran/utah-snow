// Source freshness (spec §5.8), shared by the client badges, /api/health and the pick.
// The client passes nowMs = Date.now() + skew, where skew = server Date header - local time.
import { MTNPOWDER } from './mtnpowder.ts';
import { isoToMs } from './time.ts';
import type { Meta, SourceStatus } from './types.ts';

export type Badge = 'green' | 'amber' | 'red' | 'grey';

/** Rows the browser refetches itself when the Worker is refused (MtnPowder: Imperva challenges Worker egress). */
const BROWSER_FALLBACK: ReadonlySet<string> = new Set(Object.keys(MTNPOWDER).map((r) => `resort:${r}`));

/**
 * Advisory rows: never critical, and their consumers judge each reading by its own stamp (pick/gates.ts reads a
 * station's `at`), so amber is their ceiling. The footer must not say "down" for a source nothing depends on.
 */
const ADVISORY: ReadonlySet<string> = new Set(['obs']);

/**
 * Critical rows (§8.1) drive the global badge and /api/health strict: resort:*, roads:*, nws:*:summit, avy:uac.
 * A 'blocked' row with a browser fallback is not critical: being blocked is its expected production state.
 */
export const isCritical = (id: string, status?: SourceStatus): boolean =>
  !(status === 'blocked' && BROWSER_FALLBACK.has(id)) &&
  (id.startsWith('resort:') || id.startsWith('roads:') || /^nws:[^:]+:summit$/.test(id) || id === 'avy:uac');

/** Minutes since the last good fetch, or null when there never was one. */
export function ageMin(meta: Pick<Meta, 'okAt'>, nowMs: number): number | null {
  const ok = isoToMs(meta.okAt);
  return ok === null ? null : (nowMs - ok) / 60_000;
}

/**
 * grey: offseason. red: never ok, older than 2 x staleAfter, or error/blocked twice in a row (amber for an
 * ADVISORY row). amber: older than staleAfter, or one failed fetch. green: otherwise.
 */
export function badge(meta: Meta, nowMs: number): Badge {
  if (meta.status === 'offseason') return 'grey';
  const age = ageMin(meta, nowMs);
  const failing = meta.status === 'error' || meta.status === 'blocked';
  if (age === null || age > 2 * meta.staleAfterMin || (failing && meta.failCount >= 2)) {
    return ADVISORY.has(meta.source) ? 'amber' : 'red';
  }
  if (age > meta.staleAfterMin || failing) return 'amber';
  return 'green';
}

/** Green or amber: one failed fetch keeps last-good data usable, so the pick does not flip on blips. */
export function usable(meta: Meta, nowMs: number): boolean {
  const b = badge(meta, nowMs);
  return b === 'green' || b === 'amber';
}

/** How the critical rows stand: the worst badge, and how many of the rows that count (not grey) are red or amber. */
export interface FreshSummary {
  badge: Badge;
  red: number;
  amber: number;
  total: number;
}

/**
 * The global badge (§8.1) with its numbers, so a label can say "1 source down" instead of calling the whole site
 * down for one row. Null before any critical row is known; grey when every critical row is off-season.
 */
export function freshSummary(metas: readonly Meta[], nowMs: number): FreshSummary | null {
  const out: FreshSummary = { badge: 'grey', red: 0, amber: 0, total: 0 };
  let known = false;
  for (const m of metas) {
    if (!isCritical(m.source, m.status)) continue;
    known = true;
    const b = badge(m, nowMs);
    if (b === 'grey') continue;
    out.total++;
    if (b === 'red') out.red++;
    else if (b === 'amber') out.amber++;
  }
  if (!known) return null;
  out.badge = out.red > 0 ? 'red' : out.amber > 0 ? 'amber' : out.total > 0 ? 'green' : 'grey';
  return out;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The words for a summary: `long` for desktop and the wall, `short` for the phone header. "Data down" and "Data
 * stale" are kept for when half or more of the rows that count are affected; below that the label counts them.
 */
export function freshLabel(f: FreshSummary | null): { long: string; short: string } {
  if (!f) return { long: 'No data yet', short: '—' };
  if (f.badge === 'grey') return { long: 'Off-season', short: 'Off' };
  if (f.badge === 'green') return { long: 'Data OK', short: 'OK' };
  if (f.badge === 'red') {
    if (2 * f.red >= f.total) return { long: 'Data down', short: 'Down' };
    return { long: `${plural(f.red, 'source')} down`, short: `${f.red} down` };
  }
  if (2 * f.amber >= f.total) return { long: 'Data stale', short: 'Stale' };
  return { long: `${plural(f.amber, 'source')} stale`, short: 'Stale' };
}
