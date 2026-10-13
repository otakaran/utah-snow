// resort:snowbird — Snowbird DOR API (spec §5.4, §5.5, Appendix B snowbird-report / snowbird-dor).
// api.snowbird.com answers 500 to any foreign Origin; fetchx never sends one. No auth, no gzip, weak ETags.
// Required: snow report + lifts (a failure fails the job). Optional: sensors, terrains, and trails (slot 1 only,
// If-None-Match); when one of those fails, is skipped or answers 304, the last-good block is copied forward.
import type { ResortSnapshot } from '../../shared/types.ts';
import { asObj, asStr, gateList, liftList, liftSummary, seasonState, trailCounts } from './snowbird/lifts.ts';
import { readReport, snowNumbers } from './snowbird/report.ts';
import { emptyWeather, weatherNow } from './snowbird/weather.ts';
import { type FetchCtx, type FetchOpts, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

const ROW = 'resort:snowbird';
const BASE = 'https://api.snowbird.com/api/v1/dor';
export const SNOWBIRD_URLS = {
  report: `${BASE}/drupal/snow-reports?sort=date&direction=desc&limit=1`,
  lifts: `${BASE}/drupal/lifts`,
  sensors: `${BASE}/sensors`,
  terrains: `${BASE}/drupal/terrains`,
  trails: `${BASE}/drupal/trails`, // ~150 KB; hourly, behind If-None-Match
} as const;
export const TRAILS_SLOT = 1; // §5.3: "+1 for trails in slot 1"
const MIN_LIFTS = 5; // the API lists 14; fewer means a broken payload
// follow:false keeps the worst case exact (no redirect hops); a 3xx body then fails JSON.parse and the job errors.
const JSON_GET: FetchOpts = { headers: { Accept: 'application/json' }, body: 'json', follow: false };

export interface SnowbirdRaw {
  report: unknown; // snow-reports array (limit=1)
  lifts: unknown;
  sensors?: unknown; // null/absent: the optional call failed
  terrains?: unknown;
  trails?: unknown; // null/absent: not this slot, 304, or failed
  trailsEtag?: string | null; // ETag of a fresh 200 trails response
}

/** The stored row: a ResortSnapshot plus the trails ETag that the next slot-1 tick sends as If-None-Match. */
export type SnowbirdRow = ResortSnapshot & { trailsEtag: string | null };

type Prev = Partial<Pick<SnowbirdRow, 'seasonOpenedAt' | 'weather' | 'trails' | 'gates' | 'trailsEtag'>>;

function prevRow(prev: ParseCtx['prev']): Prev {
  const p = asObj(prev[ROW]);
  if (!p) return {};
  return {
    seasonOpenedAt: asStr(p.seasonOpenedAt),
    weather: asObj(p.weather) ? (p.weather as Prev['weather']) : undefined,
    trails: asObj(p.trails) ? (p.trails as Prev['trails']) : undefined,
    gates: Array.isArray(p.gates) ? (p.gates as Prev['gates']) : undefined,
    trailsEtag: asStr(p.trailsEtag),
  };
}

async function optional(ctx: FetchCtx, url: string): Promise<unknown> {
  try {
    return (await ctx.fetch(url, JSON_GET)).data;
  } catch {
    return null;
  }
}

async function fetchTrails(ctx: FetchCtx): Promise<Pick<SnowbirdRaw, 'trails' | 'trailsEtag'>> {
  if (ctx.slot !== TRAILS_SLOT) return { trails: null, trailsEtag: null };
  const etag = prevRow(ctx.prev).trailsEtag;
  // fetch's cache:'no-store' appends `Cache-Control: no-cache` unless one is set, and Express then never answers
  // 304 (verified on workerd and against the API); an explicit max-age=0 keeps If-None-Match working.
  const headers: Record<string, string> = { Accept: 'application/json', 'Cache-Control': 'max-age=0' };
  if (etag) headers['If-None-Match'] = etag;
  try {
    const res = await ctx.fetch<string>(SNOWBIRD_URLS.trails, { headers, follow: false, timeoutMs: 10_000 });
    if (res.status !== 200) return { trails: null, trailsEtag: null }; // 304: unchanged
    return { trails: JSON.parse(res.data) as unknown, trailsEtag: res.headers.get('etag') };
  } catch {
    return { trails: null, trailsEtag: null };
  }
}

function readLifts(raw: unknown) {
  const list = Array.isArray(raw) ? liftList(raw) : [];
  if (list.length < MIN_LIFTS) throw new ValidationError(`snowbird: lifts payload has ${list.length} named lifts`);
  return list;
}

export function parseSnowbird(raw: SnowbirdRaw, ctx: ParseCtx): SnowbirdRow {
  const r0 = readReport(raw.report);
  const lifts = readLifts(raw.lifts);
  const prev = prevRow(ctx.prev);
  const { season, seasonOpenedAt } = seasonState(lifts, prev.seasonOpenedAt ?? null, ctx.now);
  const trails = raw.trails == null ? null : trailCounts(raw.trails);
  return {
    id: 'snowbird',
    season,
    seasonOpenedAt,
    operatingToday: season !== 'preseason',
    snow: snowNumbers(r0, ctx.now, season === 'preseason'),
    weather: weatherNow(raw.sensors, ctx.now) ?? prev.weather ?? emptyWeather(),
    lifts: liftSummary(lifts),
    trails: trails ?? prev.trails ?? { open: null, total: null, groomed: null },
    trailsEtag: trails ? (raw.trailsEtag ?? null) : (prev.trailsEtag ?? null),
    gates: gateList(raw.terrains) ?? prev.gates ?? [],
    parking: { state: 'unknown', raw: null }, // Snowbird parking is read by the roads job (§5.4)
    alerts: [], // Snowbird /alerts is read by the roads job
  };
}

export const snowbird: Source<SnowbirdRaw> = {
  id: ROW,
  staleAfterMin: 40,
  rows: [ROW],
  maxSubrequests: (ctx) => (ctx.slot === TRAILS_SLOT ? 5 : 4),
  probes: [{ hostId: 'snowbird', url: SNOWBIRD_URLS.report }],
  async fetch(ctx) {
    const [report, lifts, sensors, terrains, trails] = await Promise.all([
      ctx.fetch(SNOWBIRD_URLS.report, JSON_GET).then((r) => r.data),
      ctx.fetch(SNOWBIRD_URLS.lifts, JSON_GET).then((r) => r.data),
      optional(ctx, SNOWBIRD_URLS.sensors),
      optional(ctx, SNOWBIRD_URLS.terrains),
      fetchTrails(ctx),
    ]);
    return { report, lifts, sensors, terrains, ...trails };
  },
  parse(raw, ctx): Output {
    return { rows: { [ROW]: parseSnowbird(raw, ctx) } };
  },
};
