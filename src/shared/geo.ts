// Drive helpers (spec §4.5, §4.6, §7, C.6, C.10): haversine, the nearest preset, custom-base rounding and its
// /api/drive key, the free-flow drive matrix, the corridors on the way from a base to a resort, the live
// travel-time sign for a base and its delay (liveDelayMin = max(0, signMin - baselineMin)). Pure; read by the pick,
// the pick card, the resort page and api/drive.ts.
import {
  BASES,
  type BaseId,
  BCC_MOUTH,
  CUSTOM_BOUNDS,
  DEFAULT_BASE,
  DRIVE,
  SIGN_BASELINES,
  SIGN_RULE,
} from '../../config/bases.ts';
import { RESORT_IDS, RESORTS } from '../../config/resorts.ts';
import { WASATCH_BACK_LON } from '../../config/roads.ts';
import { usable } from './freshness.ts';
import type { Corridor, DriveLeg, ResortId, Snapshot } from './types.ts';

export interface Point {
  lat: number;
  lon: number;
}

const EARTH_KM = 6371;
const rad = (deg: number): number => (deg * Math.PI) / 180;
const SCALE = 10 ** CUSTOM_BOUNDS.dp;
const within = (n: number, [lo, hi]: readonly [number, number]): boolean => n >= lo && n <= hi;

/** A point rounded to CUSTOM_BOUNDS.dp (3 dp), the precision of every custom base and /api/drive key. */
export const roundPoint = (p: Point): Point => ({
  lat: Math.round(p.lat * SCALE) / SCALE,
  lon: Math.round(p.lon * SCALE) / SCALE,
});

/** A custom-base point rounded to 3 dp, or null when it is not finite or (once rounded) outside CUSTOM_BOUNDS. */
export function wasatchPoint(lat: number, lon: number): Point | null {
  const p = roundPoint({ lat, lon });
  return within(p.lat, CUSTOM_BOUNDS.lat) && within(p.lon, CUSTOM_BOUNDS.lon) ? p : null;
}

/** '{lat},{lon}' of a rounded point ('40.761,-111.891'): the D1 drive_cache and utahsnow.driveCustom key. */
export const driveKey = (p: Point): string => `${p.lat},${p.lon}`;

/** Great-circle distance in km. */
export function haversineKm(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * True when any [lon, lat] vertex (GeoJSON order) lies within `km` of `p`. A degree box rejects almost every vertex
 * with two subtractions, so a full OSRM geometry costs well under a millisecond; only box hits pay for haversine.
 */
export function passesNear(coords: readonly (readonly number[])[], p: Point, km: number): boolean {
  const dLat = km / 110.5; // km per degree of latitude, rounded down so the box over-covers
  const dLon = dLat / Math.cos(rad(p.lat));
  for (const c of coords) {
    const lon = c[0] ?? Number.NaN;
    const lat = c[1] ?? Number.NaN;
    if (Math.abs(lat - p.lat) > dLat || Math.abs(lon - p.lon) > dLon) continue;
    if (haversineKm({ lat, lon }, p) <= km) return true;
  }
  return false;
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

/** Miles and route notes of an exact drive (a preset row or /api/drive); `via` is display text. */
export interface DriveDetail {
  mi: number;
  via?: string;
  warning?: string;
}
export interface DriveMatrix {
  min: Record<ResortId, number>;
  exact: Partial<Record<ResortId, DriveDetail>>; // resorts with an exact drive; the others show "≈" (nearest preset)
}

type ExactDrive = { min: number; mi: number; via?: string; warning?: string };

/**
 * Free-flow minutes per resort. A preset uses its own row. A custom base uses its /api/drive results (`api`) where
 * they exist and the nearest preset's row (approx) for every other resort, e.g. while the request is pending.
 */
export function driveMatrix(
  base: Point & { id: string },
  api?: Partial<Record<ResortId, DriveLeg>> | null,
): DriveMatrix {
  const preset = base.id in BASES ? (base.id as BaseId) : null;
  const row = DRIVE[preset ?? nearestPreset(base)];
  const min = {} as Record<ResortId, number>;
  const exact: DriveMatrix['exact'] = {};
  for (const r of RESORT_IDS) {
    const hit: ExactDrive | undefined = preset ? row[r] : api?.[r];
    min[r] = hit ? hit.min : row[r].min;
    if (!hit) continue;
    const d: DriveDetail = { mi: hit.mi };
    if (hit.via) d.via = hit.via === BCC_MOUTH.via ? BCC_MOUTH.label : hit.via;
    if (hit.warning) d.warning = hit.warning;
    exact[r] = d;
  }
  return { min, exact };
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
