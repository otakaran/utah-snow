// Cam picture freshness (spec §6.4), shared by /api/cams, /api/health and the cam tiles' caption.
// A probed cam (cams:status, one probe an hour) is judged by how old its picture was when it was last checked.
// Comparing `asOf` with the clock instead calls every healthy cam stale from 45 min after a probe until the next.
import { isBetweenLocal, isoToMs, MIN } from './time.ts';
import type { CamKind } from './types.ts';

/** A picture older than this is stale. */
export const CAM_FRESH_MS = 45 * MIN;
/** Two hourly probes plus cron lateness: an older check says nothing about the cam today. */
export const CAM_CHECK_MAX_MS = 130 * MIN;

/** Roundshot takes no pictures at night, so an old one is expected then. */
const roundshotNight = (kind: CamKind | undefined, at: number): boolean =>
  (kind === 'roundshot' || kind === 'roundshot360') && !isBetweenLocal(at, '07:10', '17:30');

/** True when the picture was at most 45 min old at its last check; false when either time is unknown. */
export function freshAtCheck(asOf: string | null | undefined, checkedAt: string | null | undefined): boolean {
  const a = isoToMs(asOf);
  const c = isoToMs(checkedAt);
  return a !== null && c !== null && c - a <= CAM_FRESH_MS;
}

/**
 * Whether a cam whose newest picture is from `asOf` counts as fresh at `now`. With a `checkedAt` (probed cams) the
 * age is taken at the check, and the check itself must be recent. Without one (archived stakes, whose frames
 * arrive every 5-15 min; rows written before `checkedAt` existed) the age is taken now.
 */
export function camFresh(
  kind: CamKind | undefined,
  asOf: string | null | undefined,
  checkedAt: string | null | undefined,
  now: number,
): boolean {
  const c = isoToMs(checkedAt);
  if (c !== null && now - c > CAM_CHECK_MAX_MS) return false;
  const at = c ?? now;
  const a = isoToMs(asOf);
  return (a !== null && at - a <= CAM_FRESH_MS) || roundshotNight(kind, at);
}
