// Brighton (Boyne FeedService) raw shape and pure field mappers (spec §5.4 'resort:brighton', §5.5).
// The feed is loose JSON: every reader checks types itself and never trusts the declared shape.
import { num, range, text } from '../../../shared/num.ts';
import { hm24 } from '../../../shared/time.ts';
import type { Gate, LiftState, LiftStatus, ParkingNow, RoadState } from '../../../shared/types.ts';

export interface FeedStatusItem {
  name?: unknown;
  status?: unknown;
  statusIcon?: unknown;
  comment?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
}
export interface FeedArea {
  name?: unknown;
  lifts?: { lift?: (FeedStatusItem | null)[] | null } | null;
  gates?: { gate?: (FeedStatusItem | null)[] | null } | null;
}
export interface FeedParking {
  status?: unknown;
  percentFull?: unknown;
  comment?: unknown;
  alert?: unknown;
  reservationsRequired?: unknown;
}
export interface FeedComment {
  name?: unknown;
  title?: unknown;
  text?: unknown;
}
export type FeedLocation = Record<string, { inches?: unknown } | string | null | undefined>;
export interface BrightonFeed {
  name?: unknown;
  updated?: unknown;
  operations?: { resortStatus?: unknown } | null;
  currentConditions?: {
    resortwide?: Record<string, unknown> | null;
    resortLocations?: { location?: (FeedLocation | null)[] | null } | null;
  } | null;
  comments?: { comment?: (FeedComment | null)[] | null } | null;
  facilities?: {
    areas?: { area?: (FeedArea | null)[] | null } | null;
    parkingLots?: { parking?: (FeedParking | null)[] | null } | null;
    winterActivities?: { activity?: (FeedStatusItem | null)[] | null } | null;
  } | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

// statusIcon values from brightonresort.com's own sort table (§5.5). Unlisted values map to closed;
// `raw` keeps the provider text so an unexpected value stays visible.
const ICON = new Map<string, LiftState>([
  ['open', 'open'],
  ['on-hold', 'hold'],
  ['delayed', 'scheduled'],
  ['scheduled', 'scheduled'],
  ['closed', 'closed'],
  ['scenic-only', 'closed'],
  ['bike-only', 'closed'],
  ['event', 'closed'],
  ['sign-out', 'closed'],
]);
const slugIcon = (v: unknown): string =>
  str(v)
    .toLowerCase()
    .replace(/[\s_]+/g, '-');

/** statusIcon first, then the status text ('On Hold' -> on-hold); unlisted -> closed; both missing -> unknown. */
export function liftState(icon: unknown, status: unknown): LiftState {
  const a = slugIcon(icon);
  const b = slugIcon(status);
  return ICON.get(a) ?? ICON.get(b) ?? (a || b ? 'closed' : 'unknown');
}

/** '09:00' / '9:00' / '9:00 AM' -> 'HH:MM', else null. */
function clock(v: unknown): string | null {
  const s = str(v);
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return `${m[1]?.padStart(2, '0')}:${m[2]}`;
  return s ? hm24(s) : null;
}

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** facilities.areas.area[].lifts.lift[], skipping null areas, null lift arrays and nameless lifts. */
export function lifts(feed: BrightonFeed): LiftStatus[] {
  const out: LiftStatus[] = [];
  for (const area of list(feed.facilities?.areas?.area)) {
    for (const l of list(area?.lifts?.lift)) {
      const name = str(l?.name);
      if (!l || !name) continue;
      out.push({
        id: slug(name),
        name,
        state: liftState(l.statusIcon, l.status),
        raw: str(l.status) || str(l.statusIcon),
        area: str(area?.name) || null,
        opensAt: clock(l.openTime),
        closesAt: clock(l.closeTime),
        note: text(l.comment, 200),
      });
    }
  }
  return out;
}

/** Access gates: winterActivities '... Access' rows (Catherine's Pass, Twin Lake Pass) plus any areas[].gates.gate[]. */
export function gates(feed: BrightonFeed): Gate[] {
  const fromAreas = list(feed.facilities?.areas?.area).flatMap((a) => list(a?.gates?.gate));
  const acts = list(feed.facilities?.winterActivities?.activity).filter((a) => /access|gate/i.test(str(a?.name)));
  const out: Gate[] = [];
  for (const g of [...acts, ...fromAreas]) {
    const name = text(g?.name, 120);
    if (!g || !name) continue;
    out.push({ name, state: liftState(g.statusIcon, g.status), note: text(g.comment, 200) });
  }
  return out;
}

/** Main Lot. Fill level wins over the reservation flag; the reservation calendar itself lives in config/parking.ts. */
export function parking(feed: BrightonFeed): ParkingNow {
  const lot = list(feed.facilities?.parkingLots?.parking)[0];
  if (!lot) return { state: 'unknown', raw: null };
  const status = str(lot.status);
  const pct = range(num(lot.percentFull), 0, 100);
  let state: ParkingNow['state'] = 'unknown';
  if (/full/i.test(status) || (pct !== null && pct >= 100)) state = 'full';
  else if (/clos/i.test(status)) state = 'closed';
  else if (pct !== null && pct >= 75) state = 'filling';
  else if (lot.reservationsRequired === true) state = 'reservation-required';
  else if (/open/i.test(status)) state = 'available';
  return {
    state,
    raw: status || null,
    percentFull: pct,
    note: text(lot.alert, 300) ?? text(lot.comment, 300),
  };
}

const ALERT_NAMES = new Set(['commentAlert', 'trailsAlert', 'liftsAlert']);

/** comments.comment[]: the conditions report, banner alerts (+ the parking alert) and the 'Road' line. */
export function comments(feed: BrightonFeed): { report: string | null; alerts: string[]; road: string | null } {
  let report: string | null = null;
  let road: string | null = null;
  const alerts: string[] = [];
  for (const c of list(feed.comments?.comment)) {
    const name = str(c?.name);
    const body = text(c?.text);
    if (!body) continue;
    if (name === 'Comment') report = body;
    else if (name === 'Road') road = body;
    else if (ALERT_NAMES.has(name)) alerts.push(body);
  }
  const lotAlert = text(list(feed.facilities?.parkingLots?.parking)[0]?.alert, 300);
  if (lotAlert) alerts.push(lotAlert);
  return { report, alerts, road };
}

/** Hint only: the roads job owns the BCC state (§5.6). Conservative, and 'unknown' when unsure. */
export function roadState(s: string): RoadState {
  if (/interlodge/i.test(s)) return 'interlodge';
  if (/\b(?:closed|closure)\b/i.test(s)) return 'closed';
  if (
    /\bno (?:traction|chain)|traction (?:law |restrictions? )?(?:is |are |has been |have been )?(?:lifted|not)/i.test(s)
  ) {
    return 'open';
  }
  if (/traction|chains?\b|4x4|4wd|awd/i.test(s)) return 'traction';
  return /\bopen\b/i.test(s) ? 'open' : 'unknown';
}
