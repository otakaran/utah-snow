// UDOT traffic events -> corridor signals and advisories (spec §5.6 escalation). Pure.
// Active full closures outside the Construction layer close the corridor; Construction full closures become
// advisories. Interstates are scoped to the corridor by location words, since I-80/I-84 events are statewide.
import { HOUR, isoToMs, isoUtc } from '../../../shared/time.ts';
import type { Corridor, RoadStatus } from '../../../shared/types.ts';
import type { Signal } from './raw.ts';
import type { TrafficEvent } from './udot-list.ts';

export type Advisory = RoadStatus['advisories'][number];
export const EVENT_SOURCE = 'UDOT event';
const EVENT_ID = 'udot-event:';
const UPCOMING_MS = 72 * HOUR; // construction closures starting this soon are shown too

const SCOPE: Record<Corridor, readonly { route: string; near?: RegExp }[]> = {
  lcc: [{ route: 'SR-210' }],
  bcc: [{ route: 'SR-190' }],
  parleys: [
    { route: 'I-80', near: /PARLEY|LAMBS|MOUNTAIN DELL|JEREMY|KIMBALL|SUMMIT PARK|EAST CANYON|QUARRY/i },
    { route: 'SR-224' },
  ],
  snowbasin: [
    { route: 'I-84', near: /WEBER|MOUNTAIN GREEN|UINTAH|MORGAN|PEACEFUL VALLEY|STODDARD/i },
    { route: 'SR-167' },
    { route: 'SR-226' },
  ],
};

const inScope = (c: Corridor, e: TrafficEvent): boolean =>
  SCOPE[c].some((s) => s.route === e.route && (!s.near || s.near.test(e.text)));

/** Events of this tick for one corridor. Non-full active incidents are recorded as 'delays'. */
export function trafficFor(
  c: Corridor,
  events: TrafficEvent[],
  now: number,
): { signals: Signal[]; advisories: Advisory[] } {
  const signals: Signal[] = [];
  const advisories: Advisory[] = [];
  for (const e of events) {
    if (!inScope(c, e)) continue;
    const started = (e.startMs ?? Number.NEGATIVE_INFINITY) <= now;
    const ended = (e.endMs ?? Number.POSITIVE_INFINITY) < now;
    if (ended) continue;
    if (e.layer === 'Construction') {
      if (e.full && (started || (e.startMs ?? 0) - now <= UPCOMING_MS)) {
        advisories.push({ id: e.id, text: e.text, link: null, until: isoUtc(e.endMs ?? now + 24 * HOUR) });
      }
    } else if (started) {
      signals.push({ source: EVENT_SOURCE, raw: e.text || `${e.route}`, state: e.full ? 'closed' : 'delays' });
    }
  }
  return { signals, advisories };
}

/** Ticks without traffic searches keep the previous row's event signals and unexpired event advisories. */
export function trafficCarry(prev: RoadStatus | null, now: number): { signals: Signal[]; advisories: Advisory[] } {
  if (!prev) return { signals: [], advisories: [] };
  return {
    signals: (prev.crossChecks ?? []).filter((x) => x.source === EVENT_SOURCE),
    advisories: (prev.advisories ?? []).filter((a) => a.id.startsWith(EVENT_ID) && (isoToMs(a.until) ?? 0) > now),
  };
}
