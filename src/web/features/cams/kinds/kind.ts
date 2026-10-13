// What a cam provider kind changes in the client (spec §4.3, §8.3). One file per CamKind implements it;
// index.ts maps every CamKind to its spec, so a new kind fails tsc until its file exists.
import type { CamUrlVars } from '../../../../shared/cam-url.ts';
import type { CamDef } from '../../../../shared/types.ts';
import type { CamApiState } from '../../../data/cams.ts';

export interface KindSpec {
  /** The player a tap opens, or null for still-only providers. */
  player: 'hls' | 'youtube' | 'iframe' | null;
  /**
   * Minutes the upstream picture may already be old when it loads. Captions without a cams:status asOf show
   * 'up to N min' from the load time plus this; 0 means the image is rendered on request (HDRelay snapshot).
   */
  cadenceMin: (def: CamDef, url: string) => number;
  /** Template variables beyond the time buckets ({id}, {hls}). */
  vars: (def: CamDef, state: CamApiState | undefined) => CamUrlVars;
  /** A large still (animated GIF) that waits for a tap while data saver is on. */
  heavy?: (url: string) => boolean;
  /** True when a loaded still is really the provider's stand-in (YouTube's 120 px maxres placeholder). */
  isPlaceholder?: (img: HTMLImageElement) => boolean;
  /** The URL to use instead once a placeholder was seen; later refreshes of that cam and variant keep using it. */
  altUrl?: (url: string) => string | null;
  /** False for cams that must never start playing on their own (wall autoplay). */
  autoplay?: (def: CamDef) => boolean;
}

/** Default cadence: the registry's refresh period, which tracks how often the provider uploads. */
export const refreshCadence = (def: CamDef): number => Math.ceil(def.refreshS / 60);

export const noVars = (): CamUrlVars => ({});
