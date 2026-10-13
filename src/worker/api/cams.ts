// GET /api/cams (spec §7, §6.4): {generatedAt, cams: CamState[], unmapped} for every registry cam, built from the
// cams:status, yt:state, hdrelay:config, udot:cams and stake rows plus the stake_frames index (cams/state.ts).
// Edge copy in caches.default for 60 s under /api/cams?b={BUILD_ID}; clients get `public, max-age=60`, a weak ETag
// and 304 on If-None-Match.

import { READY_MS } from '../frames/archive.ts';
import { BUILD_ID } from '../http.ts';
import { readCamInputs } from '../store/frames.ts';
import { CAM_ROWS, decodeInputs } from './cams/inputs.ts';
import { buildCams } from './cams/state.ts';
import { edgeJson } from './edge.ts';

const EDGE_TTL_S = 60;

export function cams(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const key = new URL(`/api/cams?b=${encodeURIComponent(BUILD_ID)}`, url).href;
  return edgeJson(req, ctx, { key, ttlS: EDGE_TTL_S }, async () => {
    const now = Date.now();
    const { rows, frames } = await readCamInputs(env.DB, CAM_ROWS, now - READY_MS);
    return JSON.stringify(buildCams(decodeInputs(rows, frames, now), now));
  });
}
