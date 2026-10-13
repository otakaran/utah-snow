// YouTube live cams (Brighton, Solitude): {id} is the video ID /api/cams resolved from yt:state (§6.1), else the
// seed in config/youtube.ts (keyless first paint). Stills are *_live.jpg thumbnails; a maxres thumbnail that loads
// as YouTube's 120 px placeholder is swapped for hqdefault_live (§4.3 YT convention).
import { SLOTS } from '../../../../../config/youtube.ts';
import { ytHqFallback } from '../../../../shared/cam-url.ts';
import type { CamApiState } from '../../../data/cams.ts';
import { type KindSpec, refreshCadence } from './kind.ts';

const SEEDS = new Map<string, string>();
for (const slots of Object.values(SLOTS)) {
  for (const slot of slots) if ('seed' in slot) SEEDS.set(slot.cam, slot.seed);
}

/** The video ID to embed: /api/cams first, then the config seed. */
export function ytVideoId(camId: string, state: CamApiState | undefined): string | null {
  if (state?.live?.type === 'youtube') return state.live.videoId;
  return SEEDS.get(camId) ?? null;
}

export const youtube: KindSpec = {
  player: 'youtube',
  cadenceMin: refreshCadence,
  vars: (def, state) => ({ id: ytVideoId(def.id, state) }),
  isPlaceholder: (img) => img.naturalWidth === 120,
  altUrl: ytHqFallback,
};
