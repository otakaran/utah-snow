// Source metadata, the /api/snapshot envelope and cam state (spec §5.1). Import via src/shared/types.ts.
import type { Afd, AvalancheZone, NwsAlert, ObsNow, PointForecast, SnotelSeries } from './forecast.ts';
import type { ResortId, ResortSnapshot } from './resort.ts';
import type { Corridor, RoadStatus } from './roads.ts';

export type SourceStatus = 'ok' | 'error' | 'blocked' | 'offseason'; // last real outcome; a deferred run never changes it

// No ageMin on the wire. Clients derive age and badge from okAt plus server time (§5.8),
// so a payload changes only when its data changes.
export interface Meta {
  source: string;
  fetchedAt: string | null; // last attempt, incl. deferred
  okAt: string | null;
  asOf: string | null;
  status: SourceStatus;
  error?: string; // 'deferred' or message, key= redacted
  failCount: number;
  staleAfterMin: number;
}

// Every source block.
export interface Block<T> {
  data: T | null;
  meta: Meta;
}

export interface Snapshot {
  v: 1;
  generatedAt: string; // MAX(source_state.fetched_at)
  trip: { start: string; end: string };
  resorts: Record<ResortId, Block<ResortSnapshot>>;
  forecast: Record<string, Block<PointForecast>>; // key `${resort}:${point}`
  afd: Block<Afd>;
  alerts: Block<NwsAlert[]>;
  avalanche: Block<AvalancheZone[]>;
  roads: Record<Corridor, Block<RoadStatus>>;
  snotel: Block<Record<string, SnotelSeries>>;
  obs: Block<Record<string, ObsNow>>;
  sources: Meta[];
}

export interface CamState {
  id: string;
  status: 'live' | 'ok' | 'stale' | 'offline' | 'unknown' | 'seasonal-off';
  online: boolean | null;
  asOf: string | null;
  still: { card: string; detail: string; wall: string };
  live: { type: 'hls'; url: string } | { type: 'youtube'; videoId: string } | { type: 'iframe'; url: string } | null;
  thumbKind?: 'live' | 'custom';
  timelapse: { provider: string; available: boolean };
}
