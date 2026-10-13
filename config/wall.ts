// TV wall (spec §8.4). Data only: the `set` -> resorts / ★ road-cam corridors table (★ = CORRIDORS[c].briefingCams
// in config/roads.ts), the pinned row, the featured YouTube cell's first cam, the day window and the reload time.
// Keys of WALL_SET_DEFS match router.ts WallSet; features/wall/rotation.ts checks that at compile time.
import type { Corridor, ResortId } from '../src/shared/types.ts';
import type { CamId } from './cams/index.ts';

export interface WallSetDef {
  resorts: readonly ResortId[];
  /** Corridors whose ★ road cams follow the resort cams. */
  corridors: readonly Corridor[];
  /** Stake cams only (no heroes, no road cams). */
  stakesOnly?: boolean;
}

const EVERY_RESORT = ['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley', 'snowbasin'] as const;

export const WALL_SET_DEFS = {
  all: { resorts: EVERY_RESORT, corridors: ['lcc', 'bcc', 'parleys', 'snowbasin'] },
  stakes: { resorts: EVERY_RESORT, corridors: [], stakesOnly: true },
  lcc: { resorts: ['alta', 'snowbird'], corridors: ['lcc'] },
  bcc: { resorts: ['brighton', 'solitude'], corridors: ['bcc'] },
  pc: { resorts: ['deer-valley'], corridors: ['parleys'] },
  ogden: { resorts: ['snowbasin'], corridors: ['snowbasin'] },
} as const satisfies Record<string, WallSetDef>;

/** Row 1: Alta Collins (newest archived frame), Snowbird and Snowbasin stakes (HLS by day, stills at night). */
export const WALL_PINNED = [
  'alta-collins-stake',
  'snowbird-snowstake',
  'snowbasin-snowstake',
] as const satisfies readonly CamId[];

/** The featured YouTube cell (bottom right) starts with this cam. */
export const WALL_YT_FIRST: CamId = 'solitude-snowstake';

/** Night stake tiles: cams shown by their still instead (the Solitude stake via Ski Utah). */
export const WALL_NIGHT_STILL: Partial<Record<CamId, CamId>> = { 'solitude-snowstake': 'solitude-snowstake-still' };

/** Day window (local): live HLS/YouTube only inside it; night mode outside. */
export const WALL_DAY = { from: '06:30', to: '18:30' } as const;

/** Stake stills refresh every 120 s at night. */
export const WALL_NIGHT_STILL_S = 120;

/** The daily reload happens on the first tick at or after this local time on a new day. */
export const WALL_RELOAD_HM = '03:30';
