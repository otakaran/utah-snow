// Mountain shapes for the ridge chart, drawn in a 100 x 100 box (x to the right, y down, the ground at y = 100)
// that Ridge.tsx stretches to each peak's width and height. Pure geometry, unit-tested in ridge-shape.test.ts.
// An outline runs left to right with x always growing, so the rock is everything under it: a point (x, y) is inside
// exactly when y >= the outline's height at x. The snow cap is the rock above a snow line, with teeth hanging below
// it; the shade is the face to the right of the summit.

export type Pt = readonly [number, number];

/** A massif with a fore-summit on its left, a broad one with a shelf on its right, a steep one with two shoulders. */
const BASE: readonly (readonly Pt[])[] = [
  [
    [0, 100],
    [20, 60],
    [27, 67],
    [47, 0],
    [63, 40],
    [70, 38],
    [100, 100],
  ],
  [
    [0, 100],
    [16, 74],
    [31, 50],
    [38, 47],
    [53, 0],
    [100, 100],
  ],
  [
    [0, 100],
    [14, 76],
    [23, 72],
    [50, 0],
    [60, 26],
    [67, 24],
    [84, 64],
    [89, 62],
    [100, 100],
  ],
];

const mirror = (o: readonly Pt[]): Pt[] => o.map(([x, y]): Pt => [100 - x, y]).reverse();

/** The outline of peak `i`: three shapes, mirrored on their second round, so six neighbours all differ. */
export function outlineOf(i: number): readonly Pt[] {
  const base = BASE[i % BASE.length] as readonly Pt[];
  return Math.floor(i / BASE.length) % 2 === 1 ? mirror(base) : base;
}

const summit = (o: readonly Pt[]): Pt => o.reduce((top, p) => (p[1] < top[1] ? p : top));

/** The outline's height at x (linear between its corners). */
export function heightAt(o: readonly Pt[], x: number): number {
  for (let i = 0; i < o.length - 1; i++) {
    const [ax, ay] = o[i] as Pt;
    const [bx, by] = o[i + 1] as Pt;
    if (x >= ax && x <= bx) return bx === ax ? Math.min(ay, by) : ay + ((x - ax) / (bx - ax)) * (by - ay);
  }
  return 100;
}

/**
 * The snow caps: one polygon per stretch of the outline above `line` (a fore-summit gets its own once the snow
 * line drops below it). Each runs along the outline, then back under the snow line in teeth of depth `tooth`.
 */
export function capPolygons(o: readonly Pt[], line: number, tooth = 9): Pt[][] {
  const caps: Pt[][] = [];
  let run: Pt[] | null = null;
  for (let i = 0; i < o.length - 1; i++) {
    const a = o[i] as Pt;
    const b = o[i + 1] as Pt;
    const aIn = a[1] < line;
    const bIn = b[1] < line;
    if (aIn !== bIn) {
      const t = (line - a[1]) / (b[1] - a[1]);
      const cut: Pt = [a[0] + t * (b[0] - a[0]), line];
      if (bIn) run = [cut];
      else if (run) {
        caps.push(withTeeth([...run, cut], tooth));
        run = null;
      }
    }
    if (bIn && run) run.push(b);
  }
  return caps;
}

/** Closes a cap from its right end back to its left: wide caps get two teeth, narrow ones a single one. */
function withTeeth(run: Pt[], tooth: number): Pt[] {
  const [xl, line] = run[0] as Pt;
  const xr = (run[run.length - 1] as Pt)[0];
  const n = xr - xl > 24 ? 4 : 2;
  const depth = Math.min(tooth, (100 - line) * 0.5);
  for (let k = 1; k < n; k++) run.push([xr - (k * (xr - xl)) / n, k % 2 === 1 ? line + depth : line]);
  return run;
}

/** The shaded face: from the summit down the right-hand outline, back along the ground and up a bent spine. */
export function shadePolygon(o: readonly Pt[]): Pt[] {
  const top = summit(o);
  const right = o.filter((p) => p[0] > top[0]);
  const foot = Math.min(96, top[0] + 9);
  return [top, ...right, [foot, 100], [top[0] + 2, 62], [top[0] + 6, 34]];
}

/** How far down the snow reaches, in box units from the summit: a dusting whitens the top fifth, the deepest
 * night of the six about three fifths. `share` is this peak's inches against the night's tallest (0..1). */
export const snowLine = (share: number): number => 20 + 40 * Math.max(0, Math.min(1, share));

/** 'x,y x,y …' for an SVG polygon's `points`. */
export const points = (poly: readonly Pt[]): string =>
  poly.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(' ');
