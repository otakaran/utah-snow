// Brighton cams, spec Appendix A.3 (8). Channel UC3NvXJeIa_dBZ2ygCKrfCCQ. Data only: YouTube seeds and title regexes
// live in config/youtube.ts; {id} is the resolved video ID (§6.1), expanded by src/shared/cam-url.ts.
// YT convention: detail/wall use maxresdefault_live when the Worker's first-sight HEAD found it, else hqdefault_live;
// swap to hq when naturalWidth === 120.
import type { CamDef } from '../../src/shared/types.ts';

const YT = 'https://i.ytimg.com/vi/{id}';
const SU = 'https://www.skiutah.com/files/blob/webcam';
const YT_STILL = {
  card: `${YT}/mqdefault_live.jpg?t={m5}`,
  detail: `${YT}/maxresdefault_live.jpg?t={m5}`,
  wall: `${YT}/maxresdefault_live.jpg?t={m5}`,
} as const;
const YT_HQ = {
  card: `${YT}/mqdefault_live.jpg?t={m5}`,
  detail: `${YT}/hqdefault_live.jpg?t={m5}`,
  wall: `${YT}/hqdefault_live.jpg?t={m5}`,
} as const;
const BASE = {
  resort: 'brighton',
  pageUrl: 'https://www.brightonresort.com/conditions#cams',
  isStake: false,
  hero: false,
} as const;
const YT_CAM = {
  ...BASE,
  kind: 'youtube',
  still: YT_STILL,
  live: { type: 'youtube' },
  refreshS: 300,
  timelapse: { provider: 'none' },
  credit: 'Brighton · YouTube',
} as const;

// biome-ignore format: dense registry, one cam per 1-4 lines
export const BRIGHTON_CAMS = [
  // Card is a static custom card with "LIVE · tap" (mqdefault_live is a branded card); click-to-play only.
  { ...YT_CAM, id: 'brighton-parking-lot', name: 'Parking Lot', pageUrl: 'https://www.brightonresort.com/conditions#parking-cams' },
  { ...YT_CAM, id: 'brighton-molly-greens', name: "Molly Green's" },
  { ...YT_CAM, id: 'brighton-top-of-crest', name: 'Top of Crest', hero: true },
  // maxresdefault_live 404s for these two, so detail and wall use hqdefault_live.
  { ...YT_CAM, id: 'brighton-explorer', name: 'Explorer', still: YT_HQ },
  { ...YT_CAM, id: 'brighton-milly-express', name: 'Milly Express', still: YT_HQ },
  // Live only: must be LIVE, because ended recordings share the title.
  { ...YT_CAM, id: 'brighton-great-western', name: 'Great Western', seasonal: true },
  { ...YT_CAM, id: 'brighton-majestic', name: 'Majestic', seasonal: true }, // live only; may not return
  // STAKE. hiddenUntilFresh: hidden while its ETag (the body's SHA-1) is unchanged for 3 h (Last-Modified moves even
  // when the image is stale). No timelapse.
  { ...BASE, kind: 'skiutah', id: 'brighton-snowstake-skiutah', name: 'Snow Stake', isStake: true, hiddenUntilFresh: true,
    refreshS: 900, timelapse: { provider: 'none' }, credit: 'Brighton · Ski Utah',
    pageUrl: 'https://www.skiutah.com/members/brighton/snowreport',
    still: { card: `${SU}/LBSKmCQHw9GVGF5AcHnE2o?_ts={s}`, detail: `${SU}/LBSKmCQHw9GVGF5AcHnE2o?_ts={s}`,
      wall: `${SU}/LBSKmCQHw9GVGF5AcHnE2o?_ts={s}` } },
] as const satisfies readonly CamDef[];
