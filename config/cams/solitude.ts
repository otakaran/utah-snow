// Solitude cams, spec Appendix A.4 (13). Channel UCsG59EVXq_OZatwq299yThg. Data only: YouTube seeds and title regexes
// (powderhorn-ii is matched before plain powderhorn) live in config/youtube.ts; {id} is the resolved video ID (§6.1).
// YT convention: detail/wall use maxresdefault_live when the Worker's first-sight HEAD found it, else hqdefault_live.
import type { CamDef } from '../../src/shared/types.ts';

const YT = 'https://i.ytimg.com/vi/{id}';
const SU = 'https://www.skiutah.com/files/blob/webcam';
const YT_STILL = {
  card: `${YT}/mqdefault_live.jpg?t={m5}`,
  detail: `${YT}/maxresdefault_live.jpg?t={m5}`,
  wall: `${YT}/maxresdefault_live.jpg?t={m5}`,
} as const;
const BASE = {
  resort: 'solitude',
  pageUrl: 'https://www.solitudemountain.com/mountain-and-village/webcams',
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
  credit: 'Solitude · YouTube',
} as const;

// biome-ignore format: dense registry, one cam per 1-4 lines
export const SOLITUDE_CAMS = [
  // STAKE (live). Offline -> the solitude-snowstake-still card. Timelapse = 24 h archive of the still.
  // YouTube DVR Rewind 1/3/6/9/12 h on the detail page only, hidden if getDuration() < 3600.
  { ...YT_CAM, id: 'solitude-snowstake', name: 'Snow Stake', isStake: true, live: { type: 'youtube', dvr: true },
    fallback: ['solitude-snowstake-still'], timelapse: { provider: 'archive', source: 'solitude-snowstake-still' } },
  // STAKE still; our own archive (job stake-skiutah, every 15 min).
  { ...BASE, kind: 'skiutah', id: 'solitude-snowstake-still', name: 'Snow Stake (still)', isStake: true, refreshS: 900,
    archive: { everyMin: 15 }, timelapse: { provider: 'archive' }, credit: 'Solitude · Ski Utah',
    pageUrl: 'https://www.skiutah.com/members/solitude/snowreport',
    still: { card: `${SU}/525820161?_ts={s}`, detail: `${SU}/525820161?_ts={s}`, wall: `${SU}/525820161?_ts={s}` } },
  { ...YT_CAM, id: 'solitude-powderhorn', name: 'Powderhorn', hero: true },
  { ...YT_CAM, id: 'solitude-sunshine-bowl', name: 'Sunshine Bowl' },
  { ...YT_CAM, id: 'solitude-moonbeam-parking', name: 'Moonbeam Parking' },
  { ...YT_CAM, id: 'solitude-moonbeam-lift-line', name: 'Moonbeam Lift Line' },
  // The YouTube thumbnail is a frozen custom frame, so stills come from Ski Utah.
  { ...YT_CAM, id: 'solitude-apex-sunrise', name: 'Apex Sunrise', refreshS: 900,
    still: { card: `${SU}/2106589527?_ts={s}`, detail: `${SU}/2106589527?_ts={s}`, wall: `${SU}/2106589527?_ts={s}` } },
  { ...YT_CAM, id: 'solitude-powderhorn-ii-lift-line', name: 'Powderhorn II Lift Line' },
  { ...YT_CAM, id: 'solitude-link-lift-line', name: 'Link Lift Line' },
  // Live only (seasonal). Eagle Express and Honeycomb Return titles are unconfirmed (O15).
  { ...YT_CAM, id: 'solitude-honeycomb-canyon', name: 'Honeycomb Canyon', seasonal: true },
  { ...YT_CAM, id: 'solitude-eagle-express', name: 'Eagle Express', seasonal: true },
  { ...YT_CAM, id: 'solitude-summit-express', name: 'Summit Express', seasonal: true },
  { ...YT_CAM, id: 'solitude-honeycomb-return', name: 'Honeycomb Return', seasonal: true },
] as const satisfies readonly CamDef[];
