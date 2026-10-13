// GET /api/drive?lat=&lon= (spec §7, §4.6): OSRM drive times from a custom base to the six resorts' base lots.
// lat/lon are rounded to 3 dp; outside CUSTOM_BOUNDS -> 422 outside-wasatch. D1 drive_cache answers for 30 days (a hit
// is free); a miss bumps the global `drive:{YYYYMMDD}` counter (Denver day) and above 20 returns 429 until Denver
// midnight. Then six sequential OSRM calls 1.1 s apart (the demo server allows 1 req/s): Brighton and Solitude via the
// BCC mouth (no geometry), the rest with full geometry and a warning when it passes Guardsman Pass. A failed resort
// is omitted (`partial: true`, never cached). Only a complete 200 is `public, max-age=86400`; no caches.default.
import { BCC_MOUTH, GUARDSMAN, OSRM, VIA_BCC_MOUTH } from '../../../config/bases.ts';
import { RESORT_IDS, RESORTS } from '../../../config/resorts.ts';
import { driveKey, type Point, passesNear, wasatchPoint } from '../../shared/geo.ts';
import { isoUtc } from '../../shared/time.ts';
import type { DriveLeg, DriveResponse, ResortId } from '../../shared/types.ts';
import { apiError, JSON_TYPE, json } from '../http.ts';
import { createFetchx } from '../lib/fetchx.ts';
import { errorText, logLine } from '../lib/log.ts';
import { bumpDriveMisses } from '../store/counters.ts';
import { readDrive, writeDrive } from '../store/drive.ts';
import { rateLimited } from './post-guard.ts';

/** Test seams: the OSRM fetch and the wait between calls. */
export interface DriveDeps {
  fetchImpl?: typeof fetch;
  delay?: (ms: number) => Promise<void>;
}

interface OsrmBody {
  code?: string;
  routes?: { duration?: number; distance?: number; geometry?: { coordinates?: number[][] } }[];
}

const COMPLETE_CACHE = 'public, max-age=86400';
const DEG = /^-?\d{1,3}(?:\.\d{1,12})?$/;
const BCC: readonly ResortId[] = VIA_BCC_MOUTH;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const lonLat = (p: Point): string => `${p.lon},${p.lat}`;

function osrmUrl(from: Point, r: ResortId): string {
  const to = RESORTS[r].base;
  return BCC.includes(r)
    ? `${OSRM.route}${lonLat(from)};${lonLat(BCC_MOUTH)};${lonLat(to)}?overview=false`
    : `${OSRM.route}${lonLat(from)};${lonLat(to)}?overview=full&geometries=geojson`;
}

/** One resort's leg from an OSRM route body, or null when it holds no usable route. */
function legOf(body: OsrmBody, r: ResortId): DriveLeg | null {
  const route = body.code === 'Ok' ? body.routes?.[0] : undefined;
  const s = route?.duration;
  const m = route?.distance;
  if (typeof s !== 'number' || typeof m !== 'number' || !Number.isFinite(s) || !Number.isFinite(m)) return null;
  const leg: DriveLeg = { min: Math.round(s / 60), mi: Math.round(m / 160.9344) / 10 };
  if (BCC.includes(r)) leg.via = 'bcc-mouth';
  else if (passesNear(route?.geometry?.coordinates ?? [], GUARDSMAN, GUARDSMAN.radiusKm))
    leg.warning = GUARDSMAN.warning;
  return leg;
}

async function routeAll(from: Point, deps: DriveDeps): Promise<Partial<Record<ResortId, DriveLeg>>> {
  const fx = createFetchx({ budget: RESORT_IDS.length, maxConn: 1, fetchImpl: deps.fetchImpl });
  const delay = deps.delay ?? sleep;
  const results: Partial<Record<ResortId, DriveLeg>> = {};
  for (const [i, r] of RESORT_IDS.entries()) {
    if (i > 0) await delay(OSRM.gapMs);
    try {
      const leg = legOf((await fx<OsrmBody>(osrmUrl(from, r), { body: 'json' })).data, r);
      if (leg) results[r] = leg;
      else logLine({ route: '/api/drive', resort: r, ok: false, err: 'no route' });
    } catch (err) {
      logLine({ route: '/api/drive', resort: r, ok: false, err: errorText(err) });
    }
  }
  return results;
}

const complete = (text: string): Response =>
  new Response(text, { headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': COMPLETE_CACHE } });

export function makeDrive(deps: DriveDeps = {}) {
  return async (_req: Request, env: Env, _ctx: ExecutionContext, url: URL): Promise<Response> => {
    const lat = url.searchParams.get('lat') ?? '';
    const lon = url.searchParams.get('lon') ?? '';
    if (!DEG.test(lat) || !DEG.test(lon))
      return apiError(422, 'validation', { code: 'bad-input', message: 'lat and lon: decimal degrees' });
    const origin = wasatchPoint(Number(lat), Number(lon));
    if (!origin) return apiError(422, 'validation', { code: 'outside-wasatch', message: 'Outside the Wasatch area' });
    const now = Date.now();
    const key = driveKey(origin);
    const hit = await readDrive(env.DB, key, now);
    if (hit) return complete(hit);
    const { count, resetAt } = await bumpDriveMisses(env.DB, now);
    if (count > OSRM.missesPerDay) return rateLimited(Math.ceil((resetAt - now) / 1000));
    const results = await routeAll(origin, deps);
    const routed = Object.keys(results).length;
    if (routed === 0) return apiError(502, 'upstream', { message: 'OSRM returned no route' });
    const body: DriveResponse = { origin, results, computedAt: isoUtc(Date.now()) };
    if (routed < RESORT_IDS.length) return json({ ...body, partial: true });
    const text = JSON.stringify(body);
    await writeDrive(env.DB, key, text, now);
    return complete(text);
  };
}

export const drive = makeDrive();
