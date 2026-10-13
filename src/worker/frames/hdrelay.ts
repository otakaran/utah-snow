// HDRelay frame lists (spec §6.3): GET img.hdrelay.com/api/frames/next from now − hours -> epoch ms, ascending (GET
// only: HEAD returns 500). n counts from the oldest end, so &interval=300 (900 at step 15) always bounds it by time:
// without it bursts of duplicate captures (seconds apart, in winter) fill n before now. The server still answers
// some 5/10-min gaps at 900, so the list is thinned again here. Frames: IMG/{cameraId}/{position}/{ms}/:/rs=h:270 (thumb) and the original (full), or the
// archive's fullRs. `last-snow` marks hdrelay:config hotlink.time only while the overlay is enabled, the time is
// inside the window and not older than the archive's first frame (this hides years-old "Last Snow" bookmarks).
// Gating (archive.enabled) is the caller's: frames/available.ts.
import { HDRELAY_ARCHIVES, type HdrelayArchive } from '../../../config/cams/hdrelay-archives.ts';
import { formatClockRel, HOUR, isoToMs } from '../../shared/time.ts';
import type {
  CamDef,
  CamStatusEntry,
  FrameMarker,
  HdrelayCamConfig,
  StakeFramesBody,
  TimelapseFrame,
} from '../../shared/types.ts';
import type { FetchX } from '../lib/fetchx.ts';
import { type FramesQuery, thin } from './archive.ts';

const NEXT = 'https://img.hdrelay.com/api/frames/next';
const IMG = 'https://img.hdrelay.com/frames';
const CAMERA_RE = /^[0-9a-f-]{20,40}$/i;
const PER_HOUR = 12; // one frame every 5 min
const MIN_MS = 1_500_000_000_000; // 2017: anything older is junk
export const UPSTREAM_TIMEOUT_MS = 5_000; // a person is waiting on the list

type List = Pick<StakeFramesBody, 'frames' | 'markers'>;

export const hdrelayArchive = (id: string): HdrelayArchive | undefined =>
  (HDRELAY_ARCHIVES as Readonly<Record<string, HdrelayArchive>>)[id];

/** The daily config's camera id when it looks valid, else the registry's. */
export function cameraIdOf(def: CamDef, cfg: Partial<HdrelayCamConfig> | undefined): string | null {
  const id = typeof cfg?.cameraId === 'string' && CAMERA_RE.test(cfg.cameraId) ? cfg.cameraId : def.live?.cameraId;
  return id && CAMERA_RE.test(id) ? id : null;
}

/** frames/next for the window, one frame per step at most; n has one spare so the newest frame is never dropped. */
export function nextUrl(cameraId: string, position: string, q: FramesQuery, now: number): string {
  const n = q.hours * PER_HOUR + 1;
  return `${NEXT}?camera=${cameraId}&position=${position}&time=${now - q.hours * HOUR}&n=${n}&interval=${q.step * 60}`;
}

export interface HdrelayInput {
  cameraId: string;
  archive: HdrelayArchive;
  hotlink: HdrelayCamConfig['hotlink'] | undefined;
  first: number | null; // frames/info.first (cams:status archive.first), epoch ms
}

function lastSnow(inp: HdrelayInput, from: number, to: number, now: number): FrameMarker[] {
  const h = inp.hotlink;
  const t = h?.enabled === true && typeof h.time === 'number' ? h.time : null;
  if (t === null || t < from || t > to || inp.first === null || t < inp.first) return [];
  return [{ t, kind: 'last-snow', label: `Last snow · ${formatClockRel(t, now)}` }];
}

/** Pure: the frames/next body -> the scrubber list. Throws when the body is not an array. */
export function buildHdrelay(body: unknown, inp: HdrelayInput, q: FramesQuery, now: number): List {
  if (!Array.isArray(body)) throw new Error('hdrelay: frames/next is not an array');
  const from = now - q.hours * HOUR;
  const ts = body
    .filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= Math.max(MIN_MS, from) && v <= now + HOUR,
    )
    .sort((a, b) => a - b);
  const base = `${IMG}/${inp.cameraId}/${inp.archive.position}`;
  const frames: TimelapseFrame[] = thin(
    ts.map((t) => ({ t })),
    q.step,
  ).map(({ t }) => ({
    t,
    thumb: `${base}/${t}/:/rs=h:270`,
    full: inp.archive.fullRs ? `${base}/${t}/:/rs=${inp.archive.fullRs}` : `${base}/${t}`,
  }));
  return { frames, markers: lastSnow(inp, from, now, now) };
}

/** One frames/next call for an HDRelay archive cam. */
export async function hdrelayFrames(
  fx: FetchX,
  def: CamDef,
  rows: { status?: CamStatusEntry; config?: Partial<HdrelayCamConfig> },
  q: FramesQuery,
  now: number,
): Promise<List> {
  const archive = hdrelayArchive(def.id);
  const cameraId = cameraIdOf(def, rows.config);
  if (!archive || !cameraId) throw new Error(`hdrelay: ${def.id} has no archive`);
  const res = await fx<unknown>(nextUrl(cameraId, archive.position, q, now), {
    body: 'json',
    timeoutMs: UPSTREAM_TIMEOUT_MS,
  });
  const first = isoToMs(rows.status?.archive?.first ?? null);
  return buildHdrelay(res.data, { cameraId, archive, hotlink: rows.config?.hotlink, first }, q, now);
}
