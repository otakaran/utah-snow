import { describe, expect, it } from 'vitest';
import { HEROES } from '../../../../config/cams/index.ts';
import { CORRIDORS } from '../../../../config/roads.ts';
import { WALL_PINNED } from '../../../../config/wall.ts';
import type { CamDef } from '../../../shared/types.ts';
import { WALL_SETS } from '../../router.ts';
import { nightStakes, pageCount, pageOf, setCams, stepSet, wxSequence, ytOrder } from './rotation.ts';

const ids = (list: readonly { id: string }[]) => list.map((c) => c.id);

describe('pageOf', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  it('cycles through pageCount pages of 5, the last one filled from the start, none repeating a cam', () => {
    expect(pageCount(list.length, 5)).toBe(2);
    expect(pageOf(list, 0, 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(pageOf(list, 1, 5)).toEqual(['f', 'g', 'a', 'b', 'c']);
    expect(pageOf(list, 2, 5)).toEqual(pageOf(list, 0, 5));
    expect(pageCount(0, 5)).toBe(1);
  });
  it('returns a list that fits on one page whole', () => {
    expect(pageOf(['a', 'b'], 3, 5)).toEqual(['a', 'b']);
    expect(pageOf([], 1, 5)).toEqual([]);
  });
});

describe('wxSequence', () => {
  const run = (wx: number, steps: number) => Array.from({ length: steps }, (_, n) => wxSequence(n, wx));
  const shown = (seq: ReturnType<typeof run>) => seq.map((s) => (s.weather ? 'W' : s.camPage));

  it('shows a weather page after every wx cam pages, and never with wx 0', () => {
    expect(shown(run(0, 6))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(shown(run(1, 7))).toEqual([0, 'W', 1, 'W', 2, 'W', 3]);
    expect(shown(run(4, 11))).toEqual([0, 1, 2, 3, 'W', 4, 5, 6, 7, 'W', 8]);
  });
  it('never skips or repeats a cam page, and a weather step carries the next one', () => {
    for (const wx of [0, 1, 2, 4, 24]) {
      const cams = run(wx, 200).filter((s) => !s.weather);
      expect(cams.map((s) => s.camPage)).toEqual(cams.map((_, i) => i));
    }
    expect(wxSequence(4, 4)).toEqual({ weather: true, camPage: 4 });
  });
  it('clamps wx to WALL_LIMITS and the step to a whole number from 0', () => {
    expect(shown(run(-3, 3))).toEqual([0, 1, 2]);
    expect(wxSequence(24, 99)).toEqual({ weather: true, camPage: 24 });
    expect(wxSequence(25, 99)).toEqual({ weather: false, camPage: 24 });
    expect(wxSequence(-2, 1)).toEqual({ weather: false, camPage: 0 });
    expect(wxSequence(1.7, 1)).toEqual({ weather: true, camPage: 1 });
    expect(wxSequence(Number.NaN, 4)).toEqual({ weather: false, camPage: 0 });
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
