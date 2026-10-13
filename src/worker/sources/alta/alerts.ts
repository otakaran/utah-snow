// window.Alta.alerts[] (spec §5.4): 'road-status' -> roadHint (LCC, read by the roads escalation §5.6),
// 'parking-status' -> parking, 'alert-bar' -> alerts[]. 'summer-road-status' is the Albion Basin summer road, not
// SR-210, so it is ignored like 'unsupported-browser'. Statuses are staff free text: raw text is always kept.
import { arr, obj, str } from '../../../shared/json.ts';
import { text } from '../../../shared/num.ts';
import { roadHintState } from '../../../shared/road-hint.ts';
import type { ParkingNow, RoadState } from '../../../shared/types.ts';

export interface AltaAlerts {
  parking: ParkingNow;
  alerts: string[];
  roadHint: { raw: string; state: RoadState } | null;
}

/** Observed: 'Available', 'Full', 'Reservation Req'. */
export function parkingState(raw: string): ParkingNow['state'] {
  if (/reserv/i.test(raw)) return 'reservation-required';
  if (/full/i.test(raw)) return 'full';
  if (/fill|limited/i.test(raw)) return 'filling';
  if (/closed/i.test(raw)) return 'closed';
  return /avail|open/i.test(raw) ? 'available' : 'unknown';
}

export function readAlerts(list: unknown): AltaAlerts {
  const out: AltaAlerts = { parking: { state: 'unknown', raw: null, note: null }, alerts: [], roadHint: null };
  for (const v of arr(list)) {
    const a = obj(v);
    if (!a || a.enabled === false) continue;
    const status = str(a.status);
    const message = text(a.message);
    if (a.type === 'road-status' && status) {
      const raw = message ? `${status}: ${message}` : status;
      out.roadHint = { raw, state: roadHintState(raw) }; // observed: 'Open', '4x4 or Chains Req'
    } else if (a.type === 'parking-status' && status) {
      out.parking = { state: parkingState(status), raw: status, note: message };
    } else if (a.type === 'alert-bar' && (message ?? status)) {
      out.alerts.push(message ?? status ?? '');
    }
  }
  return out;
}
