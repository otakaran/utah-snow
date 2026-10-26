// Pure view of the NWS alerts (the weather page's strip and its §04 details): severity -> StatusChip tone
// (Extreme/Severe bad, Moderate warn, else off), the alert's kind word, when it runs, and which resorts its UGC
// zones cover (RESORTS[id].nws.{base,summit}.zone; a valley-only alert keeps its zone codes). Expired alerts drop.
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import { daysBetween, formatClock, formatLocalDate, isoToMs, localDate } from '../../../shared/time.ts';
import type { NwsAlert, ResortId } from '../../../shared/types.ts';
import type { Tone } from '../../ui/status.ts';

export interface AlertView {
  key: string;
  tone: Tone;
  /** 'Warning', 'Watch', 'Advisory' … from the event name, else the severity. */
  word: string;
  event: string;
  headline: string;
  /** 'until 6:00 PM tomorrow', 'from Thu 6:00 PM until Fri 6:00 AM'; '' when the times are unknown. */
  when: string;
  /** Resort names the zones cover, canonical order; the zone codes when none does. */
  tags: string[];
}

const RANK: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, off: 3 };
const KINDS = ['Warning', 'Watch', 'Advisory', 'Statement', 'Emergency', 'Outlook'];

export function alertTone(severity: string): Tone {
  if (severity === 'Extreme' || severity === 'Severe') return 'bad';
  return severity === 'Moderate' ? 'warn' : 'off';
}

export function alertWord(event: string, severity: string): string {
  const last = event.trim().split(/\s+/).pop() ?? '';
  return KINDS.includes(last) ? last : severity || 'Alert';
}

/** Resorts whose base or summit NWS point sits in one of the UGC zones. */
export function zoneResorts(zones: readonly string[]): ResortId[] {
  const set = new Set(zones);
  return RESORT_IDS.filter((id) => set.has(RESORTS[id].nws.base.zone) || set.has(RESORTS[id].nws.summit.zone));
}

/** '6:00 PM', '6:00 PM tomorrow', 'Thu 6:00 PM' within the week, else 'Jan 12 6:00 PM' (Denver). */
export function whenText(iso: string, nowMs: number): string {
  const date = localDate(iso);
  const today = localDate(nowMs);
  if (!date || !today) return '';
  const diff = daysBetween(today, date);
  const clock = formatClock(iso);
  if (diff === 0) return clock;
  if (diff === 1) return `${clock} tomorrow`;
  if (diff === -1) return `${clock} yesterday`;
  return `${formatLocalDate(date, diff > 0 && diff < 7 ? 'weekday' : 'md')} ${clock}`;
}

function span(a: NwsAlert, nowMs: number): string {
  const onset = isoToMs(a.onset);
  const until = a.ends ? `until ${whenText(a.ends, nowMs)}` : '';
  if (onset !== null && onset > nowMs && a.onset) return `from ${whenText(a.onset, nowMs)}${until ? ` ${until}` : ''}`;
  return until;
}

const isAlert = (a: unknown): a is NwsAlert =>
  typeof a === 'object' &&
  a !== null &&
  typeof (a as NwsAlert).event === 'string' &&
  Array.isArray((a as NwsAlert).zones);

/** Active alerts, worst first (NWS order within a tone); anything but an alert array (the e2e seed's '{}') gives []. */
export function alertsView(alerts: unknown, nowMs: number): AlertView[] {
  if (!Array.isArray(alerts)) return [];
  return alerts
    .filter(isAlert)
    .filter((a) => {
      const ends = isoToMs(a.ends);
      return ends === null || ends > nowMs;
    })
    .map((a): AlertView => {
      const resorts = zoneResorts(a.zones);
      return {
        key: `${a.event}|${a.onset ?? ''}|${a.ends ?? ''}|${a.zones.join(',')}`,
        tone: alertTone(a.severity),
        word: alertWord(a.event, a.severity),
        event: a.event,
        headline: a.headline,
        when: span(a, nowMs),
        tags: resorts.length ? resorts.map((id) => RESORTS[id].name) : [...a.zones],
      };
    })
    .sort((x, y) => RANK[x.tone] - RANK[y.tone]);
}
