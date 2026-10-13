// Archive frame lists (spec §6.3): the stake_frames index of one KV-archived cam -> scrubber frames and markers,
// plus the KV read of one frame. Frames newer than READY_MS are never listed, because a fresh KV put may not have
// propagated yet. Shared by the provider lists: FramesQuery, parseQuery and thin. Wire types: src/shared/types/cams.ts.
import { CAMS } from '../../../config/cams/index.ts';
import { addDays, formatClock, HOUR, localDate, MIN, zonedToUtc } from '../../shared/time.ts';
import type { CamDef, FrameMarker, TimelapseFrame } from '../../shared/types.ts';
import { listFrames, readFrame } from '../store/frames.ts';

export const READY_MS = 2 * MIN;
export const MAX_HOURS = 26; // the KV TTL; nothing older exists
export const DEFAULT_HOURS = 24;
const T_RE = /^\d{1,15}$/;
const ALTA_STAKE = 'alta-collins-stake'; // cleared at 04:00 and 16:00 local; other stakes' reset times are unknown
const CLEARS = ['04:00', '16:00'] as const;
const PRE_CLEAR_MS = 30 * MIN;

export interface FramesQuery {
  hours: number;
  step: 5 | 15;
}

const BY_ID = new Map((CAMS as readonly CamDef[]).map((c) => [c.id, c]));

export const camDef = (id: string): CamDef | undefined => BY_ID.get(id);

/** The cam whose KV archive backs this cam's timelapse (the `-still` twin for the live stakes), else null. */
export function archiveSource(def: CamDef): string | null {
  if (def.timelapse.provider !== 'archive') return null;
  const src = camDef(def.timelapse.source ?? def.id);
  return src?.archive ? src.id : null;
}

/** A frame timestamp from a URL segment, or null. */
export const parseT = (s: string): number | null => (T_RE.test(s) ? Number(s) : null);

/** `hours` clamped to 1-26 (default 24), `step` 15 or else 5. */
export function parseQuery(params: URLSearchParams): FramesQuery {
  const h = Number.parseInt(params.get('hours') ?? '', 10);
  const hours = Number.isFinite(h) ? Math.min(MAX_HOURS, Math.max(1, h)) : DEFAULT_HOURS;
  return { hours, step: params.get('step') === '15' ? 15 : 5 };
}

export const frameUrl = (camId: string, t: number): string => `/api/stake/${camId}/frame/${t}`;

/** Keeps frames at least `stepMin` apart, walking back from the newest (so the newest is always kept). */
export function thin<T extends { t: number }>(rows: readonly T[], stepMin: number): T[] {
  if (stepMin <= 5) return [...rows];
  const gap = stepMin * MIN;
  const out: T[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i] as T;
    const last = out[out.length - 1];
    if (!last || last.t - r.t >= gap) out.push(r);
  }
  return out.reverse();
}

/** Alta: `clear` at 04:00/16:00 local inside [from, to]; `pre-clear` = the last frame in the 30 min before each. */
export function altaMarkers(frames: readonly { t: number }[], from: number, to: number): FrameMarker[] {
  const out: FrameMarker[] = [];
  const last = localDate(to);
  for (let date = localDate(from); date && date <= last; date = addDays(date, 1)) {
    for (const hm of CLEARS) {
      const t = zonedToUtc(`${date} ${hm}`);
      if (t === null || t < from || t > to) continue;
      const pre = frames.filter((f) => f.t >= t - PRE_CLEAR_MS && f.t < t).at(-1);
      if (pre) out.push({ t: pre.t, kind: 'pre-clear', label: `Before clear · ${formatClock(pre.t)}` });
      out.push({ t, kind: 'clear', label: `Cleared · ${formatClock(t)}` });
    }
  }
  return out;
}

/** Pure: index rows (oldest first) -> the scrubber list and markers of one archive. */
export function buildArchive(
  source: string,
  rows: readonly { t: number; bytes: number }[],
  q: FramesQuery,
  window: { from: number; to: number },
): { frames: TimelapseFrame[]; markers: FrameMarker[] } {
  const frames = thin(rows, q.step).map((r) => {
    const url = frameUrl(source, r.t);
    return { t: r.t, thumb: url, full: url, bytes: r.bytes };
  });
  const markers = source === ALTA_STAKE ? altaMarkers(frames, window.from, window.to) : [];
  return { frames, markers };
}

/** The frame list of one archive for the last `q.hours`, without frames younger than READY_MS. */
export async function archiveFrames(
  db: D1Database,
  source: string,
  q: FramesQuery,
  now: number,
): Promise<{ frames: TimelapseFrame[]; markers: FrameMarker[] }> {
  const window = { from: now - q.hours * HOUR, to: now - READY_MS };
  return buildArchive(source, await listFrames(db, source, window.from, window.to), q, window);
}

/** One archived JPEG, or null (expired, never written, or not an archive cam). */
export function archiveFrame(kv: KVNamespace, camId: string, t: number): Promise<ArrayBuffer | null> {
  return camDef(camId)?.archive ? readFrame(kv, camId, t) : Promise.resolve(null);
}
