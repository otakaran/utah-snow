// Resort-side shapes (spec §5.1). Imported through src/shared/types.ts, never directly.
import type { RoadState } from './roads.ts';

export type ResortId = 'alta' | 'snowbird' | 'brighton' | 'solitude' | 'deer-valley' | 'snowbasin';
// 'alta-snowbird' = skied both on the same day: one day of the alta-snowbird cap group.
export type TrackerResort = ResortId | 'alta-snowbird';
export type CapGroupId = 'alta-snowbird' | 'brighton' | 'deer-valley' | 'snowbasin' | 'solitude';
export type LiftState = 'open' | 'hold' | 'scheduled' | 'closed' | 'unknown';

export interface SnowNumbers {
  overnightIn: number | null;
  new12hIn: number | null;
  new24hIn: number | null;
  new48hIn: number | null;
  new72hIn: number | null;
  new7dIn: number | null;
  stormTotalIn: number | null;
  seasonTotalIn: number | null;
  baseDepthIn: number | null;
  reportAt: string | null;
  reportIsToday: boolean;
  area: 'primary' | 'base' | 'mid' | 'summit';
  summit?: { overnightIn: number | null; new24hIn: number | null };
  morningOvernightIn?: { date: string; value: number } | null; // Alta only, §5.5
  surface?: string | null;
  text?: string | null; // tags stripped, <= 600 chars
}

export interface LiftStatus {
  id: string;
  name: string;
  state: LiftState;
  raw: string;
  area?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  note?: string | null;
  updatedAt?: string | null;
}

export interface Gate {
  name: string;
  state: LiftState;
  note?: string | null;
}

export interface WeatherNow {
  baseTempF: number | null;
  midTempF: number | null;
  summitTempF: number | null;
  summitWindMph: number | null;
  summitGustMph: number | null;
  windDir: string | null;
  sky: string | null;
  obsAt: string | null;
  src: string;
}

export interface ParkingNow {
  state: 'available' | 'filling' | 'full' | 'reservation-required' | 'closed' | 'unknown';
  raw: string | null;
  percentFull?: number | null;
  note?: string | null;
}

export interface ResortSnapshot {
  id: ResortId;
  season: 'preseason' | 'open' | 'closed-for-day' | 'unknown';
  seasonOpenedAt: string | null;
  operatingToday: boolean;
  snow: SnowNumbers;
  weather: WeatherNow;
  lifts: { open: number; hold: number; scheduled: number; total: number; list: LiftStatus[] };
  trails: { open: number | null; total: number | null; groomed: number | null };
  gates: Gate[];
  parking: ParkingNow;
  alerts: string[];
  roadHint?: { raw: string; state: RoadState };
}
