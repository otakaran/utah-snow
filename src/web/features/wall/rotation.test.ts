import { describe, expect, it } from 'vitest';
import { HEROES } from '../../../../config/cams/index.ts';
import { CORRIDORS } from '../../../../config/roads.ts';
import { WALL_PINNED } from '../../../../config/wall.ts';
import type { CamDef } from '../../../shared/types.ts';
import { WALL_SETS } from '../../router.ts';
import { nightStakes, pageOf, setCams, stepSet, ytOrder } from './rotation.ts';

const ids = (list: readonly { id: string }[]) => list.map((c) => c.id);

describe('pageOf', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  it('pages in cells of 5, wrapping so every cam gets a turn and none repeats on a page', () => {
    expect(pageOf(list, 0, 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(pageOf(list, 1, 5)).toEqual(['f', 'g', 'a', 'b', 'c']);
    expect(pageOf(list, 2, 5)).toEqual(['d', 'e', 'f', 'g', 'a']);
    expect(pageOf(list, 7, 5)).toEqual(pageOf(list, 0, 5)); // 35 % 7 === 0: the cycle restarts
  });
  it('returns a list that fits on one page whole', () => {
    expect(pageOf(['a', 'b'], 3, 5)).toEqual(['a', 'b']);
    expect(pageOf([], 1, 5)).toEqual([]);
  });
});

describe('setCams', () => {
  it('starts with the heroes, skips pinned, detail-only and seasonal cams, and ends with the ★ road cams', () => {
    for (const set of WALL_SETS) {
      const cams = setCams(set);
      expect(new Set(ids(cams)).size).toBe(cams.length);
      const pinned = (c: CamDef) => (WALL_PINNED as readonly string[]).includes(c.id);
      expect(cams.some((c) => pinned(c) || c.detailOnly || c.seasonal)).toBe(false);
    }
    const all = ids(setCams('all'));
    expect(all.slice(0, 6)).toEqual(Object.values(HEROES));
    expect(all.slice(-12)).toEqual(Object.values(CORRIDORS).flatMap((c) => c.briefingCams));
  });
  it('limits a canyon set to its resorts and corridor', () => {
    const lcc = setCams('lcc');
    expect(ids(lcc).slice(0, 2)).toEqual([HEROES.alta, HEROES.snowbird]);
    expect(lcc.every((c) => c.resort === 'alta' || c.resort === 'snowbird' || c.corridor === 'lcc')).toBe(true);
    expect(ids(lcc).slice(-3)).toEqual([...CORRIDORS.lcc.briefingCams]);
  });
  it('shows stakes only for the stakes set', () => {
    const stakes = setCams('stakes');
    expect(stakes.length).toBeGreaterThan(0);
    expect(stakes.every((c) => c.isStake)).toBe(true);
  });
});

describe('ytOrder', () => {
  it('puts the Solitude stake first and lends every YouTube cam to sets without their own', () => {
    for (const set of WALL_SETS) expect(ytOrder(set)[0]?.id).toBe('solitude-snowstake');
    expect(ytOrder('lcc').length).toBe(ytOrder('all').length);
    expect(
      ytOrder('pc')
        .slice(1)
        .every((c) => c.resort === 'deer-valley'),
    ).toBe(true);
    expect(ytOrder('stakes').every((c) => c.isStake && c.live?.type === 'youtube')).toBe(true);
  });
});

describe('nightStakes', () => {
  it('keeps the pinned row first and swaps the Solitude stake for its Ski Utah still', () => {
    const night = ids(nightStakes());
    expect(night.slice(0, 3)).toEqual([...WALL_PINNED]);
    expect(night).toContain('solitude-snowstake-still');
    expect(night).not.toContain('solitude-snowstake');
  });
});

describe('stepSet', () => {
  it('steps through the sets in both directions, wrapping', () => {
    expect(stepSet(WALL_SETS, 'all', 1)).toBe('stakes');
    expect(stepSet(WALL_SETS, 'all', -1)).toBe('ogden');
    expect(stepSet(WALL_SETS, 'ogden', 1)).toBe('all');
  });
});
