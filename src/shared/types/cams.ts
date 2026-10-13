// Cam registry shapes (spec §4.3). Imported through src/shared/types.ts, never directly.
// Arrays are readonly so config/cams can use `as const satisfies readonly CamDef[]`.
import type { ResortId } from './resort.ts';
import type { Corridor } from './roads.ts';

export type CamKind =
  | 'do_still'
  | 'prism'
  | 'hdrelay'
  | 'roundshot'
  | 'roundshot360'
  | 'youtube'
  | 'camstreamer_youtube'
  | 'skiutah'
  | 'udot'
  | 'udot_vms';

export interface CamDef {
  id: string;
  resort: ResortId | null;
  corridor?: Corridor;
  name: string;
  kind: CamKind;
  /** URL templates; only src/shared/cam-url.ts expands their placeholders. */
  still: { card: string; detail: string; wall: string };
  /** dvr: detail-page Rewind, hidden if getDuration() < 3600. */
  live?: { type: 'hls' | 'youtube' | 'iframe'; url?: string; playerGuid?: string; cameraId?: string; dvr?: boolean };
  pageUrl: string;
  /** Applies everywhere, TV wall included. */
  refreshS: number;
  isStake: boolean;
  hero: boolean;
  /** Cam ids shown in order while this cam is stale/offline/not live. */
  fallback?: readonly string[];
  /** source = cam whose archive is used (default: self). */
  timelapse: { provider: 'archive' | 'hdrelay' | 'prism' | 'roundshot' | 'none'; source?: string; mp4?: boolean };
  /** The Worker archives this still to KV (§6.3). */
  archive?: { everyMin: 5 | 15 };
  seasonal?: boolean;
  hiddenUntilFresh?: boolean;
  offlineGated?: boolean;
  alternate?: boolean;
  detailOnly?: boolean;
  credit: string;
  /** From master-playlist BANDWIDTH (Appendix A). */
  bitrateMbps?: number;
}
