// Prism frame lists (spec §6.3, Appendix A): cam_init.php?cams={NN} -> cams[].images[] (the trailing 24 h).
// t = images[].time (epoch s) x 1000. The object path comes ONLY from images[].path, never from sql/mysqlTime
// (local wall time, DST-ambiguous). Frames: GCS/prism-cam-000NN/{path}/360.jpg (thumb) and 1080.jpg (full), immutable.
// MP4: the first of today's dated folder, yesterday's and running/ whose segmentlist.txt answers 200 (Prism writes
// it next to the MP4); its first and last `YYYYMMDD_HH.mp4` lines are Denver hours, `to` = last hour + 1 h. When no
// segmentlist answers there is no MP4. MP4 lookups never fail the list.
import { SITE } from '../../../config/site.ts';
import { num } from '../../shared/num.ts';
import { addDays, HOUR, localDate, zonedToUtc } from '../../shared/time.ts';
import type { CamDef, StakeFramesBody, TimelapseFrame } from '../../shared/types.ts';
import type { FetchX } from '../lib/fetchx.ts';
import { type FramesQuery, thin } from './archive.ts';
import { UPSTREAM_TIMEOUT_MS } from './hdrelay.ts';

const CAM_INIT = 'https://php.prismcam.com/public/helpers/cam_init.php';
const GCS = 'https://storage.googleapis.com';
const PATH_RE = /^\d{4}\/\d{2}\/\d{2}\/\d{2}-\d{2}$/;
const SEG_RE = /(\d{4})(\d{2})(\d{2})_(\d{2})\.mp4$/;
const MIN_EPOCH_S = 1_600_000_000;

type List = Pick<StakeFramesBody, 'frames' | 'markers' | 'mp4'>;
type Mp4 = NonNullable<StakeFramesBody['mp4']>;

/** The cam's Prism number from its still URL: { n: '88', pad: '00088' }. */
export function prismCam(def: CamDef): { n: string; pad: string } | null {
  const pad = /\/prism-cam-(\d{5})\//.exec(def.still.card)?.[1];
  return pad ? { n: String(Number(pad)), pad } : null;
}

// `url` is mandatory (an empty body without it); no `callback`, so the answer is JSON.
export const camInitUrl = (n: string): string =>
  `${CAM_INIT}?cams=${n}&pages=&url=${encodeURIComponent(`${SITE.origin.replace(/^https?:/, '')}/`)}`;

/** Pure: the cam_init body -> frames inside [now − hours, now], oldest first. Throws when the cam is missing. */
export function buildPrism(body: unknown, cam: { n: string; pad: string }, q: FramesQuery, now: number): List {
  const cams = (body as { cams?: unknown } | null)?.cams;
  const c = Array.isArray(cams) ? cams.find((x) => x && String(x.id) === cam.n) : undefined;
  if (!c) throw new Error(`prism: cam ${cam.n} missing from cam_init`);
  const images: unknown[] = Array.isArray(c.images) ? c.images : [];
  const from = now - q.hours * HOUR;
  const rows: { t: number; path: string }[] = [];
  for (const img of images) {
    const { time, path } = (img ?? {}) as { time?: unknown; path?: unknown };
    const s = num(time);
    if (s === null || s < MIN_EPOCH_S || typeof path !== 'string' || !PATH_RE.test(path)) continue;
    const t = s * 1000;
    if (t >= from && t <= now + HOUR) rows.push({ t, path });
  }
  rows.sort((a, b) => a.t - b.t);
  const root = `${GCS}/prism-cam-${cam.pad}`;
  const frames: TimelapseFrame[] = thin(rows, q.step).map(({ t, path }) => ({
    t,
    thumb: `${root}/${path}/360.jpg`,
    full: `${root}/${path}/1080.jpg`,
  }));
  return { frames, markers: [] };
}

/** MP4 folders in the order they are tried: today's, yesterday's (Denver dates), then running/. */
export function mp4Folders(pad: string, now: number): string[] {
  const today = localDate(now);
  const dated = (date: string) => `${GCS}/prism-cam-${pad}/${date.replaceAll('-', '/')}/timelapse/`;
  return [dated(today), dated(addDays(today, -1)), `${GCS}/prism-cam-${pad}/running/`];
}

function segmentHour(line: string | undefined): number | null {
  const m = line ? SEG_RE.exec(line.trim()) : null;
  return m ? zonedToUtc(`${m[1]}-${m[2]}-${m[3]} ${m[4]}:00`) : null;
}

/** Pure: segmentlist.txt -> the span its hourly segments cover, or null. */
export function segmentSpan(text: string): { from: number; to: number } | null {
  const lines = text.split('\n').filter((l) => SEG_RE.test(l.trim()));
  const from = segmentHour(lines[0]);
  const last = segmentHour(lines.at(-1));
  return from !== null && last !== null && last >= from ? { from, to: last + HOUR } : null;
}

async function prismMp4(fx: FetchX, pad: string, now: number): Promise<Mp4 | null> {
  const h = Math.floor(now / HOUR);
  for (const folder of mp4Folders(pad, now)) {
    const res = await fx<string>(`${folder}segmentlist.txt?t=${h}`, {
      allowStatus: true,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    }).catch(() => null);
    if (res?.status !== 200) continue;
    const span = segmentSpan(res.data);
    if (span) return { url: `${folder}${pad}_timelapse_720.mp4?t=${h}`, ...span };
  }
  return null;
}

/** cam_init for the frames and the MP4 chain, in parallel. */
export async function prismFrames(fx: FetchX, def: CamDef, q: FramesQuery, now: number): Promise<List> {
  const cam = prismCam(def);
  if (!cam) throw new Error(`prism: ${def.id} has no cam number`);
  const [init, mp4] = await Promise.all([
    fx<unknown>(camInitUrl(cam.n), { body: 'json', timeoutMs: UPSTREAM_TIMEOUT_MS }),
    def.timelapse.mp4 ? prismMp4(fx, cam.pad, now) : null,
  ]);
  const list = buildPrism(init.data, cam, q, now);
  return mp4 ? { ...list, mp4 } : list;
}
