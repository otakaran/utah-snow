// GET /api/stake/:id/frames?hours=1-26&step=5|15 and GET /api/stake/:id/frame/:t (spec §7, §6.3).
// frames: one scrubber list per timelapse provider, `public, max-age=120`, edge copy 120 s (key: hours, step, build).
//   archive: the KV archive's index (frames younger than 120 s omitted); a live stake whose timelapse is its `-still`
//   twin's archive also gets the live `videoId`. hdrelay / prism / roundshot: built per request from the upstream
//   (frames/<provider>.ts, all I/O through fetchx), only while frames/available.ts allows it.
//   404 `no-timelapse` for a cam without one (or gated off now); 502 `upstream` when the provider fails; neither
//   is cached.
// frame: the JPEG from KV `cam:{id}:{t}`, immutable for a year (+ caches.default); a miss is a no-store 404.
import { HDRELAY_CONFIG_ROW } from '../../../config/cams/index.ts';
import { isObj, tryJson } from '../../shared/json.ts';
import type { CamDef, CamStatusEntry, HdrelayCamConfig, StakeFramesBody } from '../../shared/types.ts';
import {
  archiveFrame,
  archiveFrames,
  archiveSource,
  camDef,
  type FramesQuery,
  parseQuery,
  parseT,
} from '../frames/archive.ts';
import { providerAvailable } from '../frames/available.ts';
import { hdrelayFrames } from '../frames/hdrelay.ts';
import { prismFrames } from '../frames/prism.ts';
import { roundshotFrames } from '../frames/roundshot.ts';
import { apiError, BUILD_ID, notFound } from '../http.ts';
import { createFetchx } from '../lib/fetchx.ts';
import { errorText, logLine } from '../lib/log.ts';
import { CAM_STATUS_ROW } from '../sources/cam-status.ts';
import { readState } from '../sources/youtube/state.ts';
import { readPayloads } from '../store/frames.ts';
import { YT_ROW } from './cams/inputs.ts';
import { edgeJson } from './edge.ts';

/** Router pattern for both stake routes. */
export const STAKE_PATH = /^\/api\/stake\/([a-z0-9-]+)\/(?:(frames)|frame\/([^/]+))$/;
const LIST_TTL_S = 120;
const IMMUTABLE = 'public, max-age=31536000, immutable';

class NoTimelapse extends Error {}
class UpstreamError extends Error {}

type List = Omit<StakeFramesBody, 'camId'>;

const noTimelapse = (): Response => apiError(404, 'not-found', { code: 'no-timelapse' });

async function liveVideoId(db: D1Database, camId: string, now: number): Promise<string | null> {
  const [row] = await readPayloads(db, [YT_ROW]);
  return readState(tryJson(row?.payload), now).slots[camId]?.videoId ?? null;
}

async function archiveList(env: Env, def: CamDef, source: string, q: FramesQuery, now: number): Promise<List> {
  const twin = source !== def.id && def.live?.type === 'youtube';
  const [list, videoId] = await Promise.all([
    archiveFrames(env.DB, source, q, now),
    twin ? liveVideoId(env.DB, def.id, now) : null,
  ]);
  return videoId ? { provider: 'archive', ...list, videoId } : { provider: 'archive', ...list };
}

/** One cam's entry of a decoded status row, if it is an object. */
function entryOf<T>(row: unknown, id: string): T | undefined {
  const e = isObj(row) ? row[id] : undefined;
  return isObj(e) ? (e as T) : undefined;
}

async function providerList(env: Env, def: CamDef, q: FramesQuery, now: number): Promise<List> {
  const rows = await readPayloads(env.DB, [CAM_STATUS_ROW, HDRELAY_CONFIG_ROW]);
  const byId = new Map(rows.map((r) => [r.source_id, tryJson(r.payload)]));
  const status = entryOf<CamStatusEntry>(byId.get(CAM_STATUS_ROW), def.id);
  if (!providerAvailable(def, status)) throw new NoTimelapse();
  const fx = createFetchx();
  try {
    switch (def.timelapse.provider) {
      case 'hdrelay': {
        const config = entryOf<Partial<HdrelayCamConfig>>(byId.get(HDRELAY_CONFIG_ROW), def.id);
        return { provider: 'hdrelay', ...(await hdrelayFrames(fx, def, { status, config }, q, now)) };
      }
      case 'prism':
        return { provider: 'prism', ...(await prismFrames(fx, def, q, now)) };
      case 'roundshot':
        return { provider: 'roundshot', ...(await roundshotFrames(fx, def, q, now)) };
      default:
        throw new NoTimelapse();
    }
  } catch (err) {
    throw err instanceof NoTimelapse ? err : new UpstreamError(errorText(err));
  }
}

async function frames(req: Request, env: Env, ctx: ExecutionContext, url: URL, camId: string): Promise<Response> {
  const def = camDef(camId);
  if (!def) return notFound();
  const { provider } = def.timelapse;
  const source = provider === 'archive' ? archiveSource(def) : null;
  if (provider === 'none' || (provider === 'archive' && !source)) return noTimelapse();
  const q = parseQuery(url.searchParams);
  const path = `/api/stake/${camId}/frames?hours=${q.hours}&step=${q.step}&b=${encodeURIComponent(BUILD_ID)}`;
  try {
    return await edgeJson(req, ctx, { key: new URL(path, url).href, ttlS: LIST_TTL_S }, async () => {
      const now = Date.now();
      const list = source ? await archiveList(env, def, source, q, now) : await providerList(env, def, q, now);
      const body: StakeFramesBody = { camId, ...list };
      return JSON.stringify(body);
    });
  } catch (err) {
    if (err instanceof NoTimelapse) return noTimelapse();
    if (!(err instanceof UpstreamError)) throw err;
    logLine({ route: 'stake-frames', camId, provider, ok: false, err: err.message });
    return apiError(502, 'upstream', { code: provider });
  }
}

async function frame(env: Env, ctx: ExecutionContext, url: URL, camId: string, seg: string): Promise<Response> {
  const t = parseT(seg);
  if (t === null) return notFound();
  const key = new Request(new URL(`/api/stake/${camId}/frame/${t}`, url).href);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const buf = await archiveFrame(env.FRAMES, camId, t);
  if (!buf) return notFound(); // no-store, so a frame that appears later is never masked
  const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': IMMUTABLE, ETag: `"f-${t}"` };
  ctx.waitUntil(caches.default.put(key, new Response(buf.slice(0), { headers })));
  return new Response(buf, { headers });
}

export function stake(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> | Response {
  const m = STAKE_PATH.exec(url.pathname);
  if (!m?.[1]) return notFound();
  return m[2] ? frames(req, env, ctx, url, m[1]) : frame(env, ctx, url, m[1], m[3] ?? '');
}
