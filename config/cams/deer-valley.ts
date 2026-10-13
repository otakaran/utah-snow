// Deer Valley cams, spec Appendix A.5 (10). Channel UCTqz2P_u5ewpc7ICo9p-TMg. Data only.
// camstreamer_youtube: the Worker sends HEAD https://camstreamer.com/embed/{handle} (redirect manual) and reads {id}
// from the Location. Handles and seed IDs live in config/youtube.ts. Images follow the YT convention; refresh 300 s.
import type { CamDef } from '../../src/shared/types.ts';

const YT = 'https://i.ytimg.com/vi/{id}';
const SU = 'https://www.skiutah.com/files/blob/webcam';
const YT_STILL = {
  card: `${YT}/mqdefault_live.jpg?t={m5}`,
  detail: `${YT}/maxresdefault_live.jpg?t={m5}`,
  wall: `${YT}/maxresdefault_live.jpg?t={m5}`,
} as const;
const BASE = {
  resort: 'deer-valley',
  pageUrl: 'https://www.deervalley.com/explore-the-mountain/webcams',
  isStake: false,
  hero: false,
} as const;
const CS_CAM = {
  ...BASE,
  kind: 'camstreamer_youtube',
  still: YT_STILL,
  live: { type: 'youtube' },
  refreshS: 300,
  timelapse: { provider: 'none' },
  credit: 'Deer Valley · YouTube',
} as const;

// biome-ignore format: dense registry, one cam per 1-4 lines
export const DEER_VALLEY_CAMS = [
  { ...CS_CAM, id: 'deer-valley-snow-park', name: 'Snow Park' },
  { ...CS_CAM, id: 'deer-valley-silver-lake', name: 'Silver Lake' },
  { ...CS_CAM, id: 'deer-valley-empire', name: 'Empire' },
  { ...CS_CAM, id: 'deer-valley-sterling', name: 'Sterling', hero: true },
  { ...CS_CAM, id: 'deer-valley-galena', name: 'Galena' },
  { ...CS_CAM, id: 'deer-valley-revelator', name: 'Revelator' },
  { ...CS_CAM, id: 'deer-valley-sultan', name: 'Sultan' }, // unlisted; reachable only through CamStreamer
  { ...CS_CAM, id: 'deer-valley-hoodoo', name: 'Hoodoo' },
  // STAKE (live). Not live today (the handle points to the unavailable _-jBmcnsK6s). Accepted only when LIVE and the
  // title matches /snow\s*stake|ontario/i; otherwise falls back to the -still. Last season's stream started 2025-12-31 (O13).
  { ...CS_CAM, id: 'deer-valley-ontario-snowstake-live', name: 'Ontario Snow Stake', isStake: true,
    live: { type: 'youtube', dvr: true }, fallback: ['deer-valley-ontario-snowstake-still'],
    timelapse: { provider: 'archive', source: 'deer-valley-ontario-snowstake-still' } },
  // STAKE still; our own archive (job stake-skiutah, every 15 min).
  { ...BASE, kind: 'skiutah', id: 'deer-valley-ontario-snowstake-still', name: 'Ontario Snow Stake (still)', isStake: true,
    refreshS: 900, archive: { everyMin: 15 }, timelapse: { provider: 'archive' }, credit: 'Deer Valley · Ski Utah',
    pageUrl: 'https://www.skiutah.com/members/deer-valley/snowreport',
    still: { card: `${SU}/ZFfEsBSprV7GfFinXUifK3?_ts={s}`, detail: `${SU}/ZFfEsBSprV7GfFinXUifK3?_ts={s}`,
      wall: `${SU}/ZFfEsBSprV7GfFinXUifK3?_ts={s}` } },
] as const satisfies readonly CamDef[];
