// Ikon pass rules and trip dates (spec §4.1). TRIP is the ONLY copy of the trip dates (America/Denver);
// migrations/0002_tracker.sql repeats them as literals and src/shared/config.test.ts asserts they match.
import type { CapGroupId, ResortId, TrackerResort } from '../src/shared/types.ts';

export interface CapGroupDef {
  cap: number | null; // null = unlimited
  resorts: readonly ResortId[];
  label: string;
}

export const TRIP = { start: '2026-12-27', end: '2027-01-31', days: 36 } as const;

export const CAP_GROUPS = {
  'alta-snowbird': { cap: 7, resorts: ['alta', 'snowbird'], label: 'Alta/Snowbird' }, // both on one day = 1 day
  brighton: { cap: 7, resorts: ['brighton'], label: 'Brighton' },
  'deer-valley': { cap: 7, resorts: ['deer-valley'], label: 'Deer Valley' },
  snowbasin: { cap: 7, resorts: ['snowbasin'], label: 'Snowbasin' },
  solitude: { cap: null, resorts: ['solitude'], label: 'Solitude' }, // unlimited
} as const satisfies Record<CapGroupId, CapGroupDef>;

export const SKIERS_ONLY = ['alta', 'deer-valley'] as const satisfies readonly ResortId[]; // tracker 'alta-snowbird' too

// 'alta-snowbird' = skied both on the same day -> 1 day of the alta-snowbird group
export const TRACKER_RESORTS = [
  'alta',
  'snowbird',
  'brighton',
  'solitude',
  'deer-valley',
  'snowbasin',
  'alta-snowbird',
] as const satisfies readonly TrackerResort[];

export const LIFT_RESERVATION = {
  'deer-valley': {
    book: 'https://account.ikonpass.com/en/login',
    cancelBy: '11:00',
    window: 'all 26/27 dates open now, first-come; same-day if space',
    noShow: '1st grace, 2nd warning, 3rd season suspension',
  },
} as const satisfies Partial<Record<ResortId, { book: string; cancelBy: string; window: string; noShow: string }>>;

export const NO_BLACKOUTS = true; // Full Ikon 26/27
