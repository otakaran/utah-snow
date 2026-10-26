import { describe, expect, it } from 'vitest';
import { areaPath, barRects, linePath, linScale, niceMax, slotCenter, tickXs } from './chart.ts';

describe('linScale', () => {
  it('maps a domain onto a range, inverted ranges included, and a flat domain onto range[0]', () => {
    const y = linScale([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(2.5)).toBe(75);
    expect(y(10)).toBe(0);
    expect(linScale([20, 30], [0, 50])(25)).toBe(25);
    expect(linScale([5, 5], [0, 50])(7)).toBe(0);
  });
});

describe('niceMax', () => {
  it('rounds the largest value up to a nice step, never below the floor', () => {
    expect(niceMax([4.2, null, 1], 1)).toBe(5);
    expect(niceMax([12], 1)).toBe(15);
    expect(niceMax([6], 1)).toBe(6);
    expect(niceMax([45], 20)).toBe(50);
    expect(niceMax([0.3, 0.7], 0.5)).toBe(0.8);
    expect(niceMax([1, 2], 6)).toBe(6);
    expect(niceMax([null, 0], 0)).toBe(1);
  });
});

describe('barRects', () => {
  it('shares the width in slots with a gap and draws nulls as zero-height bars', () => {
    expect(barRects([5, null, 10], 30, 20, 10, 0.2)).toEqual([
      { x: 1, y: 10, width: 8, height: 10 },
      { x: 11, y: 20, width: 8, height: 0 },
      { x: 21, y: 0, width: 8, height: 20 },
    ]);
    expect(barRects([15], 10, 20, 10)[0]?.height).toBe(20); // clamped at the top
    expect(barRects([], 10, 20, 10)).toEqual([]);
  });
});

describe('linePath', () => {
  it('walks slot centers and restarts with M after a null', () => {
    expect(linePath([0, 5, null, 10], 40, 10, 0, 10)).toBe('M5 10 L15 5 M35 0');
    expect(linePath([null, null], 40, 10, 0, 10)).toBe('');
    expect(slotCenter(1, 3, 10)).toBe(5);
  });
});

describe('areaPath', () => {
  it('closes a polygon along hi then back along lo, one per run of known values', () => {
    expect(areaPath([1, 2, null, 1], [3, 4, null, 2], 40, 10, 4)).toBe('M5 2.5 L15 0 L15 5 L5 7.5 Z M35 5 L35 7.5 Z');
    expect(areaPath([null], [1], 10, 10, 4)).toBe('');
  });
});

describe('tickXs', () => {
  it('gives slot-center percentages every n slots', () => {
    expect(tickXs(8, 2)).toEqual([6.3, 31.3, 56.3, 81.3]);
    expect(tickXs(4, 1)).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(tickXs(0, 3)).toEqual([]);
  });
});
