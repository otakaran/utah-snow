// NWS gridpoint bucketing (spec §5.7): expand `validTime` intervals to hourly UTC slots, then sum or reduce them per
// Denver day and per briefing window. Pure; every local date/hour comes from one localSlots() call per grid.

import { addDays, HOUR, isoToMs, localSlots, zonedToUtc } from '../../../shared/time.ts';
import type { NwsDay } from '../../../shared/types.ts';
import { kmhToMph, mmToIn, mToFt } from '../../../shared/units.ts';

const MAX_HOURS = 16 * 24; // a grid spans ~7.5 days; anything longer is rejected by the caller

export interface GridValue {
  validTime: string;
  value: number | null;
}
export interface Interval {
  h0: number; // first UTC hour index (epoch ms / 1 h)
  n: number; // whole hours
  value: number;
}
export type Field = 'snow' | 'qpf' | 'snowLevel' | 'gust' | 'wind' | 'temp' | 'pop';
// Accumulations are split evenly across their hours; state fields repeat their value.
export const ACCUM: ReadonlySet<Field> = new Set(['snow', 'qpf']);

/** The hourly grid: one array per field (NaN = no data), aligned to `slots`. */
export interface Hourly {
  h0: number;
  n: number;
  slots: { date: string; hour: number }[];
  f: Record<Field, number[]>;
}

/** Whole hours in an ISO-8601 duration `P{n}DT{n}H{n}M`, or null. */
export function durationHours(d: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(d);
  if (!m) return null;
  const h = Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0) + Math.round(Number(m[3] ?? 0) / 60);
  return h > 0 ? h : null;
}

/** `'2026-10-12T13:00:00+00:00/PT5H'` -> { h0, n }, or null when either half is unreadable. */
export function parseValidTime(vt: string): { h0: number; n: number } | null {
  const i = vt.indexOf('/');
  if (i < 0) return null;
  const ms = isoToMs(vt.slice(0, i));
  const n = durationHours(vt.slice(i + 1));
  return ms === null || n === null ? null : { h0: Math.floor(ms / HOUR), n };
}

/** Readable intervals of one field; null values and malformed entries are skipped. */
export function intervals(values: readonly GridValue[]): Interval[] {
  const out: Interval[] = [];
  for (const v of values) {
    if (typeof v?.validTime !== 'string' || typeof v.value !== 'number' || !Number.isFinite(v.value)) continue;
    const t = parseValidTime(v.validTime);
    if (t) out.push({ ...t, value: v.value });
  }
  return out;
}

/** Expands every field onto one hourly UTC axis; null when the span is empty or longer than 16 days. */
export function expand(fields: Partial<Record<Field, Interval[]>>): Hourly | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const list of Object.values(fields)) {
    for (const iv of list ?? []) {
      lo = Math.min(lo, iv.h0);
      hi = Math.max(hi, iv.h0 + iv.n);
    }
  }
  const n = hi - lo;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_HOURS) return null;
  const f = {} as Record<Field, number[]>;
  for (const key of ['snow', 'qpf', 'snowLevel', 'gust', 'wind', 'temp', 'pop'] as const) {
    const arr = new Array<number>(n).fill(Number.NaN);
    const accum = ACCUM.has(key);
    for (const iv of fields[key] ?? []) {
      const v = accum ? iv.value / iv.n : iv.value;
      for (let k = 0; k < iv.n; k++) arr[iv.h0 - lo + k] = v;
    }
    f[key] = arr;
  }
  return { h0: lo, n, slots: localSlots(lo * HOUR, n), f };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const in1 = (mm: number) => r1(mmToIn(mm));
const orNull = (x: number, conv: (v: number) => number) => (Number.isFinite(x) ? Math.round(conv(x)) : null);
const degF = (c: number) => (c * 9) / 5 + 32;

interface Acc {
  date: string;
  snow: number;
  day: number;
  night: number;
  qpf: number;
  slMin: number;
  slMax: number;
  gust: number;
  wind: number;
  tMin: number;
  tMax: number;
  pop: number;
}
const acc = (date: string): Acc => ({
  date,
  ...{ snow: 0, day: 0, night: 0, qpf: 0, gust: Number.NaN, wind: Number.NaN, pop: Number.NaN },
  ...{ slMin: Number.NaN, slMax: Number.NaN, tMin: Number.NaN, tMax: Number.NaN },
});
const add = (a: number, b: number) => (Number.isFinite(b) ? a + b : a);
const max = (a: number, b: number) => (Number.isFinite(b) ? (Number.isFinite(a) ? Math.max(a, b) : b) : a);
const min = (a: number, b: number) => (Number.isFinite(b) ? (Number.isFinite(a) ? Math.min(a, b) : b) : a);

/**
 * One NwsDay per Denver date in the grid. Day = 06-18 local; night = 18:00 that date -> 06:00 the next
 * (NWS "Monday Night"), so the hours 00-05 count toward the previous date's night.
 */
export function bucketDays(g: Hourly): NwsDay[] {
  const days: Acc[] = [];
  let cur: Acc | null = null;
  let prev: Acc | null = null;
  const { snow, qpf, snowLevel, gust, wind, temp, pop } = g.f;
  for (let i = 0; i < g.n; i++) {
    const { date, hour } = g.slots[i] ?? { date: '', hour: 0 };
    if (cur?.date !== date) {
      prev = cur;
      cur = acc(date);
      days.push(cur);
    }
    const s = snow[i] ?? Number.NaN;
    cur.snow = add(cur.snow, s);
    if (hour >= 6 && hour < 18) cur.day = add(cur.day, s);
    else if (hour >= 18) cur.night = add(cur.night, s);
    else if (prev) prev.night = add(prev.night, s);
    cur.qpf = add(cur.qpf, qpf[i] ?? Number.NaN);
    cur.slMin = min(cur.slMin, snowLevel[i] ?? Number.NaN);
    cur.slMax = max(cur.slMax, snowLevel[i] ?? Number.NaN);
    cur.gust = max(cur.gust, gust[i] ?? Number.NaN);
    cur.wind = max(cur.wind, wind[i] ?? Number.NaN);
    cur.tMin = min(cur.tMin, temp[i] ?? Number.NaN);
    cur.tMax = max(cur.tMax, temp[i] ?? Number.NaN);
    cur.pop = max(cur.pop, pop[i] ?? Number.NaN);
  }
  return days.map((a) => ({
    date: a.date,
    snowIn: in1(a.snow),
    snowDayIn: in1(a.day),
    snowNightIn: in1(a.night),
    qpfIn: r2(mmToIn(a.qpf)),
    snowLevelMinFt: orNull(a.slMin, mToFt),
    snowLevelMaxFt: orNull(a.slMax, mToFt),
    gustMaxMph: orNull(a.gust, kmhToMph),
    windMaxMph: orNull(a.wind, kmhToMph),
    tMinF: orNull(a.tMin, degF),
    tMaxF: orNull(a.tMax, degF),
    popMax: orNull(a.pop, (x) => x),
  }));
}

/** UTC hour index range [from, to) of the local window `${date} ${hm}` -> `${date2} ${hm2}`. */
export function windowHours(date: string, hm: string, date2: string, hm2: string): { from: number; to: number } {
  const a = zonedToUtc(`${date} ${hm}`) ?? Number.NaN;
  const b = zonedToUtc(`${date2} ${hm2}`) ?? Number.NaN;
  return { from: Math.floor(a / HOUR), to: Math.floor(b / HOUR) };
}

/** Grid snow per hour (inches, NaN where the grid has no value) for an hour-index window. */
export function snowHours(g: Hourly, w: { from: number; to: number }): number[] {
  const out: number[] = [];
  for (let h = w.from; h < w.to; h++) {
    const v = g.f.snow[h - g.h0];
    out.push(v === undefined ? Number.NaN : mmToIn(v));
  }
  return out;
}

/** Sum of the grid's snow (inches, 0.1) in a window; missing hours count as zero. */
export function windowSnowIn(g: Hourly, w: { from: number; to: number }): number {
  return r1(snowHours(g, w).reduce(add, 0));
}

/** Overnight window for briefing day D: [D-1 16:00, D 08:00) local. */
export const overnightWindow = (d: string) => windowHours(addDays(d, -1), '16:00', d, '08:00');
