// Date and route rules the pick needs: parking-reservation days (config/parking.ts, spec §4.7 / C.7), Snowbird busy
// days, and the corridors on the way from a base to a resort (spec §4.5).
// TODO: move parkingRequired to src/shared/parking.ts (parkingCal) and routeCorridors to geo.ts once those land.
import { ASSUMED_HOLIDAYS, PARKING, type ParkingRule } from '../../../config/parking.ts';
import { RESORTS } from '../../../config/resorts.ts';
import { CORRIDORS, WASATCH_BACK_LON } from '../../../config/roads.ts';
import { localParts, zonedToUtc } from '../time.ts';
import type { Corridor, ResortId } from '../types.ts';

const FRI_SAT_SUN: readonly number[] = [5, 6, 0];

/** 'A..B' inclusive range or a single date. */
function inRange(date: string, spec: string): boolean {
  const [a = '', b = a] = spec.split('..');
  return date >= a && date <= b;
}

/** Weekday of a local date, 0 = Sunday; -1 when invalid. */
export function weekday(date: string): number {
  const ms = zonedToUtc(`${date} 12:00`);
  return ms === null ? -1 : (localParts(ms)?.weekday ?? -1);
}

/** True when the resort's lot needs a reservation on `date` (Alta, Brighton, Solitude; C.7). */
export function parkingRequired(r: ResortId, date: string): boolean {
  const res = (PARKING[r] as ParkingRule).reservation;
  if (!res) return false;
  if (res.season && !inRange(date, res.season)) return false;
  if (res.except?.some((d) => inRange(date, d))) return false;
  if (res.dates?.some((d) => inRange(date, d)) || res.holidays?.some((d) => inRange(date, d))) return true;
  return res.days === 'FRI_SAT_SUN' && FRI_SAT_SUN.includes(weekday(date));
}

/** Fri-Sun or an assumed holiday: Snowbird's free lots fill early. */
export const isBusy = (date: string): boolean =>
  FRI_SAT_SUN.includes(weekday(date)) || ASSUMED_HOLIDAYS.some((d) => inRange(date, d));

/** Booking page and cancel-by time of a resort's parking, or null when there is nothing to book. */
export function parkingBooking(r: ResortId): { url: string; cancelBy: string | null } | null {
  const rule = PARKING[r] as ParkingRule;
  const url = rule.book ?? /https?:\/\/\S+/.exec(rule.paid?.book ?? '')?.[0];
  return url ? { url, cancelBy: rule.cancelBy ?? rule.paid?.refundBy ?? null } : null;
}

/** The resort's corridor, plus Parleys when the drive crosses the Wasatch (base lon >= -111.70 to LCC/BCC). */
export function routeCorridors(baseLon: number, r: ResortId): Corridor[] {
  const own: Corridor = RESORTS[r].corridor;
  const back = baseLon >= WASATCH_BACK_LON;
  const cross = back ? own === 'lcc' || own === 'bcc' : r === 'deer-valley';
  return cross && own !== 'parleys' ? [own, 'parleys'] : [own];
}

/** Short road name of a corridor: 'SR-210', 'SR-190', 'I-80', 'SR-226'. */
export const roadName = (c: Corridor): string => CORRIDORS[c].passes[0].name.split(' ')[0] ?? c;
