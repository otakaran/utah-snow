// Pure wall paging (spec §8.4): which cams cells 1–5 page through for a `set` (heroes first, then the set's other
// cams, then its ★ road cams), one page of them, where the full-screen weather page falls in the rotation, the
// featured YouTube cell's order (Solitude stake first) and the night stake list. The caller keeps only the tiles the
// cams feature shows right now (visibleCams).
import { CAM_BY_ID, CAMS, HEROES, RESORT_CAMS, STAKE_ORDER } from '../../../../config/cams/index.ts';
import { CORRIDORS } from '../../../../config/roads.ts';
import {
  WALL_LIMITS,
  WALL_NIGHT_STILL,
  WALL_PINNED,
  WALL_SET_DEFS,
  WALL_YT_FIRST,
  type WallSet,
} from '../../../../config/wall.ts';
import type { CamDef } from '../../../shared/types.ts';

const PINNED: ReadonlySet<string> = new Set(WALL_PINNED);

const defs = (ids: readonly string[]): CamDef[] => ids.flatMap((id) => CAM_BY_ID.get(id) ?? []);
const uniq = (list: readonly CamDef[]): CamDef[] => [...new Map(list.map((c): [string, CamDef] => [c.id, c])).values()];

/**
 * Cells 1–5 of `set`, in order: heroes, the set's other cams (stakes first), then its ★ road cams. Pinned,
 * detail-only and seasonal (live-only) cams are left out.
 */
export function setCams(set: WallSet): CamDef[] {
  const def = WALL_SET_DEFS[set];
  const own = def.resorts.flatMap((r): readonly CamDef[] => RESORT_CAMS[r]);
  const usable = (c: CamDef) => !PINNED.has(c.id) && !c.detailOnly && !c.seasonal; // seasonal slots: live only
  if (def.stakesOnly) return own.filter((c) => c.isStake && usable(c));
  const heroes = defs(def.resorts.map((r) => HEROES[r]));
  const rest = own.filter((c) => !c.hero && usable(c)).sort((a, b) => Number(b.isStake) - Number(a.isStake));
  const roads = defs(def.corridors.flatMap((c) => CORRIDORS[c].briefingCams));
  return uniq([...heroes, ...rest, ...roads]);
}

/** Cells 1–5: the rotating stills. */
export const ROTATING = 5;

/** How many pages of `size` cells `count` cams fill (at least 1): the wall footer's "page 2/3". */
export const pageCount = (count: number, size: number): number => Math.max(1, Math.ceil(count / size));

/**
 * Page `page` (0, 1, 2 ...) of `list` in `size` cells, cycling through pageCount pages; the last page fills up
 * from the start, so no cam shows twice on one page. A list that fits in one page is returned whole.
 */
export function pageOf<T>(list: readonly T[], page: number, size: number): T[] {
  if (list.length <= size) return [...list];
  const start = (Math.max(0, Math.floor(page)) % pageCount(list.length, size)) * size;
  return Array.from({ length: size }, (_, i) => list[(start + i) % list.length] as T);
}

/**
 * Rotation step `n` (one `rotate` period each) with a weather page after every `wx` cam pages: step n is the weather
 * page when `wx > 0` and n % (wx + 1) === wx, and otherwise shows cam page n − floor(n / (wx + 1)), so cam pages
 * never skip or repeat. A weather step carries the cam page that follows it (the hidden grid already holds it).
 * `wx` clamps to WALL_LIMITS.wx; 0 never shows the weather page.
 */
export function wxSequence(n: number, wx: number): { weather: boolean; camPage: number } {
  const step = Math.max(0, Math.floor(n) || 0);
  const [lo, hi] = WALL_LIMITS.wx;
  const every = Math.min(hi, Math.max(lo, Math.floor(wx) || 0));
  if (every === 0) return { weather: false, camPage: step };
  return { weather: step % (every + 1) === every, camPage: step - Math.floor(step / (every + 1)) };
}

const isYt = (c: CamDef): boolean => c.live?.type === 'youtube';

/**
 * Cams the featured YouTube cell rotates through: the Solitude stake first, then the set's YouTube cams (stakes
 * only for `stakes`); a set without YouTube cams of its own (lcc, ogden) borrows every other one.
 */
export function ytOrder(set: WallSet): CamDef[] {
  const def = WALL_SET_DEFS[set];
  const first = defs([WALL_YT_FIRST]);
  const all = CAMS.filter((c) => isYt(c) && (!def.stakesOnly || c.isStake));
  const own = all.filter((c) => c.resort !== null && def.resorts.includes(c.resort));
  const rest = own.some((c) => c.id !== WALL_YT_FIRST) ? own : all;
  return uniq([...first, ...rest]);
}

/** Night tiles: the pinned row, then the other STAKE_ORDER stakes, each swapped for its night still if it has one. */
export function nightStakes(): CamDef[] {
  return uniq(defs([...WALL_PINNED, ...STAKE_ORDER].map((id) => WALL_NIGHT_STILL[id] ?? id)));
}

/** The next set for ←/→ in WALL_SETS order, wrapping. */
export function stepSet(sets: readonly WallSet[], current: WallSet, dir: 1 | -1): WallSet {
  const i = sets.indexOf(current);
  const next = (Math.max(0, i) + dir + sets.length) % sets.length;
  return sets[next] ?? current;
}
