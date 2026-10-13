// Drive helpers (spec §4.5, §4.6, C.6, C.10): haversine, the nearest preset, the free-flow drive matrix, the
// corridors on the way from a base to a resort, the live travel-time sign for a base and its delay
// (liveDelayMin = max(0, signMin - baselineMin)). Pure; read by the pick, the pick card and the resort page.
import { BASES, type BaseId, DEFAULT_BASE, DRIVE, SIGN_BASELINES, SIGN_RULE } from '../../config/bases.ts';
import { RESORT_IDS, RESORTS } from '../../config/resorts.ts';
import { WASATCH_BACK_LON } from '../../config/roads.ts';
import { usable } from './freshness.ts';
import type { Corridor, ResortId, Snapshot } from './types.ts';

export interface Point {
  lat: number;
  lon: number;
}

const EARTH_KM = 6371;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The preset nearest to a point. */
export function nearestPreset(p: Point): BaseId {
  let best: BaseId = DEFAULT_BASE;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const [id, b] of Object.entries(BASES) as [BaseId, Point][]) {
    const km = haversineKm(p, b);
    if (km < bestKm) [best, bestKm] = [id, km];
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

/** The resort's corridor, plus Parleys when the drive crosses the Wasatch (base lon >= -111.70 to LCC/BCC). */
export function routeCorridors(baseLon: number, r: ResortId): Corridor[] {
  const own: Corridor = RESORTS[r].corridor;
  const back = baseLon >= WASATCH_BACK_LON;
  const cross = back ? own === 'lcc' || own === 'bcc' : r === 'deer-valley';
  return cross && own !== 'parleys' ? [own, 'parleys'] : [own];
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
 * 'LITTLE COTTONWOOD CANYON TOP' and 'TIME TO PARK CITY' for the config's 'LCC top' and 'Park City'. Whole words,
 * never substrings, so 'lcc top' does not miss the spelled-out line and 'BCC top' never matches the LCC line.
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
