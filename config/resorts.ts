// The 6 resorts (spec §4.2, Appendix C.1-C.4, C.8). Key order is canonical: it is the Open-Meteo array index (C.5).
// Coordinates from OSM, elevations from USGS EPQS, NWS grids from live /points lookups (re-checked weekly, §5.3).
import type { CapGroupId, Corridor, ResortId } from '../src/shared/types.ts';

export interface GeoPoint {
  label: string;
  lat: number;
  lon: number;
  ft: number; // true elevation
}
export interface NwsPoint {
  grid: string; // 'SLC/x,y' for /gridpoints/{grid}; office SLC, radar KMTX, fire zone UTZ479
  cellFt: number; // grid cell elevation, not the true point's
  zone: string;
  county: string;
}
export interface LiftWindow {
  lifts: readonly string[] | 'all';
  open: string; // HH:MM local
  close: string;
}
export interface LiftHours {
  day: readonly LiftWindow[];
  early?: LiftWindow; // early-season hours
  night?: LiftWindow & { noWeekdays: readonly number[]; noDates: readonly string[] }; // weekday 0 = Sunday
  source: string;
}
export interface ResortDef {
  name: string;
  capGroup: CapGroupId;
  skiersOnly: boolean;
  corridor: Corridor;
  base: GeoPoint;
  summit: GeoPoint;
  nws: { base: NwsPoint; summit: NwsPoint };
  // NWS /stations/{ID}/observations/latest. alternates are not fetched for this resort.
  obs: {
    base: string;
    baseWind?: string;
    mid?: string;
    summit: string;
    summitGust?: string;
    alternates: readonly string[];
  };
  snotel: { primary: string; secondary?: string };
  exceedanceStation: string; // SNOTEL triplet behind the C.9 table
  uacZone: number;
  openMeteo: { lat: number; lon: number; elevM: number };
  snowArea: string; // which area of the resort report feeds the headline snow numbers
  links: { conditions: string; lifts?: string }; // also the attribution link
  liftHours: LiftHours;
  projectedOpen: string | null; // null = TBA; drives "Pre-season - projected open {date}"
}

const SLC = { zone: 'UTZ111', county: 'UTC035' } as const;
const NINE_TO_FOUR = [{ lifts: 'all', open: '09:00', close: '16:00' }] as const;

export const RESORTS = {
  alta: {
    name: 'Alta',
    capGroup: 'alta-snowbird',
    skiersOnly: true,
    corridor: 'lcc',
    base: { label: 'Wildcat Base Parking', lat: 40.5887, lon: -111.6401, ft: 8530 },
    summit: { label: 'Sugarloaf top', lat: 40.5672, lon: -111.6284, ft: 10556 },
    nws: { base: { grid: 'SLC/108,167', cellFt: 9800, ...SLC }, summit: { grid: 'SLC/108,166', cellFt: 9436, ...SLC } },
    obs: { base: 'AGD', summit: 'HDP', alternates: ['UTALC', 'ATH20'] },
    snotel: { primary: '1308:UT:SNTL' },
    exceedanceStation: '766:UT:SNTL',
    uacZone: 1738,
    openMeteo: { lat: 40.5672, lon: -111.6284, elevM: 3217 },
    snowArea: 'primary',
    links: { conditions: 'https://www.alta.com/lift-terrain-status' },
    liftHours: {
      day: [
        { lifts: ['Collins', 'Sunnyside'], open: '09:15', close: '16:30' },
        { lifts: ['Sugarloaf', 'Wildcat'], open: '09:15', close: '16:00' },
        { lifts: ['Supreme'], open: '09:15', close: '15:30' },
      ],
      source: 'live window.Alta.liftStatus',
    },
    projectedOpen: '2026-11-20',
  },
  snowbird: {
    name: 'Snowbird',
    capGroup: 'alta-snowbird',
    skiersOnly: false,
    corridor: 'lcc',
    base: { label: 'Snowbird Center / Entry 2', lat: 40.5816, lon: -111.6586, ft: 8131 },
    summit: { label: 'Tram top', lat: 40.5611, lon: -111.6452, ft: 10966 },
    nws: {
      base: { grid: 'SLC/107,166', cellFt: 9298, ...SLC },
      summit: { grid: 'SLC/108,165', cellFt: 10000, ...SLC },
    },
    obs: { base: 'SBDU1', baseWind: 'UTALC', summit: 'HDP', alternates: [] }, // + Snowbird's own sensors
    snotel: { primary: '766:UT:SNTL' },
    exceedanceStation: '766:UT:SNTL',
    uacZone: 1738,
    openMeteo: { lat: 40.5611, lon: -111.6452, elevM: 3342 },
    snowArea: 'primary',
    links: {
      conditions: 'https://www.snowbird.com/the-mountain/mountain-report/', // redirects; summer report off-season
      lifts: 'https://www.snowbird.com/the-mountain/mountain-report/lift-trail-report/',
    },
    liftHours: {
      day: [
        { lifts: ['Tram'], open: '09:00', close: '15:45' },
        { lifts: 'all', open: '09:00', close: '16:00' },
        { lifts: ['Chickadee'], open: '09:00', close: '17:00' },
      ],
      source: 'historic (26/27 unpublished); live lifts[].hours wins',
    },
    projectedOpen: '2026-11-27',
  },
  brighton: {
    name: 'Brighton',
    capGroup: 'brighton',
    skiersOnly: false,
    corridor: 'bcc',
    base: { label: 'Brighton base lot', lat: 40.5989, lon: -111.5846, ft: 8759 },
    summit: { label: 'Great Western top', lat: 40.5926, lon: -111.5616, ft: 10449 },
    nws: { base: { grid: 'SLC/110,167', cellFt: 8757, ...SLC }, summit: { grid: 'SLC/111,166', cellFt: 9698, ...SLC } },
    obs: { base: 'UTBTN', summit: 'BRW', alternates: ['PC056'] },
    snotel: { primary: '366:UT:SNTL' },
    exceedanceStation: '366:UT:SNTL',
    uacZone: 1738,
    openMeteo: { lat: 40.5926, lon: -111.5616, elevM: 3185 },
    snowArea: 'location[0]',
    links: { conditions: 'https://www.brightonresort.com/conditions' },
    liftHours: {
      day: NINE_TO_FOUR, // not re-verified
      night: {
        lifts: ['Explorer', 'Majestic', 'Crest 6', 'Milly Express', 'Snake Creek'],
        open: '16:00',
        close: '21:00',
        noWeekdays: [2], // Wed-Mon only
        noDates: ['2026-12-24', '2026-12-25', '2026-12-31'],
      },
      source: 'resort page',
    },
    projectedOpen: null,
  },
  solitude: {
    name: 'Solitude',
    capGroup: 'solitude',
    skiersOnly: false,
    corridor: 'bcc',
    base: { label: 'Moonbeam lot', lat: 40.6243, lon: -111.5987, ft: 8078 },
    summit: { label: 'Summit Express top', lat: 40.5989, lon: -111.6064, ft: 10010 },
    nws: {
      base: { grid: 'SLC/110,168', cellFt: 8832, ...SLC },
      summit: { grid: 'SLC/109,167', cellFt: 10108, ...SLC },
    },
    obs: { base: 'PC056', summit: 'BRW', alternates: ['UTBTN'] }, // both are proxies
    snotel: { primary: '628:UT:SNTL', secondary: '366:UT:SNTL' },
    exceedanceStation: '628:UT:SNTL',
    uacZone: 1738,
    openMeteo: { lat: 40.5989, lon: -111.6064, elevM: 3051 },
    snowArea: 'MidMountainArea',
    links: { conditions: 'https://www.solitudemountain.com/mountain-and-village/webcams' },
    liftHours: {
      day: [
        { lifts: ['Apex', 'Moonbeam', 'Link'], open: '08:00', close: '16:00' },
        { lifts: ['Powderhorn II', 'Sunrise', 'Eagle'], open: '09:00', close: '16:00' },
        { lifts: ['Summit', 'Honeycomb Return'], open: '09:00', close: '15:30' },
      ],
      early: { lifts: 'all', open: '09:00', close: '16:00' }, // before mid-December
      source: 'resort page',
    },
    projectedOpen: '2026-11-20',
  },
  'deer-valley': {
    name: 'Deer Valley',
    capGroup: 'deer-valley',
    skiersOnly: true,
    corridor: 'parleys',
    base: { label: 'Snow Park lot', lat: 40.6404, lon: -111.4786, ft: 7157 },
    summit: { label: 'Empire Express top', lat: 40.6124, lon: -111.5275, ft: 9552 },
    nws: {
      base: { grid: 'SLC/114,168', cellFt: 7454, zone: 'UTZ108', county: 'UTC043' },
      summit: { grid: 'SLC/112,167', cellFt: 9406, zone: 'UTZ111', county: 'UTC043' },
    },
    obs: { base: 'DVE', summit: 'DVP', summitGust: 'EMPUT', alternates: ['DVB'] },
    snotel: { primary: '814:UT:SNTL' },
    exceedanceStation: '814:UT:SNTL',
    uacZone: 1738,
    openMeteo: { lat: 40.6124, lon: -111.5275, elevM: 2911 },
    snowArea: 'MidMountainArea', // Summit is stored too
    links: { conditions: 'https://www.deervalley.com/explore-the-mountain/webcams' },
    liftHours: { day: NINE_TO_FOUR, source: 'FAQ' },
    projectedOpen: '2026-12-05',
  },
  snowbasin: {
    name: 'Snowbasin',
    capGroup: 'snowbasin',
    skiersOnly: false,
    corridor: 'snowbasin',
    base: { label: "Earl's Lodge lots", lat: 41.2172, lon: -111.8571, ft: 6383 },
    summit: { label: 'Allen Peak Tram top', lat: 41.2048, lon: -111.8843, ft: 9366 },
    nws: {
      base: { grid: 'SLC/104,196', cellFt: 6352, zone: 'UTZ110', county: 'UTC057' },
      summit: { grid: 'SLC/103,195', cellFt: 8599, zone: 'UTZ110', county: 'UTC057' },
    },
    obs: { base: 'SBE', mid: 'SWI', summit: 'OGP', alternates: [] },
    snotel: { primary: '332:UT:SNTL', secondary: '1300:UT:SNTL' }, // regional proxies
    exceedanceStation: '332:UT:SNTL',
    uacZone: 1737,
    openMeteo: { lat: 41.2048, lon: -111.8843, elevM: 2855 },
    snowArea: 'Snow Report block',
    links: { conditions: 'https://www.snowbasin.com/the-mountain/mountain-report/' },
    liftHours: { day: NINE_TO_FOUR, source: 'FAQ' },
    projectedOpen: '2026-11-27',
  },
} as const satisfies Record<ResortId, ResortDef>;

// Canonical order (= Open-Meteo response index); config.test.ts asserts it equals the RESORTS key order.
export const RESORT_IDS = ['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley', 'snowbasin'] as const;

// Appendix C.3. Timestamps are PST (UTC-8): parse with pstToUtc.
export const SNOTEL = {
  '1308:UT:SNTL': { name: 'Atwater', elevFt: 8750, median: false },
  '766:UT:SNTL': { name: 'Snowbird', elevFt: 9170, median: true },
  '366:UT:SNTL': { name: 'Brighton', elevFt: 8790, median: true },
  '628:UT:SNTL': { name: 'Mill-D North', elevFt: 8940, median: true },
  '814:UT:SNTL': { name: 'Thaynes Canyon', elevFt: 9260, median: true },
  '332:UT:SNTL': { name: 'Ben Lomond Peak', elevFt: 7690, median: true }, // Snowbasin proxy, 19 km
  '1300:UT:SNTL': { name: 'Powder Mountain', elevFt: 8490, median: false },
} as const satisfies Record<string, { name: string; elevFt: number; median: boolean }>;

// Appendix C.4.
export const UAC_ZONES = {
  1738: { name: 'Salt Lake', url: 'https://utahavalanchecenter.org/forecast/salt-lake' },
  1737: { name: 'Ogden', url: 'https://utahavalanchecenter.org/forecast/ogden' },
} as const satisfies Record<number, { name: string; url: string }>;

// NAC danger colors (C.4). The badge always shows the danger text too. Level 5 is a fallback (never observed).
export const NAC_LEVELS = [
  { level: -1, danger: 'no rating', color: '#888888', fontColor: '#ffffff' },
  { level: 1, danger: 'low', color: '#55b64f', fontColor: '#ffffff' },
  { level: 2, danger: 'moderate', color: '#f4e500', fontColor: '#141B21' },
  { level: 3, danger: 'considerable', color: '#ff9933', fontColor: '#ffffff' },
  { level: 4, danger: 'high', color: '#e32321', fontColor: '#ffffff' },
  { level: 5, danger: 'extreme', color: '#000000', fontColor: '#ffffff' },
] as const satisfies readonly { level: number; danger: string; color: string; fontColor: string }[];
