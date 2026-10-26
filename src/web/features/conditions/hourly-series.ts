// Pure helpers for the 48-hour Open-Meteo lanes (plan §03; shared with the wall): a window of hourly positions
// found by its Denver local time string (never by hour arithmetic: a DST day has 23 or 25 entries), the NBM
// headline with a fallback, the per-hour min–max band across models, the freezing level (HRRR, then GFS past its
// horizon), the aria sentence and the 3-hour table. Values stay imperial; only the sentence formats (units.ts).
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { fmt, type Units } from '../../../shared/units.ts';
import { OM_MODELS, type OmHourlyField, type OmLocation, type OmModel, omSeries } from '../../data/open-meteo.ts';
import { range } from './forecast-rows.ts';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sum = (vals: readonly (number | null)[]): number | null => {
  const ok = vals.filter(finite);
  return ok.length ? ok.reduce((a, b) => a + b, 0) : null;
};
const hourOf = (iso: string): number => Number(iso.slice(11, 13));
const isNight = (iso: string): boolean => hourOf(iso) >= 18 || hourOf(iso) < 6;

export interface HourlyWindow {
  /** Positions in `loc.hourly.time`, oldest first. */
  idx: number[];
  /** 'YYYY-MM-DDTHH:00' (Denver) per window position. */
  time: string[];
  /** Window position of the current hour: 0, since the caller opens the window at `localParts(now)`. */
  nowIndex: number | null;
  /** Window positions whose hour is 00 (day boundaries). */
  midnights: number[];
  /** [start, end) window spans with hour >= 18 or < 6. */
  night: [number, number][];
}

/**
 * The next `hours` hourly positions from `fromIso` (a local 'YYYY-MM-DDTHH:00', normally the current hour), or null
 * when the cache does not hold that hour (it may be from yesterday, or older than its own range).
 */
export function hourlyWindow(loc: OmLocation | null | undefined, fromIso: string, hours = 48): HourlyWindow | null {
  const times = loc?.hourly?.time;
  if (!times) return null;
  const start = times.indexOf(fromIso);
  if (start < 0) return null;
  const idx: number[] = [];
  for (let i = start; i < times.length && idx.length < hours; i++) idx.push(i);
  const time = idx.map((i) => times[i] ?? '');
  const midnights: number[] = [];
  const night: [number, number][] = [];
  let open: number | null = null;
  for (const [p, t] of time.entries()) {
    if (t.slice(11, 13) === '00') midnights.push(p);
    if (isNight(t)) {
      if (open === null) open = p;
    } else if (open !== null) {
      night.push([open, p]);
      open = null;
    }
  }
  if (open !== null) night.push([open, time.length]);
  return { idx, time, nowIndex: 0, midnights, night };
}

/** One model's hourly field over the window (null where the model has no value). */
export function omHourly(
  loc: OmLocation | null | undefined,
  field: OmHourlyField,
  model: OmModel,
  idx: readonly number[],
): (number | null)[] {
  const s = omSeries(loc, 'hourly', field, model);
  return idx.map((i) => {
    const v = s?.[i];
    return finite(v) ? v : null;
  });
}

const HEADLINE_ORDER: readonly OmModel[] = ['ncep_nbm_conus', 'ncep_hrrr_conus', 'ecmwf_ifs', 'ncep_gfs_global'];
const COVERAGE = 0.9;

/** The series to draw: NBM, else the first of HRRR, ECMWF, GFS with >= 90 % of the window known; null if none. */
export function headline(
  loc: OmLocation | null | undefined,
  field: OmHourlyField,
  idx: readonly number[],
): { model: OmModel; values: (number | null)[] } | null {
  if (idx.length === 0) return null;
  for (const model of HEADLINE_ORDER) {
    const values = omHourly(loc, field, model, idx);
    if (values.filter((v) => v !== null).length >= COVERAGE * idx.length) return { model, values };
  }
  return null;
}

/**
 * Per position, min–max over the models that have a value and how many did (`n`; 0 with min = max = 0 where none
 * does, so a renderer skips it). Null when no model carries the field anywhere in the window.
 */
export function band(
  loc: OmLocation | null | undefined,
  field: OmHourlyField,
  idx: readonly number[],
): { min: number; max: number; n: number }[] | null {
  const series = OM_MODELS.map((m) => omHourly(loc, field, m, idx));
  if (series.every((s) => s.every((v) => v === null))) return null;
  return idx.map((_, p) => {
    const vals = series.map((s) => s[p]).filter(finite);
    return vals.length ? { min: Math.min(...vals), max: Math.max(...vals), n: vals.length } : { min: 0, max: 0, n: 0 };
  });
}

/**
 * Freezing level: HRRR up to its first null (its horizon), GFS from there on. `seam` is the first position GFS
 * fills; null when HRRR covers the window or neither model has a value past the cut.
 */
export function freezingLevel(
  loc: OmLocation | null | undefined,
  idx: readonly number[],
): { values: (number | null)[]; seam: number | null } {
  const hrrr = omHourly(loc, 'freezing_level_height', 'ncep_hrrr_conus', idx);
  const cut = hrrr.indexOf(null);
  if (cut < 0) return { values: hrrr, seam: null };
  const gfs = omHourly(loc, 'freezing_level_height', 'ncep_gfs_global', idx);
  const values = hrrr.map((v, p) => (p < cut ? v : (gfs[p] ?? null)));
  const seam = values.findIndex((v, p) => p >= cut && v !== null);
  return { values, seam: seam < 0 ? null : seam };
}

/** '3 PM', '12 AM' from a local 'YYYY-MM-DDTHH:00' string (string math, no Date). */
export function hourLabel(iso: string): string {
  const h = hourOf(iso);
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

const timeAt = (loc: OmLocation | null | undefined, i: number | undefined): string =>
  i === undefined ? '' : (loc?.hourly.time[i] ?? '');

/** One plain sentence for the chart's aria-label: total snow and its peak hour, temperatures, gusts, snow level. */
export function hourlySummary(
  loc: OmLocation | null | undefined,
  idx: readonly number[],
  id: ResortId,
  units: Units,
): string {
  const r = RESORTS[id];
  const parts: string[] = [];
  const snow = headline(loc, 'snowfall', idx)?.values;
  const total = snow ? sum(snow) : null;
  if (snow && total !== null) {
    if (total > 0) {
      let peak = 0;
      for (const [p, v] of snow.entries()) if (v !== null && v > (snow[peak] ?? 0)) peak = p;
      const t = timeAt(loc, idx[peak]);
      const when = t ? ` around ${hourLabel(t)} ${formatLocalDate(t.slice(0, 10), 'weekday')}` : '';
      parts.push(`${range('snow', [total], units)} of snow, heaviest${when}`);
    } else parts.push('no snow');
  }
  const temp = headline(loc, 'temperature_2m', idx)?.values.filter(finite) ?? [];
  if (temp.length) parts.push(`temperatures ${range('temp', temp, units)}`);
  const gust = headline(loc, 'wind_gusts_10m', idx)?.values.filter(finite) ?? [];
  if (gust.length) parts.push(`gusts to ${fmt('wind', Math.max(...gust), units).text}`);
  const level = freezingLevel(loc, idx).values.filter(finite);
  if (level.length) {
    const top = Math.max(...level);
    const base = `the base (${fmt('elevation', r.base.ft, units).text})`;
    const summit = `the summit (${fmt('elevation', r.summit.ft, units).text})`;
    const where =
      top <= r.base.ft
        ? `below ${base}`
        : top > r.summit.ft
          ? `above ${summit} at times`
          : `between ${base} and ${summit}`;
    parts.push(`freezing level ${range('snowLevel', level, units)}, ${where}`);
  }
  if (parts.length === 0) return `${r.name}: no hourly model data for the next ${idx.length} hours.`;
  return `${r.name}, next ${idx.length} hours: ${parts.join('; ')}.`;
}

export interface HourlyRow {
  time: string;
  snowIn: number | null; // summed over the row's `step` hours
  tempF: number | null; // at the row's hour, like the rest
  windMph: number | null;
  gustMph: number | null;
  freezingFt: number | null;
}

/** Every `step`-th hour of the window from the headline series (snow summed over the step, the rest as of the hour). */
export function hourlyTable(loc: OmLocation | null | undefined, idx: readonly number[], step = 3): HourlyRow[] {
  const snow = headline(loc, 'snowfall', idx)?.values ?? null;
  const temp = headline(loc, 'temperature_2m', idx)?.values ?? null;
  const wind = headline(loc, 'wind_speed_10m', idx)?.values ?? null;
  const gust = headline(loc, 'wind_gusts_10m', idx)?.values ?? null;
  const level = freezingLevel(loc, idx).values;
  const rows: HourlyRow[] = [];
  for (let p = 0; p < idx.length; p += Math.max(1, step)) {
    rows.push({
      time: timeAt(loc, idx[p]),
      snowIn: snow ? sum(snow.slice(p, p + step)) : null,
      tempF: temp?.[p] ?? null,
      windMph: wind?.[p] ?? null,
      gustMph: gust?.[p] ?? null,
      freezingFt: level[p] ?? null,
    });
  }
  return rows;
}
