// Pure scrubber logic (spec §6.3, §8.3): the list URL, the step (15 min on phones and in data saver), index moves
// that skip frames whose image failed, the 3-frame lookahead to preload and where markers sit on the track.
import type { StakeFramesBody } from '../../../shared/types.ts';

export const SCRUB_HOURS = 24;
export const LOOKAHEAD = 3;

/** Phones and data saver scrub every 15 min; everything else every 5. */
export const scrubStep = (phone: boolean, saver: boolean): 5 | 15 => (phone || saver ? 15 : 5);

export const framesUrl = (camId: string, step: 5 | 15, hours = SCRUB_HOURS): string =>
  `/api/stake/${encodeURIComponent(camId)}/frames?hours=${hours}&step=${step}`;

/** The response looks like a StakeFramesBody (frames with numeric t and string URLs). */
export function isFramesBody(v: unknown): v is StakeFramesBody {
  const b = v as Partial<StakeFramesBody> | null;
  return (
    typeof b === 'object' &&
    b !== null &&
    Array.isArray(b.frames) &&
    Array.isArray(b.markers) &&
    b.frames.every((f) => typeof f?.t === 'number' && typeof f.thumb === 'string' && typeof f.full === 'string')
  );
}

/** The next index from `i` in direction `dir` that is not known broken, or null at the end of the list. */
export function stepIndex(i: number, dir: 1 | -1, n: number, bad: ReadonlySet<number>): number | null {
  for (let j = i + dir; j >= 0 && j < n; j += dir) if (!bad.has(j)) return j;
  return null;
}

/** ← → Home End -> the new index and travel direction, or null for other keys (and at the ends). */
export function keyMove(
  key: string,
  i: number,
  n: number,
  bad: ReadonlySet<number>,
): { i: number; dir: 1 | -1 } | null {
  const to =
    key === 'ArrowLeft'
      ? stepIndex(i, -1, n, bad)
      : key === 'ArrowRight'
        ? stepIndex(i, 1, n, bad)
        : key === 'Home'
          ? stepIndex(-1, 1, n, bad)
          : key === 'End'
            ? stepIndex(n, -1, n, bad)
            : null;
  if (to === null || to === i) return null;
  return { i: to, dir: key === 'ArrowLeft' || key === 'End' ? -1 : 1 };
}

/** Up to LOOKAHEAD indices after `i` in the travel direction, skipping broken frames: the only ones preloaded. */
export function lookahead(i: number, dir: 1 | -1, n: number, bad: ReadonlySet<number>, k = LOOKAHEAD): number[] {
  const out: number[] = [];
  for (let j = stepIndex(i, dir, n, bad); j !== null && out.length < k; j = stepIndex(j, dir, n, bad)) out.push(j);
  return out;
}

/** The index of the frame nearest to `t` (frames oldest first), or -1 for an empty list. */
export function nearestIndex(frames: readonly { t: number }[], t: number): number {
  let best = -1;
  let gap = Number.POSITIVE_INFINITY;
  frames.forEach((f, i) => {
    const d = Math.abs(f.t - t);
    if (d < gap) {
      best = i;
      gap = d;
    }
  });
  return best;
}

/** Where a marker sits: the nearest frame (the slider is index-based) and its place on the track in percent. */
export function markerSpot(frames: readonly { t: number }[], t: number): { i: number; pct: number } | null {
  const first = frames[0]?.t;
  const last = frames.at(-1)?.t;
  if (first === undefined || last === undefined || t < first || t > last) return null;
  const i = nearestIndex(frames, t);
  return { i, pct: frames.length > 1 ? (i / (frames.length - 1)) * 100 : 100 };
}
