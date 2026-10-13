// TV wall (spec §8.4). Data only: the `set` -> resorts / ★ road-cam corridors / labels table (★ =
// CORRIDORS[c].briefingCams in config/roads.ts; its keys are the #/wall `set` values), the pinned row, the featured
// YouTube cell's first cam, the day window, the reload time, the canvas and the launcher breakpoint.
import type { Corridor, ResortId } from '../src/shared/types.ts';
import type { CamId } from './cams/index.ts';
import { RESORT_IDS } from './resorts.ts';

export interface WallSetDef {
  resorts: readonly ResortId[];
  /** Corridors whose ★ road cams follow the resort cams. */
  corridors: readonly Corridor[];
  /** Stake cams only (no heroes, no road cams). */
  stakesOnly?: boolean;
  /** The wall footer's name and the settings select's longer label. */
  short: string;
  long: string;
}

const SETS = {
  all: {
    resorts: RESORT_IDS,
    corridors: ['lcc', 'bcc', 'parleys', 'snowbasin'],
    short: 'All resorts',
    long: 'Every resort + every starred road cam',
  },
  stakes: { resorts: RESORT_IDS, corridors: [], stakesOnly: true, short: 'Stakes', long: 'Stake cams only' },
  lcc: {
    resorts: ['alta', 'snowbird'],
    corridors: ['lcc'],
    short: 'Little Cottonwood',
    long: 'Little Cottonwood (Alta, Snowbird)',
  },
  bcc: {
    resorts: ['brighton', 'solitude'],
    corridors: ['bcc'],
    short: 'Big Cottonwood',
    long: 'Big Cottonwood (Brighton, Solitude)',
  },
  pc: { resorts: ['deer-valley'], corridors: ['parleys'], short: 'Park City', long: 'Park City (Deer Valley)' },
  ogden: { resorts: ['snowbasin'], corridors: ['snowbasin'], short: 'Ogden', long: 'Ogden (Snowbasin)' },
} as const satisfies Record<string, WallSetDef>;

/** A #/wall `set`. */
export type WallSet = keyof typeof SETS;
export const WALL_SET_DEFS: Readonly<Record<WallSet, WallSetDef>> = SETS;
/** ←/→ order on the wall and the settings select's order. */
export const WALL_SETS: readonly WallSet[] = Object.keys(SETS) as WallSet[];

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

/** The wall's design canvas (CSS px): other screens show it zoomed to fit, letterboxed. */
export const WALL_CANVAS = { width: 1920, height: 1080 } as const;

/** Narrower screens (phones, tablets, a small window) get the #/wall launcher instead of the wall (CSS px). */
export const WALL_MIN_WIDTH = 1280;
