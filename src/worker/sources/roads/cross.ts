// Resort feeds that hint at road state (spec §4.5 crossChecks, §5.6 escalation and tractionLaw). Pure.
// Fetched by this job: Snowbird roads/parking/alerts, Brighton reportpal-roads. Read from last-good resort rows
// (ctx.prev, ResortSnapshot.roadHint/alerts): Alta, Brighton comments, Deer Valley Roads[].
import { arr, obj } from '../../../shared/json.ts';
import { roadHintState } from '../../../shared/road-hint.ts';
import type { Corridor, RoadState } from '../../../shared/types.ts';
import type { PrevRows } from '../types.ts';
import { type RoadsRaw, type Signal, str } from './raw.ts';

export const RESORT_ROWS = ['resort:alta', 'resort:brighton', 'resort:deer-valley'] as const;
const ROAD_WORDS = /\b(road|canyon|sr-?210|highway|hwy)\b/i;
const MAX_ALERTS = 3;

const clip = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 200);

/** Text of an alert item of unknown schema (the Snowbird winter schema is unverified). */
function alertText(v: unknown): string {
  if (typeof v === 'string') return clip(v);
  const o = obj(v);
  if (!o) return '';
  return clip(['title', 'name', 'message', 'description', 'body', 'text'].map((k) => str(o[k])).join(' '));
}

const STATES = new Set<string>([
  'open',
  'traction',
  'delays',
  'closure-scheduled',
  'uphill-restricted',
  'closed',
  'interlodge',
]);

/** ResortSnapshot.roadHint of a last-good resort row. */
function roadHint(prev: PrevRows, row: string, source: string): Signal | null {
  const hint = obj(obj(prev[row])?.roadHint);
  const raw = clip(str(hint?.raw));
  if (!raw) return null;
  const s = str(hint?.state);
  return { source, raw, state: STATES.has(s) ? (s as RoadState) : 'unknown' }; // the resort adapter's own reading
}

function snowbird(raw: RoadsRaw): Signal[] {
  const out: Signal[] = [];
  const road = arr(raw.snowbird.roads)
    .map(obj)
    .find((r) => str(r?.name) === 'Highway SR-210');
  if (road) {
    const st = str(road.status);
    const state: RoadState =
      st === 'closed' ? 'closed' : st === 'open_restricted' ? 'traction' : st ? 'open' : 'unknown';
    out.push({ source: 'Snowbird SR-210', raw: st, state });
  }
  const alerts = arr(raw.snowbird.alerts)
    .map(alertText)
    .filter((t) => /interlodge/i.test(t) || ROAD_WORDS.test(t));
  for (const t of alerts.slice(0, MAX_ALERTS)) {
    out.push({ source: 'Snowbird alert', raw: t, state: roadHintState(t) === 'interlodge' ? 'interlodge' : 'unknown' });
  }
  const p = obj(raw.snowbird.parking);
  const inv = obj(p?.free_parking_inventory);
  if (p && inv) {
    const lots = `${str(inv.value)}/${str(inv.max)} (${str(inv.percentage)}%)`;
    out.push({
      source: 'Snowbird parking',
      raw: `free lots ${lots}; SR-210 roadside ${str(p.highway_parking)}`,
      state: 'unknown',
    });
  }
  return out;
}

function alta(prev: PrevRows): Signal[] {
  const out: Signal[] = [];
  const hint = roadHint(prev, 'resort:alta', 'Alta road status');
  if (hint) out.push(hint);
  const alerts = arr(obj(prev['resort:alta'])?.alerts).map(alertText);
  for (const t of alerts.filter((a) => /interlodge/i.test(a) || ROAD_WORDS.test(a)).slice(0, MAX_ALERTS)) {
    const hint = roadHintState(t); // the shared resort-text reading; an alert only ever escalates
    out.push({ source: 'Alta alert', raw: t, state: hint === 'interlodge' || hint === 'closed' ? hint : 'unknown' });
  }
  return out;
}

function brighton(raw: RoadsRaw, prev: PrevRows): Signal[] {
  const out: Signal[] = [];
  for (const r of arr(raw.brighton).map(obj).slice(0, 2)) {
    const restriction = str(obj(r?.restrictionOne)?.restrictionText).trim();
    if (!r || !str(r.mountainPassName)) continue;
    const traction = restriction !== '' && restriction.toLowerCase() !== 'none';
    const text = `${str(r.mountainPassName)}: ${str(r.roadCondition) || '?'}, restriction ${restriction || 'none'}`;
    out.push({ source: 'Brighton roads', raw: clip(text), state: traction ? 'traction' : 'open' });
  }
  const hint = roadHint(prev, 'resort:brighton', 'Brighton comments');
  if (hint) out.push(hint);
  return out;
}

/** Resort signals for one corridor. */
export function resortSignals(c: Corridor, raw: RoadsRaw, prev: PrevRows): Signal[] {
  if (c === 'lcc') return [...snowbird(raw), ...alta(prev)];
  if (c === 'bcc') return brighton(raw, prev);
  if (c === 'parleys') {
    const dv = roadHint(prev, 'resort:deer-valley', 'Deer Valley roads'); // I-80, US-40, SR-224, SR-248
    if (!dv) return [];
    const chains = dv.state === 'traction' || /\(chains\)/i.test(dv.raw);
    return [{ ...dv, state: chains ? 'traction' : dv.state === 'open' ? 'open' : 'unknown' }];
  }
  return [];
}
