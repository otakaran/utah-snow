// Chart primitives over ui/chart.ts (pure geometry). ChartFrame is the figure (role="img" + one plain sentence for
// screen readers); Plot is one lane: an <svg preserveAspectRatio="none"> that CSS stretches to the lane, with HTML
// labels over it (SVG text would stretch too). Layers draw on a CHART_W-wide viewBox: Bars (one or two series per
// slot), Line, Band, HRule, VRule (slot center or edge), Shade. Fills and strokes come from chart.css classes
// (tokens only): no ids, no filters, no inline colors. Presentational only.
import type { ComponentChildren } from 'preact';
import './chart.css';
import {
  areaPath,
  barRects,
  linePath,
  linScale,
  pairRects,
  type Rect,
  slotCenter,
  slotEdge,
  spanRects,
} from './chart.ts';

export const CHART_W = 480;

interface FrameProps {
  /** The chart as one plain sentence (the figure's accessible name). */
  label: string;
  class?: string;
  children: ComponentChildren;
}

export function ChartFrame({ label, class: cls, children }: FrameProps) {
  return (
    <figure class={cls ? `chart ${cls}` : 'chart'} role="img" aria-label={label}>
      {children}
    </figure>
  );
}

interface PlotProps {
  /** viewBox height; CSS sets the pixel height (`.chart-svg`). */
  h: number;
  class?: string;
  children: ComponentChildren;
  /** HTML labels placed over the lane (PlotLabel). */
  labels?: ComponentChildren;
}

export function Plot({ h, class: cls, children, labels }: PlotProps) {
  return (
    <div class={cls ? `chart-plot ${cls}` : 'chart-plot'}>
      <svg
        class="chart-svg"
        viewBox={`0 0 ${CHART_W} ${h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {children}
      </svg>
      {labels}
    </div>
  );
}

interface LabelProps {
  /** Left position in % of the lane width. */
  x: number;
  /** Top position in % of the lane height; omitted = the lane's top. */
  y?: number;
  /** Which side of the label sits at x. */
  anchor?: 'start' | 'middle' | 'end';
  /** Hang below y instead of sitting on it. */
  below?: boolean;
  class?: string;
  children: ComponentChildren;
}

export function PlotLabel({ x, y, anchor = 'middle', below = false, class: cls, children }: LabelProps) {
  return (
    <span
      class={`chart-label chart-${anchor}${below ? ' chart-below' : ''}${cls ? ` ${cls}` : ''}`}
      style={{ left: `${x}%`, top: y === undefined ? undefined : `${y}%` }}
    >
      {children}
    </span>
  );
}

const draw = (rs: Rect[], cls: (i: number) => string) =>
  rs.map((r, i) =>
    r.height > 0 ? <rect key={r.x} class={cls(i)} x={r.x} y={r.y} width={r.width} height={r.height} /> : null,
  );

interface BarsProps {
  values: readonly (number | null)[];
  /** A second series: each slot then holds two bars side by side (values left, pair right). */
  pair?: readonly (number | null)[];
  h: number;
  max: number;
  gap?: number;
  /** Class per slot (e.g. the storm day lit). Default 'chart-bar'. */
  cls?: (i: number) => string;
}

export function Bars({ values, pair, h, max, gap, cls = () => 'chart-bar' }: BarsProps) {
  if (!pair) return <g>{draw(barRects(values, CHART_W, h, max, gap), cls)}</g>;
  const [a, b] = pairRects(values, pair, CHART_W, h, max, gap);
  return (
    <g>
      {draw(a, cls)}
      {draw(b, cls)}
    </g>
  );
}

interface LineProps {
  values: readonly (number | null)[];
  h: number;
  min: number;
  max: number;
  class: string;
}

export function Line({ values, h, min, max, class: cls }: LineProps) {
  const d = linePath(values, CHART_W, h, min, max);
  return d ? <path class={cls} d={d} /> : null;
}

interface BandProps {
  lo: readonly (number | null)[];
  hi: readonly (number | null)[];
  h: number;
  max: number;
}

/** A min–max band on a 0..max scale (model spread behind the bars). */
export function Band({ lo, hi, h, max }: BandProps) {
  const d = areaPath(lo, hi, CHART_W, h, max);
  return d ? <path class="chart-band" d={d} /> : null;
}

interface HRuleProps {
  value: number;
  h: number;
  min: number;
  max: number;
  class?: string;
}

/** A horizontal reference line at `value` (e.g. the base and summit elevations). */
export function HRule({ value, h, min, max, class: cls = 'chart-rule-strong' }: HRuleProps) {
  const y = Math.round(linScale([min, max], [h, 0])(value) * 10) / 10;
  return <line class={cls} x1={0} x2={CHART_W} y1={y} y2={y} />;
}

interface VRuleProps {
  /** Slot index. */
  at: number;
  n: number;
  h: number;
  /** On the boundary before the slot instead of its center. */
  edge?: boolean;
  class?: string;
}

export function VRule({ at, n, h, edge = false, class: cls = 'chart-rule' }: VRuleProps) {
  const x = edge ? slotEdge(at, n, CHART_W) : slotCenter(at, n, CHART_W);
  return <line class={cls} x1={x} x2={x} y1={0} y2={h} />;
}

interface ShadeProps {
  spans: readonly (readonly [number, number])[];
  n: number;
  h: number;
}

/** Full-height shading over [start, end) slot spans (night hours). */
export function Shade({ spans, n, h }: ShadeProps) {
  return (
    <g>
      {spanRects(spans, n, CHART_W, h).map((r) => (
        <rect key={r.x} class="chart-shade" x={r.x} y={r.y} width={r.width} height={r.height} />
      ))}
    </g>
  );
}
