// Snowbasin cams, spec Appendix A.6 (9). Data only: resolvers live in src/worker/sources/, placeholders expand in
// src/shared/cam-url.ts. HDRelay rows: playerGuid -> cameraId; "snapshot" = {hls}/camera/{cid}/snapshot?t={m};
// "gated" timelapse = scrubber only while frames/info.last < 30 min old. Prism: same conventions as Alta.
import type { CamDef } from '../../src/shared/types.ts';

const IMG = 'https://img.hdrelay.com/frames';
const HLS = '{hls}/camera';
const GCS = 'https://storage.googleapis.com';
const BASE = {
  resort: 'snowbasin',
  pageUrl: 'https://www.snowbasin.com/the-mountain/web-cams/',
  isStake: false,
  hero: false,
} as const;
const HDRELAY = {
  ...BASE,
  kind: 'hdrelay',
  refreshS: 60,
  timelapse: { provider: 'none' },
  credit: 'Snowbasin · HDRelay',
} as const;
const PRISM = {
  ...BASE,
  kind: 'prism',
  refreshS: 300,
  timelapse: { provider: 'prism', mp4: true },
  credit: 'Snowbasin · Prism',
} as const;

// biome-ignore format: dense registry, one cam per 3-5 lines
export const SNOWBASIN_CAMS = [
  // STAKE. hdrelay frames since 2026-02-07. Show "Last Snow" only if hotlinkTime >= frames/info.first.
  { ...HDRELAY, id: 'snowbasin-snowstake', name: 'Snow Stake', isStake: true, bitrateMbps: 2.79, refreshS: 300,
    timelapse: { provider: 'hdrelay' },
    live: { type: 'hls', url: `${HLS}/09f922af-169d-4949-9bb7-295c6a859daa/relay/playlist.m3u8`,
      playerGuid: 'f9e1b19a-a72f-4319-8c01-0fd3e4392efb', cameraId: '09f922af-169d-4949-9bb7-295c6a859daa' },
    still: { card: `${IMG}/09f922af-169d-4949-9bb7-295c6a859daa/default/last.jpg/:/rs=h:360?t={m5}`,
      detail: `${HLS}/09f922af-169d-4949-9bb7-295c6a859daa/snapshot?t={m}`,
      wall: `${HLS}/09f922af-169d-4949-9bb7-295c6a859daa/snapshot?t={m}` } },
  { ...HDRELAY, id: 'snowbasin-earls-plaza', name: "Earl's Plaza", bitrateMbps: 0.74,
    live: { type: 'hls', url: `${HLS}/6192dd615233cdcad76d7dba/relay/playlist.m3u8`,
      playerGuid: '6192dda05233cdcad76d7dbb', cameraId: '6192dd615233cdcad76d7dba' },
    still: { card: `${HLS}/6192dd615233cdcad76d7dba/snapshot?t={m}`, detail: `${HLS}/6192dd615233cdcad76d7dba/snapshot?t={m}`,
      wall: `${HLS}/6192dd615233cdcad76d7dba/snapshot?t={m}` } },
  { ...HDRELAY, id: 'snowbasin-needles', name: 'Needles', hero: true, bitrateMbps: 0.59,
    live: { type: 'hls', url: `${HLS}/1b6ed87c-f919-4e59-b9cc-7480e3ca31c3/relay/playlist.m3u8`,
      playerGuid: '5af99fc0-02f8-4dc2-8e9a-ba20ad3093c5', cameraId: '1b6ed87c-f919-4e59-b9cc-7480e3ca31c3' },
    still: { card: `${HLS}/1b6ed87c-f919-4e59-b9cc-7480e3ca31c3/snapshot?t={m}`,
      detail: `${HLS}/1b6ed87c-f919-4e59-b9cc-7480e3ca31c3/snapshot?t={m}`,
      wall: `${HLS}/1b6ed87c-f919-4e59-b9cc-7480e3ca31c3/snapshot?t={m}` } },
  // 4K (3840x2160): never autoplay; snapshot ~0.8 MB. Timelapse gated, position=panorama, always /:/rs=h:720
  // (last frame 2026-10-01).
  { ...HDRELAY, id: 'snowbasin-strawberry-patio', name: 'Strawberry Patio', bitrateMbps: 1.65,
    timelapse: { provider: 'hdrelay' },
    live: { type: 'hls', url: `${HLS}/65652b36eb0e282336694064/relay/playlist.m3u8`,
      playerGuid: '65652b917efa88233092a64d', cameraId: '65652b36eb0e282336694064' },
    still: { card: `${HLS}/65652b36eb0e282336694064/snapshot?t={m}`, detail: `${HLS}/65652b36eb0e282336694064/snapshot?t={m}`,
      wall: `${HLS}/65652b36eb0e282336694064/snapshot?t={m}` } },
  { ...HDRELAY, id: 'snowbasin-base-area', name: 'Base Area', bitrateMbps: 2.44,
    live: { type: 'hls', url: `${HLS}/621944828db58d080b9eac8b/relay/playlist.m3u8`,
      playerGuid: '621944fbaaab8d0820944246', cameraId: '621944828db58d080b9eac8b' },
    still: { card: `${HLS}/621944828db58d080b9eac8b/snapshot?t={m}`, detail: `${HLS}/621944828db58d080b9eac8b/snapshot?t={m}`,
      wall: `${HLS}/621944828db58d080b9eac8b/snapshot?t={m}` } },
  { ...HDRELAY, id: 'snowbasin-middle-bowl-base', name: 'Middle Bowl Base', bitrateMbps: 1.19, refreshS: 300,
    timelapse: { provider: 'hdrelay' },
    live: { type: 'hls', url: `${HLS}/62101a0b8db58d080b9eac83/relay/playlist.m3u8`,
      playerGuid: '62101bfb8db58d080b9eac84', cameraId: '62101a0b8db58d080b9eac83' },
    still: { card: `${IMG}/62101a0b8db58d080b9eac83/default/last.jpg/:/rs=h:360?t={m5}`,
      detail: `${HLS}/62101a0b8db58d080b9eac83/snapshot?t={m}`, wall: `${HLS}/62101a0b8db58d080b9eac83/snapshot?t={m}` } },
  // Timelapse gated, position=panorama (last frame 2026-10-01).
  { ...HDRELAY, id: 'snowbasin-base-of-wildcat', name: 'Base of Wildcat', bitrateMbps: 0.62,
    timelapse: { provider: 'hdrelay' },
    live: { type: 'hls', url: `${HLS}/61e1c2e0faf0bf0b5629ac59/relay/playlist.m3u8`,
      playerGuid: '61e1c348e73e870b5583f203', cameraId: '61e1c2e0faf0bf0b5629ac59' },
    still: { card: `${HLS}/61e1c2e0faf0bf0b5629ac59/snapshot?t={m}`, detail: `${HLS}/61e1c2e0faf0bf0b5629ac59/snapshot?t={m}`,
      wall: `${HLS}/61e1c2e0faf0bf0b5629ac59/snapshot?t={m}` } },
  // Prism 00054: timelapse = prism 24 h (cam_init images[].path, §6.3) + MP4.
  { ...PRISM, id: 'snowbasin-mt-ogden', name: 'Mt. Ogden',
    still: { card: `${GCS}/prism-cam-00054/360.jpg?t={m}`, detail: `${GCS}/prism-cam-00054/1080.jpg?t={m}`,
      wall: `${GCS}/prism-cam-00054/1080.jpg?t={m}` } },
  // Prism 00115: same as Mt. Ogden.
  { ...PRISM, id: 'snowbasin-john-paul', name: 'John Paul', refreshS: 600,
    still: { card: `${GCS}/prism-cam-00115/360.jpg?t={m}`, detail: `${GCS}/prism-cam-00115/1080.jpg?t={m}`,
      wall: `${GCS}/prism-cam-00115/1080.jpg?t={m}` } },
] as const satisfies readonly CamDef[];
