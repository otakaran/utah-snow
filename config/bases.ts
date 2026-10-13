// Base presets, drive matrix, live-sign rule, custom-base bounds and the /api/drive OSRM constants (spec §4.6, §7,
// Appendix C.1, C.6, C.10). Read by src/shared/geo.ts and api/drive.ts. Drive values are OSRM free-flow min / miles.
import type { Corridor, ResortId } from '../src/shared/types.ts';
import { WASATCH_BACK_LON } from './roads.ts';

export type BaseId = 'cottonwood-heights' | 'downtown-slc' | 'sandy' | 'park-city-old-town' | 'slc-airport';
export interface BasePreset {
  label: string;
  lat: number;
  lon: number;
  grid: string; // NWS 'SLC/x,y'
  zone: string;
}
export interface Drive {
  min: number;
  mi: number;
  via?: string;
}

export const DEFAULT_BASE = 'cottonwood-heights' satisfies BaseId;

export const BASES = {
  'cottonwood-heights': {
    label: 'Cottonwood Heights',
    lat: 40.6197,
    lon: -111.8105,
    grid: 'SLC/102,169',
    zone: 'UTZ105',
  },
  'downtown-slc': { label: 'Downtown SLC', lat: 40.7608, lon: -111.891, grid: 'SLC/100,175', zone: 'UTZ105' },
  sandy: { label: 'Sandy', lat: 40.565, lon: -111.8389, grid: 'SLC/101,166', zone: 'UTZ105' },
  'park-city-old-town': {
    label: 'Park City Old Town',
    lat: 40.6461,
    lon: -111.498,
    grid: 'SLC/113,169',
    zone: 'UTZ108',
  },
  'slc-airport': { label: 'SLC Airport', lat: 40.7899, lon: -111.9791, grid: 'SLC/98,177', zone: 'UTZ105' },
} as const satisfies Record<BaseId, BasePreset>;

// Appendix C.6. A custom base uses its nearest preset's row (haversine), labelled "≈ approx", until /api/drive answers.
export const DRIVE = {
  'cottonwood-heights': {
    alta: { min: 26, mi: 13.3 },
    snowbird: { min: 23, mi: 12.0 },
    brighton: { min: 32, mi: 16.0 },
    solitude: { min: 28, mi: 13.8 },
    'deer-valley': { min: 44, mi: 30.7 },
    snowbasin: { min: 72, mi: 57.1 },
  },
  'downtown-slc': {
    alta: { min: 46, mi: 27.0 },
    snowbird: { min: 43, mi: 25.7 },
    brighton: { min: 51, mi: 29.7 },
    solitude: { min: 48, mi: 27.5 },
    'deer-valley': { min: 48, mi: 32.5 },
    snowbasin: { min: 59, mi: 43.6 },
  },
  sandy: {
    alta: { min: 27, mi: 12.8 },
    snowbird: { min: 24, mi: 11.5 },
    brighton: { min: 42, mi: 21.6 },
    solitude: { min: 38, mi: 19.4 },
    'deer-valley': { min: 53, mi: 35.8 },
    snowbasin: { min: 76, mi: 58.6 },
  },
  'park-city-old-town': {
    alta: { min: 63, mi: 41.6 },
    snowbird: { min: 59, mi: 40.3 },
    brighton: { min: 69, mi: 44.4, via: 'BCC mouth' },
    solitude: { min: 65, mi: 42.2, via: 'BCC mouth' },
    'deer-valley': { min: 4, mi: 1.5 },
    snowbasin: { min: 80, mi: 64.0 },
  },
  'slc-airport': {
    alta: { min: 53, mi: 34.0 },
    snowbird: { min: 50, mi: 32.7 },
    brighton: { min: 59, mi: 36.7 },
    solitude: { min: 55, mi: 34.6 },
    'deer-valley': { min: 56, mi: 39.6 },
    snowbasin: { min: 65, mi: 47.2 },
  },
} as const satisfies Record<BaseId, Record<ResortId, Drive>>;

// Live-delay sign per base (one rule for presets and custom bases). Bases with lon >= westOfLon get no sign.
// Presets: cottonwood-heights, downtown-slc, slc-airport -> 6019; sandy -> 6040; park-city-old-town -> none.
export const SIGN_RULE = {
  westOfLon: WASATCH_BACK_LON,
  cottonwood: { southOfLat: 40.595, south: '6040', north: '6019' }, // lcc and bcc resorts
  'deer-valley': '6014',
  snowbasin: null,
} as const;

// liveDelayMin = max(0, signMin - baselineMin). 2026-10-12 off-peak readings; on Dec 1 recalibrate each to the
// minimum overnight value in road_history. `dest` matches the sign line case-insensitively.
export const SIGN_BASELINES = [
  { sign: '6019', corridor: 'lcc', dest: 'LCC top', min: 24 },
  { sign: '6019', corridor: 'bcc', dest: 'BCC top', min: 27 },
  { sign: '6040', corridor: 'lcc', dest: 'LCC top', min: 25 },
  { sign: '6040', corridor: 'bcc', dest: 'BCC top', min: 36 },
  { sign: '6014', corridor: 'parleys', dest: 'Park City', min: 14 },
] as const satisfies readonly { sign: string; corridor: Corridor; dest: string; min: number }[];

// Custom base: outside these bounds show "Outside the Wasatch area". No geocoder.
export const CUSTOM_BOUNDS = {
  lat: [40.3, 41.4],
  lon: [-112.2, -111.2],
  labelLen: [1, 30],
  dp: 3, // lat/lon rounding
} as const;
export const GEO_OPTIONS = { enableHighAccuracy: false, timeout: 10000 } as const;
// Google Maps URL patterns, tried in order: the place pin (!3d lat !4d lon), the map center (@lat,lon), a ?q=/ll= query.
export const MAPS_LINK_RES = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/,
] as const;

// GET /api/drive (spec §7): OSRM demo server (<= 1 req/s), one call per resort to its base lot, 1.1 s apart. Results are
// cached in D1 drive_cache for 30 days; at most 20 cache misses per Denver day (global).
export const OSRM = {
  route: 'https://router.project-osrm.org/route/v1/driving/',
  gapMs: 1100,
  missesPerDay: 20,
  cacheDays: 30,
} as const;
// Brighton and Solitude route through the BCC mouth, so OSRM never sends them over Guardsman Pass.
export const BCC_MOUTH = { via: 'bcc-mouth', label: 'BCC mouth', lat: 40.6197, lon: -111.7869 } as const;
export const VIA_BCC_MOUTH = ['brighton', 'solitude'] as const satisfies readonly ResortId[];
// Any other route with a vertex within radiusKm of the pass gets this warning (the pass is closed in winter).
export const GUARDSMAN = {
  lat: 40.6067,
  lon: -111.5549,
  radiusKm: 1.0,
  warning: 'route uses seasonally closed Guardsman Pass',
} as const;

// NWS alerts never depend on the base: always these zones, no per-point query.
export const ALERT_ZONES = ['UTZ105', 'UTZ108', 'UTZ110', 'UTZ111'] as const;
