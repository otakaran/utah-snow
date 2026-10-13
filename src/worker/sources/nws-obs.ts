// NWS station observations (spec §5.4 'nws-obs', Appendix C.2). Job id 'nws-obs', row 'obs'.
// One GET per station (13), all through fetchx; a failed station keeps its last-good entry for up to 6 h.
// Stored imperial: °C -> °F, km/h -> mph (rounded to 0.1). Values flagged X/B/Q by NWS QC are dropped.
import { RESORTS, type ResortDef } from '../../../config/resorts.ts';
import { num, range, round1 } from '../../shared/num.ts';
import { HOUR, isoToMs, isoUtc } from '../../shared/time.ts';
import type { ObsNow } from '../../shared/types.ts';
import { cToF, kmhToMph } from '../../shared/units.ts';
import { type FetchCtx, getJson, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

const ROW = 'obs';
const BASE_URL = 'https://api.weather.gov/stations/';
const ROLES = ['base', 'baseWind', 'mid', 'summit', 'summitGust'] as const; // `alternates` are never fetched
const FRESH_MS = 3 * HOUR; // gate: at least one station must report an observation this recent
const KEEP_PREV_MS = 6 * HOUR; // a failed station's last-good entry survives this long
const REJECTED_QC = /^[XBQ]$/; // MADIS QC: X rejected, B subjective bad, Q questioned

/** The fetched stations (13, C.2): every obs role in config/resorts.ts, deduped, in resort order. */
export const OBS_STATIONS: readonly string[] = [
  ...new Set(
    Object.values(RESORTS as Record<string, ResortDef>).flatMap((r) =>
      ROLES.map((k) => r.obs[k]).filter((s): s is string => typeof s === 'string' && s !== ''),
    ),
  ),
];

export const obsUrl = (station: string): string => `${BASE_URL}${station}/observations/latest`;

/** Raw = station id -> parsed /observations/latest body; failed stations are absent. */
export type ObsRaw = Record<string, unknown>;

type Quantity = { unitCode?: unknown; value?: unknown; qualityControl?: unknown };
type Kind = 'temp' | 'speed' | 'deg';

/** One NWS quantity in imperial units, or null (missing, QC-rejected, unknown unit, implausible). */
function quantity(q: unknown, kind: Kind): number | null {
  if (!q || typeof q !== 'object') return null;
  const { unitCode, value, qualityControl } = q as Quantity;
  if (typeof qualityControl === 'string' && REJECTED_QC.test(qualityControl)) return null;
  const v = typeof value === 'number' ? num(value) : null;
  if (v === null) return null;
  const unit = typeof unitCode === 'string' ? unitCode.replace(/^wmoUnit:/, '') : '';
  if (kind === 'temp') {
    const f = unit === 'degC' ? cToF(v) : unit === 'degF' ? v : null;
    return f === null ? null : range(round1(f), -60, 90);
  }
  if (kind === 'speed') {
    const mph = unit === 'km_h-1' ? kmhToMph(v) : unit === 'm_s-1' ? v * 2.236936 : null;
    return mph === null ? null : range(round1(mph), 0, 200);
  }
  return unit === 'degree_(angle)' ? range(round1(v), 0, 360) : null;
}

/** One station's latest observation, or null when the body is not an observation for this station. */
export function readObs(station: string, body: unknown): ObsNow | null {
  const p = body && typeof body === 'object' ? (body as { properties?: unknown }).properties : null;
  if (!p || typeof p !== 'object') return null;
  const props = p as Record<string, unknown>;
  if (typeof props.stationId === 'string' && props.stationId.toUpperCase() !== station) return null;
  const ms = isoToMs(typeof props.timestamp === 'string' ? props.timestamp : null);
  if (ms === null) return null;
  return {
    station,
    tempF: quantity(props.temperature, 'temp'),
    windMph: quantity(props.windSpeed, 'speed'),
    gustMph: quantity(props.windGust, 'speed'),
    dirDeg: quantity(props.windDirection, 'deg'),
    at: isoUtc(ms),
  };
}

function prevEntries(prev: unknown, now: number): Record<string, ObsNow> {
  if (!prev || typeof prev !== 'object' || Array.isArray(prev)) return {};
  const out: Record<string, ObsNow> = {};
  for (const [id, o] of Object.entries(prev as Record<string, ObsNow | null>)) {
    const at = isoToMs(o?.at);
    if (o && at !== null && now - at <= KEEP_PREV_MS) out[id] = o;
  }
  return out;
}

/** Pure: per-station bodies (+ last-good row) -> Record<station, ObsNow>. Throws when nothing fresh arrived. */
export function parseObs(raw: ObsRaw, ctx: ParseCtx): Record<string, ObsNow> {
  if (!raw || typeof raw !== 'object') throw new ValidationError('nws-obs: no station bodies');
  const prev = prevEntries(ctx.prev[ROW], ctx.now);
  const out: Record<string, ObsNow> = {};
  let fresh = 0;
  for (const id of OBS_STATIONS) {
    const o = readObs(id, raw[id]);
    if (o) {
      out[id] = o;
      const at = isoToMs(o.at) ?? 0;
      if (ctx.now - at <= FRESH_MS) fresh++;
    } else if (prev[id]) {
      out[id] = prev[id];
    }
  }
  if (fresh === 0) throw new ValidationError('nws-obs: no station reported in the last 3 h');
  return out;
}

export const nwsObs: Source<ObsRaw> = {
  id: 'nws-obs',
  staleAfterMin: 90,
  rows: [ROW],
  maxSubrequests: () => OBS_STATIONS.length, // 13 GETs; redirects are not followed
  probes: [{ hostId: 'nws-obs', url: obsUrl('HDP') }],
  async fetch(ctx: FetchCtx): Promise<ObsRaw> {
    const settled = await Promise.allSettled(OBS_STATIONS.map((id) => getJson(ctx, obsUrl(id), `nws-obs ${id}`)));
    const raw: ObsRaw = {};
    settled.forEach((s, i) => {
      const id = OBS_STATIONS[i];
      if (s.status === 'fulfilled' && id) raw[id] = s.value;
    });
    // Every station failed: surface the first error so the job is classed as error/blocked/deferred.
    const first = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (Object.keys(raw).length === 0 && first) throw first.reason;
    return raw;
  },
  parse(raw: ObsRaw, ctx: ParseCtx): Output {
    return { rows: { [ROW]: parseObs(raw, ctx) } };
  },
};
