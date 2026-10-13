// Alta cams, spec Appendix A.1 (8). Data only: resolvers live in src/worker/sources/, placeholders expand in
// src/shared/cam-url.ts. Drift slugs (window.Alta.weather.mountainCams[].slug) are the id minus `alta-`, except the
// stake, which is `collins-snow-stake`. Prism `archr_cam_id` is 65 (albion-basin) and 88 (mount-baldy).
// do_still: plain <img> only (the host sends no ACAO); never crossorigin, fetch or canvas.
import type { CamDef } from '../../src/shared/types.ts';
import type { CamId } from './index.ts';

const DO = 'https://alta-webcams.sfo3.cdn.digitaloceanspaces.com';
const GCS = 'https://storage.googleapis.com';
const BASE = {
  resort: 'alta',
  pageUrl: 'https://www.alta.com/weather#mountain-cams',
  isStake: false,
  hero: false,
} as const;
const DO_STILL = { ...BASE, kind: 'do_still', refreshS: 180, timelapse: { provider: 'none' }, credit: 'Alta' } as const;
const PRISM = {
  ...BASE,
  kind: 'prism',
  refreshS: 300,
  timelapse: { provider: 'prism', mp4: true },
  credit: 'Alta · Prism',
} as const;

/** The Collins stake board is cleared at these local times (scrubber markers, the stake tile's note). */
export const ALTA_BOARD = { cam: 'alta-collins-stake', clears: ['04:00', '16:00'] } as const satisfies {
  cam: CamId;
  clears: readonly [string, string];
};

// biome-ignore format: dense registry, one cam per 2-4 lines
export const ALTA_CAMS = [
  // STAKE, 1920x1080. Board cleared at ALTA_BOARD.clears; source updates about every 5 min (refreshS 120).
  // Timelapse is our own archive (job stake-alta); the wall tile shows the latest archive frame.
  { ...DO_STILL, id: 'alta-collins-stake', name: 'Collins Snow Stake', refreshS: 120, isStake: true,
    timelapse: { provider: 'archive' }, archive: { everyMin: 5 },
    still: { card: `${DO}/Collins_Snow_Stake.jpg?t={m}`, detail: `${DO}/Collins_Snow_Stake.jpg?t={m}`,
      wall: `${DO}/Collins_Snow_Stake.jpg?t={m}` } },
  { ...DO_STILL, id: 'alta-mount-superior', name: 'Mount Superior', // ~0.5 MB
    still: { card: `${DO}/Superior.jpg?t={m}`, detail: `${DO}/Superior.jpg?t={m}`, wall: `${DO}/Superior.jpg?t={m}` } },
  { ...DO_STILL, id: 'alta-high-rustler', name: 'High Rustler', // hero fallback #3
    still: { card: `${DO}/Highrustler.jpg?t={m}`, detail: `${DO}/Highrustler.jpg?t={m}`, wall: `${DO}/Highrustler.jpg?t={m}` } },
  { ...DO_STILL, id: 'alta-sugarloaf-peak', name: 'Sugarloaf Peak',
    still: { card: `${DO}/sugar_peak.jpg?t={m}`, detail: `${DO}/sugar_peak.jpg?t={m}`, wall: `${DO}/sugar_peak.jpg?t={m}` } },
  { ...DO_STILL, id: 'alta-east-greeley', name: 'East Greeley', // ~0.75 MB
    still: { card: `${DO}/Greeley.jpg?t={m}`, detail: `${DO}/Greeley.jpg?t={m}`, wall: `${DO}/Greeley.jpg?t={m}` } },
  { ...DO_STILL, id: 'alta-salt-lake-valley', name: 'Salt Lake Valley',
    still: { card: `${DO}/collins_dtc.jpg?t={m}`, detail: `${DO}/collins_dtc.jpg?t={m}`, wall: `${DO}/collins_dtc.jpg?t={m}` } },
  // Prism 00065: hero fallback #2. Timelapse = prism 24 h (cam_init, §6.3) + MP4. Fullscreen 3k.jpg?t={m}.
  { ...PRISM, id: 'alta-albion-basin', name: 'Albion Basin',
    still: { card: `${GCS}/prism-cam-00065/360.jpg?t={m}`, detail: `${GCS}/prism-cam-00065/1080.jpg?t={m}`,
      wall: `${GCS}/prism-cam-00065/1080.jpg?t={m}` } },
  // Prism 00088: HERO; falls back to albion-basin, then high-rustler (current.txt older than 45 min = stale).
  { ...PRISM, id: 'alta-mount-baldy', name: 'Mount Baldy', hero: true, fallback: ['alta-albion-basin', 'alta-high-rustler'],
    still: { card: `${GCS}/prism-cam-00088/360.jpg?t={m}`, detail: `${GCS}/prism-cam-00088/1080.jpg?t={m}`,
      wall: `${GCS}/prism-cam-00088/1080.jpg?t={m}` } },
] as const satisfies readonly CamDef[];
