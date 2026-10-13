// GET /api/stake/:id/frames?hours=1-26&step=5|15 and GET /api/stake/:id/frame/:t (spec §7, §6.3).
// frames: the KV archive's index for the last `hours` (frames younger than 120 s omitted), `public, max-age=120`,
// edge copy 120 s. A live stake whose timelapse is its `-still` twin's archive also gets the live `videoId`.
// 404 for an unknown cam or one without an archive timelapse (HDRelay/Prism/Roundshot lists are Phase 2).
// frame: the JPEG from KV `cam:{id}:{t}`, immutable for a year (+ caches.default); a miss is a no-store 404.
import { tryJson } from '../../shared/json.ts';
import {
  type ArchiveFrame,
  archiveFrame,
  archiveFrames,
  archiveSource,
  camDef,
  type Marker,
  parseQuery,
  parseT,
} from '../frames/archive.ts';
import { apiError, BUILD_ID, notFound } from '../http.ts';
import { readState } from '../sources/youtube/state.ts';
import { readPayloads } from '../store/frames.ts';
import { YT_ROW } from './cams/inputs.ts';
import { edgeJson } from './edge.ts';

/** Router pattern for both stake routes. */
export const STAKE_PATH = /^\/api\/stake\/([a-z0-9-]+)\/(?:(frames)|frame\/([^/]+))$/;
const LIST_TTL_S = 120;
const IMMUTABLE = 'public, max-age=31536000, immutable';

export interface StakeFramesBody {
  camId: string;
  provider: 'archive';
  frames: ArchiveFrame[]; // oldest first; thumb and full are the same /api/stake/{source}/frame/{t} URL
  markers: Marker[];
  videoId?: string;
}

async function liveVideoId(db: D1Database, camId: string, now: number): Promise<string | null> {
  const [row] = await readPayloads(db, [YT_ROW]);
  return readState(tryJson(row?.payload), now).slots[camId]?.videoId ?? null;
}

function frames(req: Request, env: Env, ctx: ExecutionContext, url: URL, camId: string): Promise<Response> | Response {
  const def = camDef(camId);
  if (!def) return notFound();
  const source = archiveSource(def);
  if (!source) return apiError(404, 'not-found', { code: 'no-timelapse' });
  const q = parseQuery(url.searchParams);
  const path = `/api/stake/${camId}/frames?hours=${q.hours}&step=${q.step}&b=${encodeURIComponent(BUILD_ID)}`;
  return edgeJson(req, ctx, { key: new URL(path, url).href, ttlS: LIST_TTL_S }, async () => {
    const now = Date.now();
    const twin = source !== camId && def.live?.type === 'youtube';
    const [list, videoId] = await Promise.all([
      archiveFrames(env.DB, source, q, now),
      twin ? liveVideoId(env.DB, camId, now) : null,
    ]);
    const body: StakeFramesBody = { camId, provider: 'archive', ...list };
    if (videoId) body.videoId = videoId;
    return JSON.stringify(body);
  });
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
