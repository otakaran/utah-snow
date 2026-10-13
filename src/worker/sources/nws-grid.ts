// NWS gridpoint forecast, one job per resort point (spec §5.4, §5.7): `nws-grid:{resort}:{point}` writes
// `nws:{resort}:{point}`. GET https://api.weather.gov/gridpoints/SLC/{x},{y}; NWS answers 403 without a User-Agent
// (fetchx always sends one). Values are converted to imperial here; trueElevFt rides along so the client compares
// snow level against the true elevation, not the grid cell's (§5.7 step 6).
import { RESORT_IDS, RESORTS } from '../../../config/resorts.ts';
import { addDays, isoToMs, localDate } from '../../shared/time.ts';
import type { PointForecast, ResortId } from '../../shared/types.ts';
import {
  bucketDays,
  expand,
  type Field,
  type GridValue,
  type Interval,
  intervals,
  windowHours,
  windowSnowIn,
} from './nws-grid/bucket.ts';
import { overnightFor, prevFrozen, updateFrozen } from './nws-grid/overnight.ts';
import { type FetchCtx, type ParseCtx, type Source, ValidationError } from './types.ts';

export type GridPointId = 'base' | 'summit';
export const NWS_API = 'https://api.weather.gov';
const STALE_AFTER_MIN = 180;
const MAX_AGE_MS = 48 * 3_600_000; // an updateTime older than this means NWS stopped refreshing the grid
const HOUR = 3_600_000;
const FT_PER_M = 3.28084;

// [our field, NWS property, required uom, plausible value range per interval in that uom]
const FIELDS: readonly [Field, string, string, number, number][] = [
  ['snow', 'snowfallAmount', 'wmoUnit:mm', 0, 1000],
  ['qpf', 'quantitativePrecipitation', 'wmoUnit:mm', 0, 500],
  ['snowLevel', 'snowLevel', 'wmoUnit:m', -500, 7000],
  ['gust', 'windGust', 'wmoUnit:km_h-1', 0, 400],
  ['wind', 'windSpeed', 'wmoUnit:km_h-1', 0, 400],
  ['temp', 'temperature', 'wmoUnit:degC', -60, 50],
  ['pop', 'probabilityOfPrecipitation', 'wmoUnit:percent', 0, 100],
];

interface GridMeta {
  resortId: ResortId;
  point: GridPointId;
  grid: string;
  cellFt: number;
  trueElevFt: number;
  row: string;
}

type Props = Record<string, unknown>;
const fieldOf = (p: Props, key: string) => p[key] as { uom?: unknown; values?: unknown } | undefined;

/** Readable intervals of every field. Snow is mandatory; other fields drop out on a unit change. */
function readFields(p: Props): Partial<Record<Field, Interval[]>> {
  const out: Partial<Record<Field, Interval[]>> = {};
  for (const [field, key, uom, lo, hi] of FIELDS) {
    const f = fieldOf(p, key);
    const ok = f?.uom === uom && Array.isArray(f.values);
    if (!ok) {
      if (field === 'snow') throw new ValidationError(`nws-grid: ${key} missing or not ${uom}`);
      continue;
    }
    const list = intervals(f.values as GridValue[]);
    if (field === 'snow') {
      if (list.length === 0) throw new ValidationError('nws-grid: snowfallAmount has no values');
      if (list.some((iv) => iv.value < lo || iv.value > hi)) throw new ValidationError('nws-grid: implausible snow');
      out[field] = list;
    } else out[field] = list.filter((iv) => iv.value >= lo && iv.value <= hi);
  }
  return out;
}

/** Pure parse of one gridpoint payload into the PointForecast row. */
export function parseGrid(raw: unknown, ctx: ParseCtx, m: GridMeta): PointForecast {
  const p = (raw as { properties?: unknown } | null)?.properties as Props | undefined;
  if (!p || typeof p !== 'object') throw new ValidationError('nws-grid: no properties');
  const updateTime = typeof p.updateTime === 'string' ? p.updateTime : '';
  const updMs = isoToMs(updateTime);
  if (updMs === null) throw new ValidationError('nws-grid: bad updateTime');
  if (ctx.now - updMs > MAX_AGE_MS) throw new ValidationError(`nws-grid: grid not updated since ${updateTime}`);
  const g = expand(readFields(p));
  if (!g) throw new ValidationError('nws-grid: empty or oversized time span');
  if ((g.h0 + g.n) * HOUR <= ctx.now) throw new ValidationError('nws-grid: grid ends before now');

  const today = localDate(ctx.now);
  const tomorrow = addDays(today, 1);
  const frozen = updateFrozen(g, today, updateTime, prevFrozen(ctx.prev[m.row]));
  const elev = fieldOf(p, 'elevation') as { unitCode?: unknown; value?: unknown } | undefined;
  const elevM = elev?.unitCode === 'wmoUnit:m' && typeof elev.value === 'number' ? elev.value : null;
  return {
    resortId: m.resortId,
    point: m.point,
    grid: m.grid,
    gridElevFt: elevM === null ? m.cellFt : Math.round(elevM * FT_PER_M),
    trueElevFt: m.trueElevFt,
    days: bucketDays(g),
    updateTime,
    overnight: overnightFor(g, today, frozen, updateTime),
    todayDaytimeSnowIn: windowSnowIn(g, windowHours(today, '08:00', today, '16:00')),
    tonightSnowIn: windowSnowIn(g, windowHours(today, '16:00', tomorrow, '08:00')),
    tomorrowDaytimeSnowIn: windowSnowIn(g, windowHours(tomorrow, '08:00', tomorrow, '16:00')),
    frozen,
  };
}

/** The adapter for one resort point. */
export function nwsGrid(resortId: ResortId, point: GridPointId): Source<unknown> {
  const def = RESORTS[resortId];
  const nws = def.nws[point];
  const row = `nws:${resortId}:${point}`;
  const url = `${NWS_API}/gridpoints/${nws.grid}`;
  const meta: GridMeta = { resortId, point, grid: nws.grid, cellFt: nws.cellFt, trueElevFt: def[point].ft, row };
  return {
    id: `nws-grid:${resortId}:${point}`,
    staleAfterMin: STALE_AFTER_MIN,
    rows: [row],
    maxSubrequests: () => 1, // one GET, redirects not followed
    probes: [{ hostId: 'nws-grid', url }], // same hostId on every instance: the probe hits one grid
    async fetch(ctx: FetchCtx): Promise<unknown> {
      const res = await ctx.fetch(url, { headers: { Accept: 'application/geo+json' }, follow: false });
      if (res.status !== 200) throw new Error(`nws-grid: HTTP ${res.status} ${url}`);
      return JSON.parse(res.data as string) as unknown;
    },
    parse: (raw: unknown, ctx: ParseCtx) => ({ rows: { [row]: parseGrid(raw, ctx, meta) } }),
  };
}

/** All 12 instances in RESORT_IDS order, base before summit. */
export const NWS_GRID_SOURCES: readonly Source<unknown>[] = RESORT_IDS.flatMap((r) =>
  (['base', 'summit'] as const).map((p) => nwsGrid(r, p)),
);
