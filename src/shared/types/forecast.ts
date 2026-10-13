// NWS, avalanche, SNOTEL and station shapes (spec §5.1). Imported through src/shared/types.ts, never directly.
import type { ResortId } from './resort.ts';

export interface NwsDay {
  date: string;
  snowIn: number;
  snowDayIn: number; // 06-18
  snowNightIn: number; // 18-06
  qpfIn: number;
  snowLevelMinFt: number | null;
  snowLevelMaxFt: number | null;
  gustMaxMph: number | null;
  windMaxMph: number | null;
  tMinF: number | null;
  tMaxF: number | null;
  popMax: number | null;
}

export interface PointForecast {
  resortId: ResortId;
  point: 'base' | 'summit';
  grid: string;
  gridElevFt: number;
  trueElevFt: number;
  days: NwsDay[];
  updateTime: string;
  // D-1 16:00 -> D 08:00 local (§5.7)
  overnight: { from: string; to: string; snowIn: number; coverage: 'full' | 'frozen' | 'partial'; issuedAt: string };
  todayDaytimeSnowIn: number; // 08-16 today
  tonightSnowIn: number; // 16 today -> 08 tomorrow
  tomorrowDaytimeSnowIn: number;
  // keyed by local date D, <= 3 dates; hourlyIn = 16 h: D-1 16:00 ... D 07:00
  frozen: Record<string, { hourlyIn: number[]; updateTime: string }>;
}

export interface Afd {
  id: string;
  issuedAt: string;
  keyMessages: string | null;
  url: string;
}

export interface NwsAlert {
  event: string;
  severity: string;
  headline: string;
  onset: string | null;
  ends: string | null;
  zones: string[];
}

export interface AvalancheZone {
  zoneId: number;
  name: string;
  danger: string;
  level: number; // -1..5
  color: string;
  fontColor: string;
  travelAdvice: string;
  link: string;
  validFrom: string | null;
  validTo: string | null;
  offSeason: boolean;
}

export interface SnotelSeries {
  triplet: string;
  name: string;
  elevFt: number;
  snwdIn: number | null;
  sweIn: number | null;
  tempF: number | null;
  snwdChange24In: number | null;
  snwdSince16In: number | null; // §5.7
  at: string | null;
}

export interface ObsNow {
  station: string;
  tempF: number | null;
  windMph: number | null;
  gustMph: number | null;
  dirDeg: number | null;
  at: string | null;
}
