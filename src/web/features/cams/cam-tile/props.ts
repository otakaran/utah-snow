// CamTile's public props and its view modes (split from ../CamTile.tsx, which re-exports CamTileProps).
import type { ComponentChildren } from 'preact';
import type { CamDef, ResortId } from '../../../../shared/types.ts';
import type { Variant } from '../cam-view.ts';

export interface CamTileProps {
  /** A cam id from config/cams (unknown ids render nothing), or pass `cam`. */
  id?: string;
  cam?: CamDef;
  /** Which still template: 'card' (default, smallest), 'detail' or 'wall' (skips the on-screen checks). */
  variant?: Variant;
  /** ★ in the caption; defaults to `cam.resort === pick`. */
  star?: boolean;
  pick?: ResortId | null;
  /** Start live by itself (wall stake tiles by day), only within the HLS/YouTube caps and never in data saver. */
  autoLive?: boolean;
  /** Keep refreshing in data saver (the stake row). */
  keepFresh?: boolean;
  /** Seconds between still refreshes instead of the cam's refreshS (the wall's night stills: 120). */
  everyS?: number;
  /** Show the newest archived frame when /api/cams has one (wall Alta Collins). */
  archive?: boolean;
  /** YouTube DVR Rewind buttons (resort detail page only). */
  rewind?: boolean;
  /** Caption under the image (default) or on a plate over it (default on the wall). */
  caption?: 'below' | 'overlay';
  /** Caption name instead of the cam's own. */
  label?: string;
  /** Resort name before the cam name in the caption (default true); alt text and labels always carry it. */
  showResort?: boolean;
  /** An extra caption line, e.g. Alta's "since 04:00 board clear". */
  note?: ComponentChildren;
  /** Drawn over the still, e.g. an inch plate. */
  overlay?: ComponentChildren;
}

/** still (with an optional note), live (in the tile or the Lightbox), zoomed still or the timelapse scrubber. */
export type Mode =
  | { m: 'still'; note: string | null }
  | { m: 'live'; inBox: boolean; auto: boolean }
  | { m: 'zoom'; src: string | null }
  | { m: 'scrub' };

export const STILL: Mode = { m: 'still', note: null };

/** Smaller tiles open live video in the Lightbox (YouTube needs at least 200x200). */
export const MIN_PLAYER_PX = 200;
