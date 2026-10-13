// NWS grid re-resolve (spec Appendix B `nws-points`, C.1): GET https://api.weather.gov/points/{lat},{lon} for the
// 12 resort points and the 5 base presets, compared with the grids/zones in config. Runs inside the maintenance job
// on Mondays at 12Z (config/schedule.ts MAINT). Writes `nws:points`; a non-empty `changes` is the alert.
import { BASES } from '../../../config/bases.ts';
import { RESORT_IDS, RESORTS } from '../../../config/resorts.ts';
import { MAINT } from '../../../config/schedule.ts';
import { DAY, HOUR, isoUtc } from '../../shared/time.ts';
import type { NwsPointChange, NwsPointResolved, NwsPointsRow } from '../../shared/types.ts';
import { type FetchCtx, type ParseCtx, type Source, ValidationError } from './types.ts';

const API = 'https://api.weather.gov';
const ROW = 'nws:points';
const STALE_AFTER_MIN = 8 * 24 * 60; // weekly job plus a day of slack

export interface NwsPointDef {
  id: string; // 'alta:base' ... or 'base:<BaseId>'
  lat: number;
  lon: number;
  grid: string; // expected 'SLC/x,y'
  zone: string;
  county: string | null; // presets carry no county in config
}
export interface NwsPointsRawItem {
  id: string;
  status: number; // 0 = the request itself failed
  body: unknown;
  error?: string;
}
export const NWS_POINTS: readonly NwsPointDef[] = [
  ...RESORT_IDS.flatMap((r) =>
    (['base', 'summit'] as const).map((p) => {
      const { grid, zone, county } = RESORTS[r].nws[p];
      return { id: `${r}:${p}`, lat: RESORTS[r][p].lat, lon: RESORTS[r][p].lon, grid, zone, county };
    }),
  ),
  ...Object.entries(BASES).map(([b, d]) => ({
    id: `base:${b}`,
    lat: d.lat,
    lon: d.lon,
    grid: d.grid,
    zone: d.zone,
    county: null,
  })),
];

// Four decimals: NWS answers 301 to more precise coordinates, and redirects are not followed.
export const pointUrl = (p: { lat: number; lon: number }) => `${API}/points/${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;

/** True in the maintenance tick that should run this job: Mondays at MAINT.mondayUtcHour UTC. */
export function nwsPointsDue(now: number): boolean {
  const weekday = (Math.floor(now / DAY) + 4) % 7; // 1970-01-01 was a Thursday; 1 = Monday
  return weekday === 1 && Math.floor(now / HOUR) % 24 === MAINT.mondayUtcHour;
}

const lastSeg = (v: unknown) => (typeof v === 'string' && /\/([A-Z]{2}[CZ]\d{3})$/.exec(v)?.[1]) || null;

function resolve(item: NwsPointsRawItem | undefined): Omit<NwsPointResolved, 'id'> | null {
  if (item?.status !== 200) return null;
  const p = (item.body as { properties?: Record<string, unknown> } | null)?.properties;
  const { gridId, gridX, gridY } = p ?? {};
  if (typeof gridId !== 'string' || !Number.isInteger(gridX) || !Number.isInteger(gridY)) return null;
  return { grid: `${gridId}/${gridX},${gridY}`, zone: lastSeg(p?.forecastZone), county: lastSeg(p?.county) };
}

/** Pure: resolved grids vs config. Throws ValidationError when fewer than half the points resolved. */
export function parsePoints(raw: unknown, ctx: ParseCtx): NwsPointsRow {
  if (!Array.isArray(raw)) throw new ValidationError('nws-points: raw is not a list');
  const byId = new Map((raw as NwsPointsRawItem[]).map((r) => [r?.id, r]));
  const points: NwsPointResolved[] = [];
  const changes: NwsPointChange[] = [];
  const failed: string[] = [];
  for (const def of NWS_POINTS) {
    const got = resolve(byId.get(def.id));
    if (!got) {
      failed.push(def.id);
      points.push({ id: def.id, grid: null, zone: null, county: null });
      continue;
    }
    points.push({ id: def.id, ...got });
    for (const field of ['grid', 'zone', 'county'] as const) {
      const expected = def[field];
      const actual = got[field] ?? '';
      if (expected !== null && actual !== expected) changes.push({ id: def.id, field, expected, actual });
    }
  }
  if (failed.length * 2 > NWS_POINTS.length) {
    throw new ValidationError(`nws-points: ${failed.length}/${NWS_POINTS.length} lookups failed`);
  }
  return { checkedAt: isoUtc(ctx.now), points, changes, failed };
}

export const nwsPoints: Source<unknown> = {
  id: 'nws-points',
  staleAfterMin: STALE_AFTER_MIN,
  rows: [ROW],
  maxSubrequests: () => NWS_POINTS.length, // 17 GETs, redirects not followed
  probes: [{ hostId: 'nws-points', url: pointUrl(RESORTS.alta.base) }],
  async fetch(ctx: FetchCtx): Promise<NwsPointsRawItem[]> {
    const opts = { headers: { Accept: 'application/geo+json' }, follow: false, allowStatus: true } as const;
    return Promise.all(
      NWS_POINTS.map(async (p): Promise<NwsPointsRawItem> => {
        try {
          const res = await ctx.fetch(pointUrl(p), opts);
          return { id: p.id, status: res.status, body: res.status === 200 ? JSON.parse(res.data as string) : null };
        } catch (err) {
          return { id: p.id, status: 0, body: null, error: err instanceof Error ? err.name : 'Error' };
        }
      }),
    );
  },
  parse: (raw: unknown, ctx: ParseCtx) => ({ rows: { [ROW]: parsePoints(raw, ctx) } }),
};
