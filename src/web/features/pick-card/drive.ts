// Drive minutes for the active base (spec §4.6, C.6, C.10): the free-flow matrix plus the live sign delay
// (liveDelayMin = max(0, signMin - baselineMin)). Pure. TODO(geo): move to src/shared/geo.ts once it exists.
import { BASES, type BaseId, DRIVE, SIGN_BASELINES, SIGN_RULE } from '../../../../config/bases.ts';
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import { usable } from '../../../shared/freshness.ts';
import type { ResortId, Snapshot } from '../../../shared/types.ts';

export interface Point {
  lat: number;
  lon: number;
}

/** The preset nearest to a point (equirectangular distance is plenty at Wasatch scale). */
export function nearestPreset(p: Point): BaseId {
  const k = Math.cos((p.lat * Math.PI) / 180);
  let best: BaseId = 'cottonwood-heights';
  let bestD = Number.POSITIVE_INFINITY;
  for (const [id, b] of Object.entries(BASES) as [BaseId, Point][]) {
    const d = (b.lat - p.lat) ** 2 + ((b.lon - p.lon) * k) ** 2;
    if (d < bestD) [best, bestD] = [id, d];
  }
  return best;
}

/** Free-flow minutes per resort: the preset's row, or the nearest preset's row for a custom base (approx). */
export function driveMatrix(base: Point & { id: string }): { min: Record<ResortId, number>; approx: boolean } {
  const preset = base.id in BASES ? (base.id as BaseId) : nearestPreset(base);
  const row = DRIVE[preset];
  const min = Object.fromEntries(RESORT_IDS.map((r) => [r, row[r].min])) as Record<ResortId, number>;
  return { min, approx: !(base.id in BASES) };
}

/** The live travel-time sign for a base and resort, or null (Wasatch Back bases, Snowbasin). */
export function signFor(resort: ResortId, base: Point): string | null {
  if (base.lon >= SIGN_RULE.westOfLon) return null;
  const c = RESORTS[resort].corridor;
  if (c === 'lcc' || c === 'bcc') {
    const cw = SIGN_RULE.cottonwood;
    return base.lat < cw.southOfLat ? cw.south : cw.north;
  }
  return resort === 'deer-valley' ? SIGN_RULE['deer-valley'] : null;
}

const ABBR: Record<string, string> = { lcc: 'little cottonwood', bcc: 'big cottonwood' };
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .flatMap((w) => (ABBR[w] ?? w).split(' '))
    .filter(Boolean);

/**
 * A sign line matches a baseline when it holds every baseline word, with LCC/BCC spelled out: the live signs read
 * 'LITTLE COTTONWOOD CANYON TOP' and 'TIME TO PARK CITY' for the config's 'LCC top' and 'Park City'.
 */
export function destMatches(signDest: string, baselineDest: string): boolean {
  const have = new Set(words(signDest));
  return words(baselineDest).every((w) => have.has(w));
}

/** Minutes the live sign adds over its baseline; null without a sign, a usable road row or a matching line. */
export function liveDelayMin(snap: Snapshot | null, resort: ResortId, base: Point, nowMs: number): number | null {
  const sign = signFor(resort, base);
  const corridor = RESORTS[resort].corridor;
  const row = SIGN_BASELINES.find((s) => s.sign === sign && s.corridor === corridor);
  const block = row ? snap?.roads?.[row.corridor] : undefined;
  if (!row || !block?.data || !block.meta || !usable(block.meta, nowMs)) return null;
  const t = block.data.signs
    ?.find((s) => s.id === row.sign)
    ?.travel?.find((x) => typeof x.dest === 'string' && destMatches(x.dest, row.dest));
  return t && Number.isFinite(t.min) ? Math.max(0, Math.round(t.min - row.min)) : null;
}

/** Live delays for every resort that has one. */
export function liveDelays(snap: Snapshot | null, base: Point, nowMs: number): Partial<Record<ResortId, number>> {
  const out: Partial<Record<ResortId, number>> = {};
  for (const r of RESORT_IDS) {
    const d = liveDelayMin(snap, r, base, nowMs);
    if (d !== null) out[r] = d;
  }
  return out;
}
