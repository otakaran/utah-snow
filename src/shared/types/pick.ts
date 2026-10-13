// "Where to ski today" pick input and output (spec §10.2-10.3). Imported through src/shared/types.ts, never directly.
import type { BaseId } from '../../../config/bases.ts';
import type { Units } from '../units.ts';
import type { CapGroupId, ResortId, TrackerResort } from './resort.ts';
import type { Snapshot } from './snapshot.ts';

export type SkiMode = 'ski' | 'board' | 'unknown';
export type BookingKind = 'dv-lift' | 'alta-parking' | 'brighton-parking' | 'solitude-parking' | 'snowbird-parking';

/** The tracker fields the pick reads (GET /api/tracker); deleted people are absent. */
export interface PickTracker {
  people: readonly { id: string; name: string; mode: SkiMode }[];
  days: readonly { personId: string; date: string; resortId: TrackerResort; status: 'planned' | 'skied' }[];
  /** personId '*' = car-level (parking); a personId for 'dv-lift'. Absent = nothing booked. */
  bookings?: readonly { date: string; kind: BookingKind; personId: string }[];
}

export type PickScope = 'crew' | 'me';
export type PickMode = 'today' | 'tomorrow' | 'preview' | 'post';
export type Tier = 'deep' | 'good' | 'soft' | 'quiet';

export interface PickArgs {
  snap: Snapshot;
  tracker: PickTracker;
  nowMs: number; // Date.now() + server skew
  scope: PickScope;
  /** Who is going (crew) or [me]. Unknown ids are ignored; none left = one virtual skier with every day unused. */
  memberIds: readonly string[];
  /** Preset id or custom point; default cottonwood-heights. Only its longitude matters (route corridors). */
  base?: BaseId | { lat: number; lon: number };
  /** Free-flow minutes per resort (matrix or /api/drive); default the preset's DRIVE row. */
  drive?: Partial<Record<ResortId, number>>;
  /** Live sign delay (§4.6), added in 'today' mode only. */
  liveDelayMin?: Partial<Record<ResortId, number>>;
  skiFraction?: number; // utahsnow.skiFraction; default STRATEGY.skiDayFraction
  units?: Units; // reason text only; default imperial
}

export interface PickMember {
  id: string;
  name: string;
  mode: SkiMode;
}

export interface DayCost {
  group: CapGroupId;
  spends: number; // capped days this pick charges each member: 1, or 0 for Solitude
  before: number | null; // remaining before the target day (crew min in crew scope); null = unlimited
  threshold: number | null; // save-threshold in inches; null for Solitude
}

/** Snow behind `eff`: overnight, the rest of the 24 h, and the daytime forecast (raw inches, before weights). */
export interface PickFresh {
  overnightIn: number;
  extraIn: number;
  dayIn: number;
  source: 'report' | 'snotel' | 'forecast' | 'none';
  label: string; // 'resort report 6:05 AM', 'SNOTEL Atwater', 'NWS forecast issued 4:12 AM', 'no data'
}

export interface RankedResort {
  resort: ResortId;
  net: number; // quality + day term - penalties
  eff: number; // effective inches, compared with the save-thresholds
  quality: number; // POWDER_MULT x eff
  cls: 0 | 1 | 2; // 0 free (Solitude, use-it-or-lose-it), 1 spends a scarce day, 2 saving the day
  driveMin: number;
  dayCost: DayCost;
  fresh: PickFresh;
  reasons: string[];
}

export interface GroupThreshold {
  remaining: number | null; // null = unlimited
  threshold: number; // inches; 0 = free (Solitude or use-it-or-lose-it)
  expiringFrom: string | null; // first date the group turns use-it-or-lose-it; null when unlimited or empty
}

export interface PickSourceRow {
  source: string;
  status: 'green' | 'amber' | 'red' | 'grey'; // freshness badge (§5.8)
  ageMin: number | null;
}

export interface PickResult {
  mode: PickMode;
  date: string; // target local date
  scope: PickScope;
  members: PickMember[];
  pick: ResortId | null;
  tier: Tier | null;
  lowValue: boolean; // the pick spends a day below its save-threshold: 'consider a rest day'
  ranked: RankedResort[]; // [pick, ...the rest by net desc]
  excluded: { resort: ResortId; reasons: string[] }[];
  thresholds: Partial<Record<CapGroupId, GroupThreshold>>;
  divergences: { personId: string; name: string; resort: ResortId; gain: number }[];
  actions: { label: string; url: string }[];
  inputs: PickSourceRow[];
}
