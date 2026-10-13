// Unit conversion and display rounding (spec §8.8). Stored and API values stay imperial;
// only the format layer converts, driven by one imperial/metric toggle.
// Unchanged by the toggle: drive minutes, clock times, %, lift and trail counts.

export type Units = 'imperial' | 'metric';
export type Kind = 'snow' | 'temp' | 'wind' | 'distance' | 'elevation' | 'snowLevel' | 'precip';

/** A display quantity: `value` and `unit` for split styling, `text` joined. Null input gives '—'. */
export interface Qty {
  value: string;
  unit: string;
  text: string;
}

// Raw conversions (also used by adapters to turn NWS metric values into imperial, §5.7).
export const inToCm = (v: number): number => v * 2.54;
export const cmToIn = (v: number): number => v / 2.54;
export const inToMm = (v: number): number => v * 25.4;
export const mmToIn = (v: number): number => v / 25.4;
export const fToC = (v: number): number => ((v - 32) * 5) / 9;
export const cToF = (v: number): number => (v * 9) / 5 + 32;
export const mphToKmh = (v: number): number => v * 1.609344;
export const kmhToMph = (v: number): number => v / 1.609344;
export const miToKm = mphToKmh;
export const kmToMi = kmhToMph;
export const ftToM = (v: number): number => v * 0.3048;
export const mToFt = (v: number): number => v / 0.3048;

const NONE: Qty = { value: '—', unit: '', text: '—' };
const TIGHT = new Set(['″', '°F', '°C']); // no space before these

/** Round half away from zero to `dp` decimals; never prints '-0'. */
function fixed(v: number, dp: number): string {
  const f = 10 ** dp;
  const r = (Math.sign(v) * Math.round(Math.abs(v) * f * (1 + Number.EPSILON))) / f;
  return (r === 0 ? 0 : r).toFixed(dp);
}

/** Round to a multiple of `step`, then group thousands with commas. */
function stepped(v: number, step: number): string {
  return fixed(Math.round(v / step) * step, 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Snow inches: 1 dp below 10, else 0 dp (judged after rounding, so 9.96 -> '10').
function snowIn(v: number): string {
  const r = fixed(v, 1);
  return Math.abs(Number(r)) >= 10 ? fixed(v, 0) : r;
}

interface Rule {
  unit: string;
  conv: (v: number) => number;
  show: (v: number) => string;
}
const id = (v: number) => v;
const dp0 = (v: number) => fixed(v, 0);

const RULES: Record<Kind, Record<Units, Rule>> = {
  snow: { imperial: { unit: '″', conv: id, show: snowIn }, metric: { unit: 'cm', conv: inToCm, show: dp0 } },
  temp: { imperial: { unit: '°F', conv: id, show: dp0 }, metric: { unit: '°C', conv: fToC, show: dp0 } },
  wind: { imperial: { unit: 'mph', conv: id, show: dp0 }, metric: { unit: 'km/h', conv: mphToKmh, show: dp0 } },
  distance: { imperial: { unit: 'mi', conv: id, show: dp0 }, metric: { unit: 'km', conv: miToKm, show: dp0 } },
  elevation: {
    imperial: { unit: 'ft', conv: id, show: (v) => stepped(v, 1) },
    metric: { unit: 'm', conv: ftToM, show: (v) => stepped(v, 10) },
  },
  snowLevel: {
    imperial: { unit: 'ft', conv: id, show: (v) => stepped(v, 100) },
    metric: { unit: 'm', conv: ftToM, show: (v) => stepped(v, 10) },
  },
  precip: {
    imperial: { unit: 'in', conv: id, show: (v) => fixed(v, 2) },
    metric: { unit: 'mm', conv: inToMm, show: dp0 },
  },
};

/** Converts an imperial value to the chosen system without rounding (charts, comparisons). */
export function convert(kind: Kind, imperial: number, units: Units): number {
  return RULES[kind][units].conv(imperial);
}

/** Unit label for axes and headers ('″', 'cm', '°F', 'km/h', ...). */
export function unitOf(kind: Kind, units: Units): string {
  return RULES[kind][units].unit;
}

/** Formats an imperial value for display: fmt('snow', 3.46, 'imperial').text === '3.5″'. */
export function fmt(kind: Kind, imperial: number | null | undefined, units: Units): Qty {
  if (imperial === null || imperial === undefined || !Number.isFinite(imperial)) return NONE;
  const rule = RULES[kind][units];
  const value = rule.show(rule.conv(imperial));
  return { value, unit: rule.unit, text: TIGHT.has(rule.unit) ? `${value}${rule.unit}` : `${value} ${rule.unit}` };
}
