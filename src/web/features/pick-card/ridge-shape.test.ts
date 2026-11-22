import { describe, expect, it } from 'vitest';
import { capPolygons, heightAt, outlineOf, type Pt, points, shadePolygon, snowLine } from './ridge-shape.ts';

const TRIANGLE: Pt[] = [
  [0, 100],
  [50, 0],
  [100, 100],
];

describe('ridge shapes', () => {
  it('gives six neighbours six different outlines, each from ground to ground with x always growing', () => {
    const six = [0, 1, 2, 3, 4, 5].map(outlineOf);
    expect(new Set(six.map(points)).size).toBe(6);
    for (const o of six) {
      expect(o[0]).toEqual([0, 100]);
      expect(o[o.length - 1]).toEqual([100, 100]);
      expect(Math.min(...o.map((p) => p[1]))).toBe(0);
      for (let i = 1; i < o.length; i++) expect((o[i] as Pt)[0]).toBeGreaterThan((o[i - 1] as Pt)[0]);
    }
  });

  it('cuts a cap along the snow line and hangs its teeth inside the rock', () => {
    const [cap, ...more] = capPolygons(TRIANGLE, 40);
    expect(more).toHaveLength(0);
    expect(cap?.[0]).toEqual([30, 40]);
    expect(cap).toContainEqual([50, 0]);
    expect(cap).toContainEqual([70, 40]);
    expect(Math.max(...(cap ?? []).map((p) => p[1]))).toBe(49); // one tooth depth below the line
    for (const [x, y] of cap ?? []) expect(y).toBeGreaterThanOrEqual(heightAt(TRIANGLE, x) - 1e-9);
  });

  it('caps a fore-summit on its own once the snow line is below it, and nothing above every summit', () => {
    const o = outlineOf(0); // fore-summit at y = 60
    expect(capPolygons(o, 50)).toHaveLength(1);
    expect(capPolygons(o, 64).length).toBeGreaterThan(1);
    expect(capPolygons(o, 0)).toHaveLength(0);
    for (const i of [0, 1, 2, 3, 4, 5]) {
      for (const cap of capPolygons(outlineOf(i), snowLine(1))) {
        for (const [x, y] of cap) expect(y).toBeGreaterThanOrEqual(heightAt(outlineOf(i), x) - 1e-9);
      }
    }
  });

  it('keeps the shaded face inside the rock, and the snow line between a fifth and three fifths', () => {
    for (const i of [0, 1, 2, 3, 4, 5]) {
      const o = outlineOf(i);
      for (const [x, y] of shadePolygon(o)) expect(y).toBeGreaterThanOrEqual(heightAt(o, x) - 1e-9);
    }
    expect(snowLine(0)).toBe(20);
    expect(snowLine(1)).toBe(60);
    expect(snowLine(7)).toBe(60);
  });
});
