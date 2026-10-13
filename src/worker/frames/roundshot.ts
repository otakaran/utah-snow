// Roundshot frame lists (spec §6.3).
// roundshot: ONE GET of backend.roundshot.com/cams/{hash}/default with redirects off; its Location
// `https://storage4.roundshot.com/{storageId}/{YYYY-MM-DD}/{HH-MM}-00/…` names the newest capture (Denver wall time).
// Frames are the 10-min slots from there back to now − hours whose local time is 07:10–17:30 (daylight captures).
// Slots are never HEAD-checked: the client skips one whose image fails. thumb `_optional.jpg`, full `_default.jpg`.
// roundshot360: snowbird.roundshot.com/structure.json -> images[status='finished'] (today only). `datetime` is
// Denver wall time encoded as an epoch. thumb = structure.thumbnail.url_full, full = structure.quarter.url_full.
import { HOUR, isoUtc, localParts, MIN, zonedToUtc } from '../../shared/time.ts';
import type { CamDef, StakeFramesBody, TimelapseFrame } from '../../shared/types.ts';
import type { FetchX } from '../lib/fetchx.ts';
import { type FramesQuery, thin } from './archive.ts';
import { UPSTREAM_TIMEOUT_MS } from './hdrelay.ts';

const BACKEND = 'https://backend.roundshot.com/cams';
const STRUCTURE = 'https://snowbird.roundshot.com/structure.json';
const LOC_RE = /^(https:\/\/storage\d*\.roundshot\.com\/[\w.-]+)\/(\d{4}-\d{2}-\d{2})\/(\d{2})-(\d{2})-00\//;
const IMG_RE = /^https:\/\/storage\d*\.roundshot\.com\/[^\s"'<>]+\.jpg$/;
const SLOT_MS = 10 * MIN;
const DAY_FROM = '07:10';
const DAY_TO = '17:30';

type List = Pick<StakeFramesBody, 'frames' | 'markers'>;

export const roundshotHash = (def: CamDef): string | null =>
  /\/cams\/([0-9a-f]{32})\//.exec(def.still.card)?.[1] ?? null;

/** The backend's Location -> the storage base and the newest capture (epoch ms), or null. */
export function parseLatest(location: string | null | undefined): { base: string; t: number } | null {
  const m = location ? LOC_RE.exec(location) : null;
  const t = m ? zonedToUtc(`${m[2]} ${m[3]}:${m[4]}`) : null;
  return m?.[1] && t !== null ? { base: m[1], t } : null;
}

/** Pure: daylight 10-min slots in [now − hours, latest], oldest first. */
export function roundshotSlots(latest: { base: string; t: number }, q: FramesQuery, now: number): TimelapseFrame[] {
  const out: TimelapseFrame[] = [];
  const from = now - q.hours * HOUR;
  for (let t = Math.min(latest.t, now + HOUR); t >= from; t -= SLOT_MS) {
    const p = localParts(t);
    if (!p || p.hm < DAY_FROM || p.hm > DAY_TO) continue;
    const stamp = `${p.date}-${p.hm.replace(':', '-')}-00`;
    const dir = `${latest.base}/${p.date}/${p.hm.replace(':', '-')}-00/${stamp}`;
    out.push({ t, thumb: `${dir}_optional.jpg`, full: `${dir}_default.jpg` });
  }
  return thin(out.reverse(), q.step);
}

interface Rs360Image {
  status?: unknown;
  datetime?: unknown;
  structure?: { thumbnail?: { url_full?: unknown }; quarter?: { url_full?: unknown } };
}

const img = (v: unknown): string | null => (typeof v === 'string' && IMG_RE.test(v) ? v : null);

/** Pure: structure.json -> finished panoramas inside [now − hours, now], oldest first. Throws on a bad body. */
export function build360(body: unknown, q: FramesQuery, now: number): List {
  const images = (body as { images?: unknown } | null)?.images;
  if (!Array.isArray(images)) throw new Error('roundshot360: structure.json has no images');
  const from = now - q.hours * HOUR;
  const rows: TimelapseFrame[] = [];
  for (const i of images as Rs360Image[]) {
    if (i?.status !== 'finished' || typeof i.datetime !== 'number') continue;
    const t = zonedToUtc(isoUtc(i.datetime * 1000).slice(0, 16)); // the epoch's UTC fields are Denver wall time
    const thumb = img(i.structure?.thumbnail?.url_full);
    const full = img(i.structure?.quarter?.url_full);
    if (t !== null && t >= from && t <= now + HOUR && thumb && full) rows.push({ t, thumb, full });
  }
  rows.sort((a, b) => a.t - b.t);
  return { frames: thin(rows, q.step), markers: [] };
}

/** The 360 strip's structure.json, or the backend redirect of a flat Roundshot cam. */
export async function roundshotFrames(fx: FetchX, def: CamDef, q: FramesQuery, now: number): Promise<List> {
  if (def.kind === 'roundshot360') {
    const res = await fx<unknown>(STRUCTURE, { body: 'json', timeoutMs: UPSTREAM_TIMEOUT_MS });
    return build360(res.data, q, now);
  }
  const hash = roundshotHash(def);
  if (!hash) throw new Error(`roundshot: ${def.id} has no hash`);
  const res = await fx(`${BACKEND}/${hash}/default`, {
    follow: false,
    body: 'none',
    allowStatus: true,
    timeoutMs: UPSTREAM_TIMEOUT_MS,
  });
  const latest = parseLatest(res.headers.get('location'));
  if (!latest) throw new Error(`roundshot: ${def.id} answered ${res.status} without a capture Location`);
  return { frames: roundshotSlots(latest, q, now), markers: [] };
}
