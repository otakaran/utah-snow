// Reason-line text of the pick (spec §10.3). Snow and wind go through units.ts; penalties and bonuses are score
// points in inches and print as '(−3.2)' / '(+2)'.
import { CAP_GROUPS } from '../../../config/ikon.ts';
import { STRATEGY } from '../../../config/strategy.ts';
import { formatClock, zonedToUtc } from '../time.ts';
import type { CapGroupId, PickFresh } from '../types.ts';
import { fmt, type Units } from '../units.ts';
import type { DayTerm, GroupState } from './threshold.ts';

/** 1 dp, no trailing '.0': 3.35 -> '3.4', 2 -> '2'. */
export function num1(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(r === 0 ? 0 : r);
}

/** '(−3.2)' / '(+2)' with a real minus sign. */
export const signed = (v: number): string => `(${v < 0 ? '−' : '+'}${num1(Math.abs(v))})`;

/** Snow depth in the chosen units without a trailing '.0': '14″', '3″', '4.2″', '8 cm'. */
export const snow = (inches: number, units: Units): string =>
  fmt('snow', inches, units).text.replace(/\.0(?=\D|$)/, '');

export const wind = (mph: number, units: Units): string => fmt('wind', mph, units).text;

/** 'Eva', 'Eva and Petr', 'Eva, Petr and Jan'. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Local 'HH:MM' on `date` as '9:30 AM'. */
export const clockAt = (date: string, hm: string): string => formatClock(zonedToUtc(`${date} ${hm}`) ?? Number.NaN);

const label = (g: CapGroupId): string => CAP_GROUPS[g].label;

/** '14″ overnight (resort report 6:05 AM) + 3″ forecast today'. */
export function snowLine(f: PickFresh, tomorrow: boolean, units: Units): string {
  if (f.source === 'none') return tomorrow ? 'No forecast for tonight' : 'No overnight snow data';
  const disc = f.source === 'forecast' ? `, ×${STRATEGY.forecastDiscount}` : '';
  const head = `${snow(f.overnightIn, units)} ${tomorrow ? 'tonight' : 'overnight'} (${f.label}${disc})`;
  const extra = f.extraIn > 0 ? ` + ${snow(f.extraIn, units)} more in 24 h` : '';
  const day = f.dayIn > 0 ? ` + ${snow(f.dayIn, units)} forecast ${tomorrow ? 'tomorrow' : 'today'}` : '';
  return `${head}${extra}${day}`;
}

export interface DayLineCtx {
  eff: number;
  sx: number;
  crewMin: boolean; // crew scope with several members: '(crew min 7 → 6)' instead of '(7 → 6 left)'
  units: Units;
}

/** The day-cost line: unlimited, use-it-or-lose-it, spends a day, or saving the day. */
export function dayLine(g: CapGroupId, st: GroupState, term: DayTerm, c: DayLineCtx): string {
  const R = st.remaining;
  const T = snow(st.threshold, c.units);
  if (term.kind === 'free') return `${label(g)} is unlimited – no day cost`;
  if (term.kind === 'use') {
    const days = `${R} ${label(g)} day${R === 1 ? '' : 's'} left`;
    return `Use-it-or-lose-it: ${days} vs ~${num1(c.sx)} ski days ${signed(term.value)}`;
  }
  if (term.kind === 'spend') {
    const left = c.crewMin ? `crew min ${R} → ${R - 1}` : `${R} → ${R - 1} left`;
    return `Spends 1 ${label(g)} day (${left}): ${snow(c.eff, c.units)} ≥ save-threshold ${T}`;
  }
  return `Saving ${label(g)}: ${snow(c.eff, c.units)} < save-threshold ${T} ${signed(term.value)}`;
}

/** '{names} has 0 Alta/Snowbird days left'. */
export function zeroDaysLine(names: readonly string[], g: CapGroupId): string {
  const who = names.length ? `${joinNames(names)} ${names.length === 1 ? 'has' : 'have'} ` : '';
  return `${who}0 ${label(g)} days left`;
}

export const PREVIEW_REASON = 'Preview – resorts not open yet; bookings not checked';
