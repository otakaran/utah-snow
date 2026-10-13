// HDRelay (Snowbird 5, Snowbasin 7): live HLS from {hls}/camera/{cameraId}/relay/playlist.m3u8 (§6.2), stills from
// the on-request snapshot (age = load time) or the archive's last frame (age from cams:status). The host comes from
// the live URL /api/cams resolved from the daily player config, else today's b15 default.
import { DEFAULT_HLS_ORIGIN, hlsOrigin } from '../../../../shared/cam-url.ts';
import type { KindSpec } from './kind.ts';

/** 3840x2160 at 1.65 Mbps (A.6): plays only when tapped. */
const NEVER_AUTOPLAY: ReadonlySet<string> = new Set(['snowbasin-strawberry-patio']);

export const hdrelay: KindSpec = {
  player: 'hls',
  cadenceMin: (_def, url) => (url.includes('/snapshot') ? 0 : 5),
  vars: (_def, state) => ({
    hls: (state?.live?.type === 'hls' ? hlsOrigin(state.live.url) : null) ?? DEFAULT_HLS_ORIGIN,
  }),
  autoplay: (def) => !NEVER_AUTOPLAY.has(def.id),
};
