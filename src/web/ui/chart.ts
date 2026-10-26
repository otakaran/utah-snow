// Pure SVG geometry for the weather lanes (a Chart component draws it): linear scales, nice axis maxima, bar
// rectangles, line and band paths with null gaps, tick positions. No DOM. Coordinates round to 0.1 so paths stay
// short; bars, lines and ticks all sit on slot centers, so series in one lane line up hour for hour.

const round = (v: number): number => Math.round(v * 10) / 10;
const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A linear map from `domain` onto `range`; a zero-width domain maps everything to range[0]. */
export function linScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return () => r0;
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

const NICE = [1, 1.5, 2, 3, 4, 5, 6, 8, 10];

/** An axis top: the largest value (at least `floor`) rounded up to 1, 1.5, 2, 3, 4, 5, 6, 8 or 10 x a power of ten. */
export function niceMax(values: readonly (number | null)[], floor: number): number {
  const m = Math.max(floor, ...values.filter(finite));
  if (!(m > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(m));
  const step = NICE.find((s) => s * p >= m * (1 - 1e-9)) ?? 10;
  return Number((step * p).toPrecision(12));
}

/** The x of slot `i`'s center when `n` slots share width `w`. */
export const slotCenter = (i: number, n: number, w: number): number => round(((i + 0.5) * w) / n);

/** One bar per value, `gap` of each slot left empty; a null or non-positive value is a zero-height bar. */
export function barRects(values: readonly (number | null)[], w: number, h: number, max: number, gap = 0.3): Rect[] {
  const n = values.length;
  if (n === 0) return [];
  const slot = w / n;
  const width = slot * (1 - gap);
  const pad = (slot - width) / 2;
  return values.map((v, i) => {
    const height = finite(v) && max > 0 ? Math.max(0, Math.min(h, (v / max) * h)) : 0;
    return { x: round(i * slot + pad), y: round(h - height), width: round(width), height: round(height) };
  });
}

/** An SVG `d` through the values on slot centers; a null breaks the line and the next value starts a new `M`. */
export function linePath(values: readonly (number | null)[], w: number, h: number, min: number, max: number): string {
  const n = values.length;
  const y = linScale([min, max], [h, 0]);
  const out: string[] = [];
  let open = false;
  for (const [i, v] of values.entries()) {
    if (!finite(v)) {
      open = false;
      continue;
    }
    out.push(`${open ? 'L' : 'M'}${slotCenter(i, n, w)} ${round(y(v))}`);
    open = true;
  }
  return out.join(' ');
}

/** A closed band between `lo` and `hi` (0..max), one polygon per run where both are known. */
export function areaPath(
  lo: readonly (number | null)[],
  hi: readonly (number | null)[],
  w: number,
  h: number,
  max: number,
): string {
  const n = Math.min(lo.length, hi.length);
  const y = (v: number): number => round(max > 0 ? h - Math.max(0, Math.min(h, (v / max) * h)) : h);
  const out: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const top = run.map((i) => `${slotCenter(i, n, w)} ${y(hi[i] ?? 0)}`);
    const bottom = [...run].reverse().map((i) => `${slotCenter(i, n, w)} ${y(lo[i] ?? 0)}`);
    out.push(`M${top.join(' L')} L${bottom.join(' L')} Z`);
    run = [];
  };
  for (let i = 0; i < n; i++) {
    if (finite(lo[i]) && finite(hi[i])) run.push(i);
    else flush();
  }
  flush();
  return out.join(' ');
}

/** Slot-center positions of every `every`-th slot as percentages of the width (HTML tick labels: `left: X%`). */
export function tickXs(n: number, every: number): number[] {
  if (n <= 0 || every <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i += every) out.push(round(((i + 0.5) / n) * 100));
  return out;
}

/** The x of the boundary before slot `i` (midnight and day rules, shading edges sit between slots). */
export const slotEdge = (i: number, n: number, w: number): number => (n > 0 ? round((i * w) / n) : 0);

/** Slot `i`'s center as a percentage of the width (an HTML label's `left`). */
export const slotPct = (i: number, n: number): number => (n > 0 ? round(((i + 0.5) / n) * 100) : 0);

/** A value's height as a percentage from the top (an HTML label's `top`), clamped to 0..100. */
export function yPct(v: number, min: number, max: number): number {
  if (!(max > min)) return 100;
  return round(Math.max(0, Math.min(100, (1 - (v - min) / (max - min)) * 100)));
}

/** One full-height rect per [start, end) span of slots (night shading). */
export function spanRects(spans: readonly (readonly [number, number])[], n: number, w: number, h: number): Rect[] {
  return spans.map(([a, b]) => {
    const x = slotEdge(a, n, w);
    return { x, y: 0, width: round(slotEdge(b, n, w) - x), height: h };
  });
}

/** Two bars per slot side by side (`a` left, `b` right), together as wide as barRects' single bar. */
export function pairRects(
  a: readonly (number | null)[],
  b: readonly (number | null)[],
  w: number,
  h: number,
  max: number,
  gap = 0.3,
): [Rect[], Rect[]] {
  const n = Math.max(a.length, b.length);
  if (n === 0) return [[], []];
  const slot = w / n;
  const inner = slot * (1 - gap);
  const sep = inner * 0.12;
  const bw = (inner - sep) / 2;
  const bar = (v: number | null | undefined, x: number): Rect => {
    const height = finite(v) && max > 0 ? Math.max(0, Math.min(h, (v / max) * h)) : 0;
    return { x: round(x), y: round(h - height), width: round(bw), height: round(height) };
  };
  const left = (i: number) => i * slot + (slot - inner) / 2;
  return [
    Array.from({ length: n }, (_, i) => bar(a[i], left(i))),
    Array.from({ length: n }, (_, i) => bar(b[i], left(i) + bw + sep)),
  ];
}
