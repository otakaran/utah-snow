// POST /api/cams/report (spec §7, §6.1): a browser's YouTube player failed on a cam. Body `{camId, code}`; only cams
// with a YouTube slot and the player error codes the client reports. 202 `{queued: true}` bumps the counter
// `yt:pending:{camId}`, which the next youtube tick reads (ETag HEAD first, discovery when keyed) and deletes.
// Never touches `yt:state` (only the youtube job writes it). Same guards as POST /api/tracker (post-guard.ts).
import { SLOTS, YT_REPORT_CODES } from '../../../config/youtube.ts';
import { json } from '../http.ts';
import { bumpYtPending } from '../store/counters.ts';
import { admit, invalid } from './post-guard.ts';

const YT_CAMS: ReadonlySet<string> = new Set(Object.values(SLOTS).flatMap((list) => list.map((s) => s.cam)));
const CODES: ReadonlySet<unknown> = new Set(YT_REPORT_CODES);

export async function camsReport(req: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const a = await admit(req, env, now);
  if (a instanceof Response) return a;
  const { camId, code } = a.body;
  if (typeof camId !== 'string' || !YT_CAMS.has(camId)) return invalid('bad-input', 'camId: expected a YouTube cam');
  if (!CODES.has(code)) return invalid('bad-input', `code: expected ${YT_REPORT_CODES.join('|')}`);
  await bumpYtPending(env.DB, camId, now);
  return json({ queued: true }, { status: 202 });
}
