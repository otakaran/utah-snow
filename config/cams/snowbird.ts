// Snowbird cams, spec Appendix A.2 (8). Data only: resolvers live in src/worker/sources/, placeholders expand in
// src/shared/cam-url.ts. HDRelay rows: playerGuid -> cameraId; "snapshot" = {hls}/camera/{cid}/snapshot?t={m};
// live HLS needs a browser UA (curl UA gets 405). "gated" timelapse = scrubber only while frames/info.last < 30 min old.
// Roundshot rows: hash in the URLs, storage id in the comment; daylight frames every 10 min.
// Excluded: header tile a0de9878-d7b7-4906-9e83-536fde35c8a9 (an Eastern-time cam).
import type { CamDef } from '../../src/shared/types.ts';

const IMG = 'https://img.hdrelay.com/frames';
const HLS = '{hls}/camera';
const RS = 'https://backend.roundshot.com/cams';
const PAGE = 'https://www.snowbird.com/the-mountain/webcams/view-all-webcams';
const BASE = { resort: 'snowbird', isStake: false, hero: false } as const;
const HDRELAY = {
  ...BASE,
  kind: 'hdrelay',
  refreshS: 60,
  timelapse: { provider: 'hdrelay' },
  credit: 'Snowbird · HDRelay',
} as const;
const ROUNDSHOT = {
  ...BASE,
  kind: 'roundshot',
  refreshS: 300,
  timelapse: { provider: 'roundshot' },
  credit: 'Snowbird · Roundshot',
} as const;

// biome-ignore format: dense registry, one cam per 3-5 lines
export const SNOWBIRD_CAMS = [
  // STAKE; lit at night; reset time unknown (O9). hdrelay frames since 2026-06-24 (optional record speeds 120/1200).
  { ...HDRELAY, id: 'snowbird-snowstake', name: 'Snow Stake', isStake: true, bitrateMbps: 1.0,
    pageUrl: `${PAGE}/snowstake-webcam/`,
    live: { type: 'hls', url: `${HLS}/8611e276-7ee5-42c0-b8cd-d9e1890e1cd4/relay/playlist.m3u8`,
      playerGuid: '89313285-1928-4157-94d1-d91ba2e157ff', cameraId: '8611e276-7ee5-42c0-b8cd-d9e1890e1cd4' },
    still: { card: `${IMG}/8611e276-7ee5-42c0-b8cd-d9e1890e1cd4/default/last.jpg/:/rs=w:640?t={m5}`,
      detail: `${HLS}/8611e276-7ee5-42c0-b8cd-d9e1890e1cd4/snapshot?t={m}`,
      wall: `${HLS}/8611e276-7ee5-42c0-b8cd-d9e1890e1cd4/snapshot?t={m}` } },
  // PTZ, shared, so the view can change. Timelapse gated (last frame 2026-10-01).
  { ...HDRELAY, id: 'snowbird-peruvian-gulch', name: 'Peruvian Gulch', bitrateMbps: 1.69,
    pageUrl: `${PAGE}/peruvian-gulch-webcam/`,
    live: { type: 'hls', url: `${HLS}/544432bd-3910-4888-aa9f-14b6f51a7eb5/relay/playlist.m3u8`,
      playerGuid: '4d81541a-6812-42ff-bc3f-01199c68640b', cameraId: '544432bd-3910-4888-aa9f-14b6f51a7eb5' },
    still: { card: `${HLS}/544432bd-3910-4888-aa9f-14b6f51a7eb5/snapshot?t={m}`,
      detail: `${HLS}/544432bd-3910-4888-aa9f-14b6f51a7eb5/snapshot?t={m}`,
      wall: `${HLS}/544432bd-3910-4888-aa9f-14b6f51a7eb5/snapshot?t={m}` } },
  // Timelapse gated (last frame 2026-02-20).
  { ...HDRELAY, id: 'snowbird-mineral-basin', name: 'Top of Mineral Basin', bitrateMbps: 0.22,
    pageUrl: `${PAGE}/top-mineral-basin-webcam/`,
    live: { type: 'hls', url: `${HLS}/5780754f-8da1-4223-ab8a-6755d84cbc10/relay/playlist.m3u8`,
      playerGuid: '699a952a-e945-4993-bbe7-195018dc5d2f', cameraId: '5780754f-8da1-4223-ab8a-6755d84cbc10' },
    still: { card: `${HLS}/5780754f-8da1-4223-ab8a-6755d84cbc10/snapshot?t={m}`,
      detail: `${HLS}/5780754f-8da1-4223-ab8a-6755d84cbc10/snapshot?t={m}`,
      wall: `${HLS}/5780754f-8da1-4223-ab8a-6755d84cbc10/snapshot?t={m}` } },
  // PTZ. Timelapse gated (last frame 2026-10-01).
  { ...HDRELAY, id: 'snowbird-little-cloud', name: 'Little Cloud', bitrateMbps: 0.25,
    pageUrl: `${PAGE}/little-cloud-webcam/`,
    live: { type: 'hls', url: `${HLS}/db2a69c5-66e9-4c48-a713-919eaf191fc1/relay/playlist.m3u8`,
      playerGuid: '9d199d0e-5eb0-4773-bfe0-01c04a148c0e', cameraId: 'db2a69c5-66e9-4c48-a713-919eaf191fc1' },
    still: { card: `${HLS}/db2a69c5-66e9-4c48-a713-919eaf191fc1/snapshot?t={m}`,
      detail: `${HLS}/db2a69c5-66e9-4c48-a713-919eaf191fc1/snapshot?t={m}`,
      wall: `${HLS}/db2a69c5-66e9-4c48-a713-919eaf191fc1/snapshot?t={m}` } },
  // hdrelay frames show crowds.
  { ...HDRELAY, id: 'snowbird-tram-bullpen', name: 'Tram Bullpen', bitrateMbps: 0.56,
    pageUrl: `${PAGE}/tram-bullpen-webcam/`,
    live: { type: 'hls', url: `${HLS}/61b2490be101c00b9c48374f/relay/playlist.m3u8`,
      playerGuid: '61b26a78ad42770b90eb85cd', cameraId: '61b2490be101c00b9c48374f' },
    still: { card: `${IMG}/61b2490be101c00b9c48374f/default/last.jpg/:/rs=w:640?t={m5}`,
      detail: `${HLS}/61b2490be101c00b9c48374f/snapshot?t={m}`, wall: `${HLS}/61b2490be101c00b9c48374f/snapshot?t={m}` } },
  // HERO. Roundshot storage id 5da7581da7f568.58906703.
  { ...ROUNDSHOT, id: 'snowbird-hidden-peak', name: 'Hidden Peak', hero: true, pageUrl: `${PAGE}/hidden-peak-webcam/`,
    still: { card: `${RS}/44cfff4ff2a218a1178dbb105d95846a/optional?t={m5}`,
      detail: `${RS}/44cfff4ff2a218a1178dbb105d95846a/default?t={m5}`,
      wall: `${RS}/44cfff4ff2a218a1178dbb105d95846a/original?t={m5}` } },
  // Roundshot storage id 5da7589a5cfa88.31667145.
  { ...ROUNDSHOT, id: 'snowbird-powder-paradise', name: 'Powder Paradise', pageUrl: `${PAGE}/powder-paradise-webcam/`,
    still: { card: `${RS}/48fc223c0ed88474ecc2f884bf39de63/optional?t={m5}`,
      detail: `${RS}/48fc223c0ed88474ecc2f884bf39de63/default?t={m5}`,
      wall: `${RS}/48fc223c0ed88474ecc2f884bf39de63/original?t={m5}` } },
  // 2324x450 strip. Storage id 5d7715f0795180.06920267. Timelapse via https://snowbird.roundshot.com/structure.json.
  { ...ROUNDSHOT, kind: 'roundshot360', id: 'snowbird-hidden-peak-360', name: 'Hidden Peak 360', refreshS: 600,
    pageUrl: `${PAGE}/hidden-peak-360-webcam/`, live: { type: 'iframe', url: 'https://snowbird.roundshot.com/tv/' },
    still: { card: `${RS}/09123258cc29cd6e86d3af9a3836c150/medium?t={m5}`,
      detail: `${RS}/09123258cc29cd6e86d3af9a3836c150/medium?t={m5}`,
      wall: `${RS}/09123258cc29cd6e86d3af9a3836c150/medium?t={m5}` } },
] as const satisfies readonly CamDef[];
