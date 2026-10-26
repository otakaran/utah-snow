// Pure view of the §03 lanes for one resort over the hourly window: ticks every 6 h (the weekday at midnight,
// 'Noon' at 12), snow/h (headline model) with the model band where 2+ models report, temperature and the freezing
// level (HRRR, then GFS past the seam) on their own scales against the base and summit rules, wind with gusts, the
// kicker texts and the 3-hour table cells. Geometry stays imperial; only the texts are formatted (units.ts).
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { fmt, type Units } from '../../../shared/units.ts';
import type { OmLocation, OmModel } from '../../data/open-meteo.ts';
import { niceMax, slotPct, yPct } from '../../ui/chart.ts';
import {
  band,
  freezingLevel,
  type HourlyRow,
  type HourlyWindow,
  headline,
  hourLabel,
  range,
} from '../conditions/index.ts';

type Series = (number | null)[];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface Tick {
  pct: number;
  text: string;
  anchor: 'start' | 'middle';
  /** A midnight: the weekday name. */
  day: boolean;
}

export interface HourlyView {
  n: number;
  night: [number, number][];
  midnights: number[];
  now: number | null;
  ticks: Tick[];
  snow: { model: OmModel; values: Series; lo: Series; hi: Series; max: number; text: string } | null;
  temp: { values: Series; min: number; max: number; text: string } | null;
  /** Freezing level on its own scale; `baseY` / `summitY` are the elevation rules' tops in %. */
  frz: {
    values: Series;
    seam: number | null;
    min: number;
    max: number;
    text: string;
    baseFt: number;
    summitFt: number;
    baseY: number;
    summitY: number;
    base: string;
    summit: string;
  } | null;
  wind: { wind: Series; gust: Series; max: number; text: string } | null;
}

const hourOf = (t: string): number => Number(t.slice(11, 13));
const tickText = (t: string): string => {
  const h = hourOf(t);
  if (h === 0) return formatLocalDate(t.slice(0, 10), 'weekday');
  return h === 12 ? 'Noon' : hourLabel(t);
};

/**
 * Every 6-hour mark in the window (00, 06, 12, 18 local). A mark at the left edge is anchored inward; one in the
 * last 6 % is dropped, since pulled inward it would run into its neighbour.
 */
export function hourlyTicks(time: readonly string[]): Tick[] {
  const n = time.length;
  return time.flatMap((t, p) => {
    const pct = slotPct(p, n);
    if (hourOf(t) % 6 !== 0 || pct > 94) return [];
    return [{ pct, text: tickText(t), anchor: pct < 4 ? 'start' : 'middle', day: hourOf(t) === 0 }];
  });
}

/** [lo, hi] around the values with `pad` on each side and at least `span` wide. */
function domain(values: readonly number[], pad: number, span: number): [number, number] {
  let lo = Math.min(...values) - pad;
  let hi = Math.max(...values) + pad;
  if (hi - lo < span) {
    const mid = (hi + lo) / 2;
    lo = mid - span / 2;
    hi = mid + span / 2;
  }
  return [lo, hi];
}

export function hourlyView(loc: OmLocation | null, win: HourlyWindow, id: ResortId, units: Units): HourlyView {
  const { idx } = win;
  const r = RESORTS[id];
  const snowH = headline(loc, 'snowfall', idx);
  const spread = band(loc, 'snowfall', idx);
  const lo = spread ? spread.map((b) => (b.n >= 2 ? b.min : null)) : idx.map(() => null);
  const hi = spread ? spread.map((b) => (b.n >= 2 ? b.max : null)) : idx.map(() => null);
  const total = snowH ? snowH.values.filter(finite).reduce((a, b) => a + b, 0) : 0;
  const temps = headline(loc, 'temperature_2m', idx);
  const tKnown = temps?.values.filter(finite) ?? [];
  const level = freezingLevel(loc, idx);
  const lKnown = level.values.filter(finite);
  const wind = headline(loc, 'wind_speed_10m', idx);
  const gust = headline(loc, 'wind_gusts_10m', idx);
  const wKnown = [...(wind?.values ?? []), ...(gust?.values ?? [])].filter(finite);
  const gKnown = gust?.values.filter(finite) ?? [];
  const [fMin, fMax] = domain([...lKnown, r.base.ft, r.summit.ft], 600, 3000);
  const [tMin, tMax] = tKnown.length ? domain(tKnown, 3, 12) : [0, 1];
  const n = idx.length;
  return {
    n,
    night: win.night,
    midnights: win.midnights,
    now: win.nowIndex,
    ticks: hourlyTicks(win.time),
    snow: snowH
      ? {
          model: snowH.model,
          values: snowH.values,
          lo,
          hi,
          max: niceMax([...snowH.values, ...hi], 0.5),
          text: `Snow per hour · ${total > 0 ? range('snow', [total], units) : 'none'} in ${n} h`,
        }
      : null,
    temp: temps
      ? { values: temps.values, min: tMin, max: tMax, text: `Temperature ${range('temp', tKnown, units)}` }
      : null,
    frz: lKnown.length
      ? {
          values: level.values,
          seam: level.seam,
          min: fMin,
          max: fMax,
          text: `freezing level ${range('snowLevel', lKnown, units)}`,
          baseFt: r.base.ft,
          summitFt: r.summit.ft,
          baseY: yPct(r.base.ft, fMin, fMax),
          summitY: yPct(r.summit.ft, fMin, fMax),
          base: `Base ${fmt('elevation', r.base.ft, units).text}`,
          summit: `Summit ${fmt('elevation', r.summit.ft, units).text}`,
        }
      : null,
    wind: wKnown.length
      ? {
          wind: wind?.values ?? idx.map(() => null),
          gust: gust?.values ?? idx.map(() => null),
          max: niceMax(wKnown, 20),
          text: `Wind ${wind ? range('wind', wind.values, units) : '—'}${
            gKnown.length ? ` · gusts to ${fmt('wind', Math.max(...gKnown), units).text}` : ''
          }`,
        }
      : null,
  };
}

export interface TableRow {
  time: string;
  snow: string;
  temp: string;
  wind: string;
  frz: string;
}

/** The 3-hour table's cells ('Tue 3 PM', snow summed over the step, the rest as of the hour). */
export function tableRows(rows: readonly HourlyRow[], units: Units): TableRow[] {
  return rows.map((r) => {
    const w = fmt('wind', r.windMph, units).value;
    const g = finite(r.gustMph) ? ` G${fmt('wind', r.gustMph, units).value}` : '';
    return {
      time: r.time ? `${formatLocalDate(r.time.slice(0, 10), 'weekday')} ${hourLabel(r.time)}` : '—',
      snow: range('snow', [r.snowIn], units, true),
      temp: fmt('temp', r.tempF, units).text,
      wind: finite(r.windMph) ? `${w}${g}` : g.trim() || '—',
      frz: fmt('snowLevel', r.freezingFt, units).text,
    };
  });
}
