// HDRelay frame archives (spec §6.3, §6.4), verified against img.hdrelay.com frames/info on 2026-10-12. Data only.
// Not taken from the player config: Peruvian's config says `panorama`, but its frames live under `default`.
// gated = the scrubber shows only while frames/info.last is under 30 min old (cams:status archive.enabled).
// fullRs = the resize applied to the scrubber's full frame instead of the original (Strawberry Patio is 3840x2160).
import type { CamId } from './index.ts';

export interface HdrelayArchive {
  position: 'default' | 'panorama';
  gated: boolean;
  fullRs?: string;
}

export const HDRELAY_ARCHIVES = {
  'snowbird-snowstake': { position: 'default', gated: false },
  'snowbird-tram-bullpen': { position: 'default', gated: false },
  'snowbasin-snowstake': { position: 'default', gated: false },
  'snowbasin-middle-bowl-base': { position: 'default', gated: false },
  'snowbird-peruvian-gulch': { position: 'default', gated: true },
  'snowbird-little-cloud': { position: 'default', gated: true },
  'snowbird-mineral-basin': { position: 'default', gated: true },
  'snowbasin-strawberry-patio': { position: 'panorama', gated: true, fullRs: 'h:720' },
  'snowbasin-base-of-wildcat': { position: 'panorama', gated: true },
} as const satisfies Partial<Record<CamId, HdrelayArchive>>;
