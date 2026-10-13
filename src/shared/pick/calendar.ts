// Date and route rules the pick needs: parking-reservation days and Snowbird busy days come from parkingCal
// (src/shared/parking.ts, spec §4.7 / C.7); booking links for actions; short road names. Corridors: src/shared/geo.ts.
import { PARKING, type ParkingRule } from '../../../config/parking.ts';
import { CORRIDORS } from '../../../config/roads.ts';
import { parkingCal } from '../parking.ts';
import type { Corridor, ResortId } from '../types.ts';

/** True when the resort's lot needs a reservation on `date` (Alta, Brighton, Solitude; C.7). */
export const parkingRequired = (r: ResortId, date: string): boolean => parkingCal(r, date).required;

/** Fri-Sun or an assumed holiday: Snowbird's free lots fill early. */
export const isBusy = (date: string): boolean => parkingCal('snowbird', date).busy;

/** Booking page and cancel-by time of a resort's parking, or null when there is nothing to book. */
export function parkingBooking(r: ResortId): { url: string; cancelBy: string | null } | null {
  const rule = PARKING[r] as ParkingRule;
  const url = rule.book ?? /https?:\/\/\S+/.exec(rule.paid?.book ?? '')?.[0];
  return url ? { url, cancelBy: rule.cancelBy ?? rule.paid?.refundBy ?? null } : null;
}

/** Short road name of a corridor: 'SR-210', 'SR-190', 'I-80', 'SR-226'. */
export const roadName = (c: Corridor): string => CORRIDORS[c].passes[0].name.split(' ')[0] ?? c;
