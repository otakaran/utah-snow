// UDOT traffic events -> corridor signals and advisories (spec §5.6 escalation). Pure.
// Active full closures outside the Construction layer close the corridor; Construction full closures become
// advisories. Interstates are scoped to the corridor by location words, since I-80/I-84 events are statewide.
// Guardsman Pass events (the seasonal gate) never change state: they are recorded only and give BCC its note.
import { GUARDSMAN_MP } from '../../../../config/roads.ts';
import { HOUR, isoToMs, isoUtc } from '../../../shared/time.ts';
import type { Corridor, RoadStatus } from '../../../shared/types.ts';
import { GUARDSMAN_RE } from './classify.ts';
import type { Signal } from './raw.ts';
import type { TrafficEvent } from './udot-list.ts';

export type Advisory = RoadStatus['advisories'][number];
export const EVENT_SOURCE = 'UDOT event';
export const GUARDSMAN_SOURCE = 'UDOT event (Guardsman Pass)';
const EVENT_ID = 'udot-event:';
const UPCOMING_MS = 72 * HOUR; // construction closures starting this soon are shown too
const MP_RE = /\b(?:MP|MILE ?POSTS?)\s*(\d+(?:\.\d+)?)/gi;

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

/** On SR-190 the lowest stated milepost decides (a closure from MP 12 still blocks Brighton); otherwise the word. */
function atGuardsman(e: TrafficEvent): boolean {
  const mps = e.route === 'SR-190' ? [...e.text.matchAll(MP_RE)].map((m) => Number(m[1])) : [];
  return mps.length ? Math.min(...mps) >= GUARDSMAN_MP : GUARDSMAN_RE.test(e.text.toUpperCase());
}

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
    if (atGuardsman(e)) {
      if (started) signals.push({ source: GUARDSMAN_SOURCE, raw: e.text, state: 'unknown' });
    } else if (e.layer === 'Construction') {
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
    signals: (prev.crossChecks ?? []).filter((x) => x.source === EVENT_SOURCE || x.source === GUARDSMAN_SOURCE),
    advisories: (prev.advisories ?? []).filter((a) => a.id.startsWith(EVENT_ID) && (isoToMs(a.until) ?? 0) > now),
  };
}
