// Pure rows for the weekly snow matrix (plan §01 "This week"; also the briefing teaser and the wall): per resort,
// NWS base and summit snow for each of the next dates, the week total, the Open-Meteo model spread, the peak day
// and a 0..1 bar fraction. Values arrive imperial and are formatted with src/shared/units.ts only.
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import { addDays, formatLocalDate } from '../../../shared/time.ts';
import type { Block, PointForecast, ResortId } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { type OmData, omFor } from '../../data/open-meteo.ts';
import { dayOf, gridRow, modelSpread, range } from './forecast-rows.ts';

const DASH = '—';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown): number | null => (finite(v) ? v : null);
const sum = (vals: readonly (number | null)[]): number | null => {
  const ok = vals.filter(finite);
  return ok.length ? ok.reduce((a, b) => a + b, 0) : null;
};

/** `today` and the next n - 1 local dates; [] without a date (`localDate` gives '' for an invalid now). */
export function weekDates(today: string, n = 7): string[] {
  if (!today) return [];
  return Array.from({ length: n }, (_, i) => addDays(today, i));
}

export interface WeekDay {
  date: string;
  baseIn: number | null;
  summitIn: number | null;
}

export interface WeekRow {
  id: ResortId;
  name: string;
  days: WeekDay[];
  /** Sums over the days that have a value (null when none); `text` is the base–summit range with its unit. */
  total: { baseIn: number | null; summitIn: number | null; text: string };
  /** Open-Meteo model spread over the same dates, with its unit; '—' without a full set of days. */
  models: string;
  /** The date with the most summit snow (ties: earliest), null unless some day has snow. */
  peakDate: string | null;
  /** Which half of the peak day has more summit snow (NWS 6 AM–6 PM / 6 PM–6 AM; a tie is 'day'). */
  peakHalf: 'day' | 'night' | null;
  /** Summit total as a 0..1 share of the biggest week (`barFractions`). */
  frac: number;
}

type Forecasts = Record<string, Block<PointForecast>> | undefined;

/**
 * Heights as 0..1 fractions of the tallest value, with a `floorIn` floor so a 1″ week never looks deep; a known
 * value shows at least 0.08 (the pick card's `peakFractions` rule), null is 0.
 */
export function barFractions(values: readonly (number | null)[], floorIn = 6): number[] {
  const top = Math.max(floorIn, ...values.map((v) => v ?? 0));
  return values.map((v) => (v === null || !Number.isFinite(v) ? 0 : Math.max(0.08, Math.min(1, v / top))));
}

function peakOf(days: readonly WeekDay[]): WeekDay | null {
  let best: WeekDay | null = null;
  for (const d of days) {
    if (d.summitIn !== null && d.summitIn > 0 && (!best || d.summitIn > (best.summitIn ?? 0))) best = d;
  }
  return best;
}

/**
 * Every resort in canonical order over `dates` (local 'YYYY-MM-DD'): a placeholder payload ('{}' in the e2e seed)
 * gives null cells and '—' texts. `om` is the Open-Meteo location array (RESORT_IDS order) for the model spread.
 */
export function weekRows(
  forecast: Forecasts,
  dates: readonly string[],
  units: Units,
  om?: OmData['data'] | null,
): WeekRow[] {
  const rows = RESORT_IDS.map((id): WeekRow => {
    const base = gridRow(forecast?.[`${id}:base`]?.data);
    const summit = gridRow(forecast?.[`${id}:summit`]?.data);
    const days = dates.map((date) => ({
      date,
      baseIn: num(dayOf(base, date)?.snowIn),
      summitIn: num(dayOf(summit, date)?.snowIn),
    }));
    const baseIn = sum(days.map((d) => d.baseIn));
    const summitIn = sum(days.map((d) => d.summitIn));
    const spread = modelSpread(omFor(om, id)?.daily, dates);
    const peak = peakOf(days);
    const peakDay = peak ? dayOf(summit, peak.date) : undefined;
    return {
      id,
      name: RESORTS[id].name,
      days,
      total: { baseIn, summitIn, text: range('snow', [baseIn, summitIn], units) },
      models: spread ? range('snow', [spread.min, spread.max], units) : DASH,
      peakDate: peak?.date ?? null,
      peakHalf: peakDay ? (peakDay.snowNightIn > peakDay.snowDayIn ? 'night' : 'day') : null,
      frac: 0,
    };
  });
  const fr = barFractions(rows.map((r) => r.total.summitIn));
  return rows.map((r, i) => ({ ...r, frac: fr[i] ?? 0 }));
}

export interface WeekLeader {
  id: ResortId;
  name: string;
  text: string;
  peakDate: string | null;
  peakHalf: 'day' | 'night' | null;
}

/** The resort with the biggest summit week (ties: first in canonical order); null when no row has snow. */
export function weekLeader(rows: readonly WeekRow[]): WeekLeader | null {
  let best: WeekRow | null = null;
  for (const r of rows) {
    const v = r.total.summitIn;
    if (v !== null && v > 0 && (!best || v > (best.total.summitIn ?? 0))) best = r;
  }
  if (!best) return null;
  const { id, name, total, peakDate, peakHalf } = best;
  return { id, name, text: total.text, peakDate, peakHalf };
}

/** When a peak falls, from `today`: 'today', 'tonight', 'tomorrow night', 'Thu', 'Thu night'; null without one. */
export function peakWhen(peakDate: string | null, half: 'day' | 'night' | null, today: string): string | null {
  if (!peakDate) return null;
  const tail = half === 'night' ? ' night' : '';
  if (peakDate === today) return tail ? 'tonight' : 'today';
  const name = today && peakDate === addDays(today, 1) ? 'tomorrow' : formatLocalDate(peakDate, 'weekday');
  return name ? `${name}${tail}` : null;
}

/** The week's headline as plain text: 'Most snow: Alta 12–18″, peaking Thu night'; null when no row has snow. */
export function leaderText(leader: WeekLeader | null, today: string): string | null {
  if (!leader) return null;
  const when = peakWhen(leader.peakDate, leader.peakHalf, today);
  return `Most snow: ${leader.name} ${leader.text}${when ? `, peaking ${when}` : ''}`;
}

/** The single biggest summit day across every row (ties: the earliest date); null when no day has snow. */
export function stormDay(rows: readonly WeekRow[]): { date: string; id: ResortId; summitIn: number } | null {
  let best: { date: string; id: ResortId; summitIn: number } | null = null;
  for (const r of rows) {
    for (const d of r.days) {
      if (d.summitIn === null || !(d.summitIn > 0)) continue;
      if (!best || d.summitIn > best.summitIn || (d.summitIn === best.summitIn && d.date < best.date)) {
        best = { date: d.date, id: r.id, summitIn: d.summitIn };
      }
    }
  }
  return best;
}
