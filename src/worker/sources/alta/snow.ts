// Alta SnowNumbers (spec §5.5 snow table, Alta row). Every field is gated on its seasonal.show_* flag; preseason
// nulls every number because the off-season page keeps last season's values (year_to_date 322-323).
import { stampIso } from '../../../shared/alta-page.ts';
import { arr, type Obj, obj } from '../../../shared/json.ts';
import { num, range, text } from '../../../shared/num.ts';
import { reportIsToday } from '../../../shared/season.ts';
import { addDays, type LocalParts, localParts } from '../../../shared/time.ts';
import type { SnowNumbers } from '../../../shared/types.ts';

const MORNING = { from: 4, to: 10 } as const; // overnight = last12 read in [04:00, 10:00) local
const MAX_24H = 120; // plausibility caps, inches
const MAX_TOTAL = 1500;
type Morning = { date: string; value: number };

/** `alta:weather` days[] ({date, newSnowIn}) -> Map date -> inches, or null when the row is missing. */
export function historyOf(row: unknown): Map<string, number> | null {
  const days = obj(row)?.days;
  if (!Array.isArray(days)) return null;
  const m = new Map<string, number>();
  for (const d of arr(days)) {
    const o = obj(d);
    if (o && typeof o.date === 'string' && typeof o.newSnowIn === 'number') m.set(o.date, o.newSnowIn);
  }
  return m;
}

function morningOf(v: unknown): Morning | null {
  const o = obj(v);
  return o && typeof o.date === 'string' && typeof o.value === 'number' ? { date: o.date, value: o.value } : null;
}

/**
 * Snow over the `days` x 24 h before the report: last24 plus history day totals standing in for the older 24 h
 * blocks (spec fallback for the resort_history method). Day rows are calendar-day totals, so the newest and oldest
 * rows are split by the report's time of day; a missing row makes the result null.
 */
function windowIn(last24: number, hist: Map<string, number>, rep: LocalParts, days: number): number | null {
  const f = (rep.hour + rep.minute / 60) / 24;
  let sum = last24;
  for (let k = 1; k <= days; k++) {
    const v = hist.get(addDays(rep.date, -k));
    if (v === undefined) return null;
    sum += v * (k === 1 ? f : k === days ? 1 - f : 1);
  }
  return Math.round(sum * 10) / 10;
}

const atLeast = (v: number | null, floor: number | null) => (v !== null && floor !== null ? Math.max(v, floor) : v);

/**
 * root = window.Alta, prevSnow = last-good row's `snow`, hist = historyOf(prev['alta:weather']).
 * Overnight: last12 while now is in [04:00, 10:00) and the report is today (also saved as morningOvernightIn, the
 * last read wins); from 10:00 the saved value if it is today's; 00:00-03:59 null.
 */
export function snowNumbers(
  root: Obj,
  now: number,
  prevSnow: unknown,
  hist: Map<string, number> | null,
  preseason: boolean,
): SnowNumbers {
  const c = obj(root.conditions) ?? {};
  const flags = obj(root.seasonal) ?? {};
  const reportAt = stampIso(c.updated_at, root.DST);
  const rep = reportAt ? localParts(reportAt) : null;
  const local = localParts(now);
  const out: SnowNumbers = {
    overnightIn: null,
    new12hIn: null,
    new24hIn: null,
    new48hIn: null,
    new72hIn: null,
    new7dIn: null,
    stormTotalIn: null,
    seasonTotalIn: null,
    baseDepthIn: null,
    reportAt,
    reportIsToday: reportIsToday(reportAt, now),
    area: 'primary',
    morningOvernightIn: null,
    surface: null,
    text: text(c.notes),
  };
  if (preseason || !local) return out;
  const gated = (flag: string, v: unknown, max: number) => (flags[flag] === true ? range(num(v), 0, max) : null);
  const last12 = gated('show_12hr_snow', c.last12, MAX_24H);
  const last24 = gated('show_24hr_snow', c.last24, MAX_24H);
  const prev = obj(prevSnow);
  let morning = morningOf(prev?.morningOvernightIn);
  if (local.hour >= MORNING.from && local.hour < MORNING.to) {
    if (last12 !== null && out.reportIsToday) {
      morning = { date: local.date, value: last12 };
      out.overnightIn = last12;
    }
  } else if (local.hour >= MORNING.to && morning?.date === local.date) {
    out.overnightIn = morning.value;
  }
  out.morningOvernightIn = morning;
  out.new12hIn = last12;
  out.new24hIn = last24;
  if (last24 !== null && rep && hist) {
    out.new48hIn = windowIn(last24, hist, rep, 2);
    out.new72hIn = windowIn(last24, hist, rep, 3);
    out.new7dIn = windowIn(last24, hist, rep, 7);
  } else if (
    last24 !== null &&
    rep &&
    typeof prev?.reportAt === 'string' &&
    localParts(prev.reportAt)?.date === rep.date
  ) {
    // No alta:weather row in prev this tick: keep today's earlier multi-day values instead of flickering to null.
    out.new48hIn = range(num(prev?.new48hIn), 0, MAX_TOTAL);
    out.new72hIn = range(num(prev?.new72hIn), 0, MAX_TOTAL);
    out.new7dIn = range(num(prev?.new7dIn), 0, MAX_TOTAL);
  }
  out.new48hIn = atLeast(out.new48hIn, last24);
  out.new72hIn = atLeast(out.new72hIn, out.new48hIn);
  out.new7dIn = atLeast(out.new7dIn, out.new72hIn);
  out.stormTotalIn = gated('show_storm_total', c.storm_total, MAX_TOTAL);
  out.seasonTotalIn = gated('show_season_total', c.year_to_date, MAX_TOTAL);
  out.baseDepthIn = gated('show_base_depth', c.base_depth, 400);
  return out;
}
