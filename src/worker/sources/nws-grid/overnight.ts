// Frozen overnight (spec §5.7 step 7). A grid starts at its forecast cycle, so by the 06:00 briefing most of
// [D-1 16:00, D 08:00) can lie before the grid's first hour. Every fetch that still covers the whole window stores
// its hourly snow as frozen[D]; later fetches fill the hours they lack from it.

import { addDays } from '../../../shared/time.ts';
import type { PointForecast } from '../../../shared/types.ts';
import { type Hourly, overnightWindow, snowHours } from './bucket.ts';

type Frozen = PointForecast['frozen'];
type Overnight = PointForecast['overnight'];
const HOUR = 3_600_000;
const KEEP = 3; // newest dates kept
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const iso = (h: number) => new Date(h * HOUR).toISOString();

/** The previous row's `frozen`, keeping only well-formed entries. */
export function prevFrozen(prevRow: unknown): Frozen {
  const out: Frozen = {};
  const fz = (prevRow as { frozen?: unknown } | null | undefined)?.frozen;
  if (!fz || typeof fz !== 'object') return out;
  for (const [date, v] of Object.entries(fz as Record<string, unknown>)) {
    const e = v as { hourlyIn?: unknown; updateTime?: unknown } | null;
    if (!DATE_RE.test(date) || !e || typeof e.updateTime !== 'string' || !Array.isArray(e.hourlyIn)) continue;
    if (e.hourlyIn.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      out[date] = { hourlyIn: e.hourlyIn as number[], updateTime: e.updateTime };
    }
  }
  return out;
}

/**
 * frozen[D] = this grid's hourly snow for D in {today, tomorrow} when it covers the whole overnight window
 * (the last such write wins); then keep the 3 newest dates.
 */
export function updateFrozen(g: Hourly, today: string, updateTime: string, prev: Frozen): Frozen {
  const next: Frozen = { ...prev };
  for (const d of [today, addDays(today, 1)]) {
    const hours = snowHours(g, overnightWindow(d));
    if (hours.length > 0 && hours.every(Number.isFinite)) next[d] = { hourlyIn: hours.map(r3), updateTime };
  }
  const keep = Object.keys(next).sort().slice(-KEEP);
  return Object.fromEntries(keep.map((d) => [d, next[d] as Frozen[string]]));
}

/**
 * overnight(D): grid hours where the grid has them, frozen[D] hours before that. coverage is 'partial' when an
 * hour is in neither, else 'frozen' when a frozen hour was used (issuedAt = its updateTime), else 'full'.
 */
export function overnightFor(g: Hourly, d: string, frozen: Frozen, updateTime: string): Overnight {
  const w = overnightWindow(d);
  const grid = snowHours(g, w);
  const fz = frozen[d];
  const fzOk = fz !== undefined && fz.hourlyIn.length === grid.length;
  let sum = 0;
  let usedFrozen = false;
  let missing = false;
  grid.forEach((v, k) => {
    if (Number.isFinite(v)) sum += v;
    else if (fzOk && Number.isFinite(fz.hourlyIn[k])) {
      sum += fz.hourlyIn[k] ?? 0;
      usedFrozen = true;
    } else missing = true;
  });
  const coverage = missing ? 'partial' : usedFrozen ? 'frozen' : 'full';
  const issuedAt = usedFrozen && fz ? fz.updateTime : updateTime;
  return { from: iso(w.from), to: iso(w.to), snowIn: r1(sum), coverage, issuedAt };
}
