// UDOT WordPress post -> facts (spec §5.6). Pure. Rules run on S, the uppercased non-Guardsman sentences;
// corridor and advisory tests run on U, the whole uppercased text. The WP title is a timestamp and is ignored.
// O4: the winter wording is unverified, so every result keeps the raw text for display.
import { CORRIDORS } from '../../../../config/roads.ts';
import { obj } from '../../../shared/json.ts';
import { decodeEntities, stripHtml } from '../../../shared/num.ts';
import {
  addDays,
  DAY,
  daysBetween,
  hm24,
  isoToMs,
  isoUtc,
  localDate,
  localHM,
  monthNum,
  zonedToUtc,
} from '../../../shared/time.ts';
import type { Corridor, ResortId, RoadState, RoadStatus } from '../../../shared/types.ts';
import { str } from './raw.ts';

export interface PostFacts {
  id: number;
  ms: number;
  at: string; // date_gmt + 'Z'
  link: string;
  site: string; // hostname
  text: string; // display text, one line per paragraph
  corridors: Corridor[];
  state: RoadState | null; // null = info
  headline: string | null; // the sentence that set the state
  traction: boolean;
  lifted: boolean; // 'Traction Law LIFTED': older traction posts stop counting
  delay: boolean;
  closesAt: string | null;
  eto: string | null;
  reason: RoadStatus['reason'];
  parkingFull: ResortId[];
  guardsman: string | null; // 'Guardsman Pass: …' for an info post with Guardsman sentences
  advisory: { text: string; until: string; route: string | null } | null; // standing advisory: never bears state
}

const SPLIT_RE = /(?<=[.!?])\s+|(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{203C}\u{2049}]|\u{FE0F})+|\n/u;
const GUARDSMAN_RE = /\bGUARDSMAN\b/;
const TRACTION_RE = /\b(TRACTION (DEVICES|LAW)|CHAINS|4X4|4WD|3PMSF|M\+S)\b/;
const REQUIRED_RE = /\b(REQUIRED|IN EFFECT)\b/;
const DELAY_RE = /\b(DELAYS?|STOPPED TRAFFIC|SLIDE[- ]?OFFS?|CRASH)\b/;
// O4 extension (not in §5.6): 'Traction Law LIFTED' / 'Interlodge lifted' is an open post, checked before rule 1.
const LIFT_RE = /\b(INTERLODGE|TRACTION LAW|RESTRICTIONS?|CLOSURE)\b[^.\n]{0,40}\b(LIFTED|HAS ENDED)\b/;
const TRACTION_LIFT_RE = /\bTRACTION (LAW|DEVICES|RESTRICTIONS?)\b[^.\n]{0,40}\bLIFTED\b/;
const RULES: readonly [RegExp, RoadState][] = [
  [LIFT_RE, 'open'],
  [/\bINTERLODGE\b/, 'interlodge'],
  [/\b(RE-?OPEN(ED)?|IS OPEN|NOW OPEN)\b|\b(SR-?(190|210)|CANYON) OPEN\b|\bOPEN:/, 'open'],
  [/\bWILL (BE )?(TEMPORARILY )?CLOS(E|ED)\b/, 'closure-scheduled'],
  [/\bCLOSED\b|\bFULL (CANYON )?CLOSURE\b|\bCLOSURE ALERT\b/, 'closed'],
  [/\bUPHILL (TRAFFIC )?RESTRICT|\bRESTRICTING UPHILL\b/, 'uphill-restricted'],
];
const REASONS: readonly [RegExp, NonNullable<RoadStatus['reason']>][] = [
  [/\b(AVALANCHE|MITIGATION|CONTROL WORK)\b/, 'avalanche'],
  [/\b(CRASH|SLIDE[- ]?OFFS?)\b/, 'crash'],
  [/\b(WEATHER|FLOOD(ING)?|DEBRIS|ROCK ?SLIDE)\b/, 'weather'],
  [/\bCONSTRUCTION\b/, 'construction'],
];
const CLOSES_RE = /\bCLOS(E|ING)\b[^.\n]*?\bAT (\d{1,2}(:\d{2})?\s?(AM|PM))/;
const ETO_RE = /\bETO\b[^:\n]*:\s*([^\n]+)/;
const ETO_OPENING_RE = /\bESTIMATED (TIME OF )?OPENING( AT)?\s*([0-9: ]+(AM|PM))/;
const PARK_RE = /\b(ALTA|SNOWBIRD|BRIGHTON|SOLITUDE)\b(?=[^.\n]{0,60}\bFULL\b)/g;
const ADV_WORK_RE = /\b(CONSTRUCTION|BRIDGE REPLACEMENT|LANE CLOSURE)\b/;
const ADV_END_RE = /\b(THROUGH|UNTIL|COMPLETE (IN )?(LATE )?(SPRING|SUMMER|[A-Z]{3,9} \d{1,2}))\b/;
const ADV_DATE_RE =
  /\b(?:THROUGH|UNTIL|COMPLETE(?: IN)?)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+(\d{1,2})\b/g;
const ROUTE_RE = /\b(I|SR|US)-?\s?(\d{1,3})\b/;
const ADVISORY_DEFAULT_DAYS = 60;

/** Resorts reported FULL in uppercased text ('PARKING IN ALTA IS NOW FULL'). */
export const parkingIn = (upper: string): ResortId[] => [
  ...new Set([...upper.matchAll(PARK_RE)].map((m) => (m[1] ?? '').toLowerCase() as ResortId)),
];

/** content.rendered -> display text: img alt kept, block ends become newlines, tags stripped, entities decoded. */
export function postText(html: string): string {
  const s = html
    .replace(/<img\b[^>]*?\balt\s*=\s*"([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|figure)\s*>/gi, '\n');
  return decodeEntities(stripHtml(s))
    .split('\n')
    .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export const sentences = (text: string): string[] =>
  text
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z0-9]/.test(s));

const joinSentences = (list: string[]): string => list.map((s) => (/[.!?:]$/.test(s) ? s : `${s}.`)).join(' ');

/** Local wall clock '12:30AM' / '9 PM' after the post -> ISO instant (next day when earlier than the post). */
function closesAtIso(clock: string, postMs: number): string | null {
  const c = /:\d{2}/.test(clock) ? clock : clock.replace(/\s?(AM|PM)$/, ':00$1');
  const hm = hm24(c);
  if (!hm) return null;
  const day = localDate(postMs);
  const ms = zonedToUtc(`${hm < localHM(postMs) ? addDays(day, 1) : day} ${hm}`);
  return ms === null ? null : isoUtc(ms);
}

/** Standing-advisory end: the latest stated month-day (end of that local day), else date_gmt + 60 days. */
function advisoryUntil(u: string, postMs: number): string {
  const day = localDate(postMs);
  const dates = [...u.matchAll(ADV_DATE_RE)];
  let best = /\b(SPRING|SUMMER)\b/.test(u) || !dates.length ? postMs + ADVISORY_DEFAULT_DAYS * DAY : 0;
  for (const m of dates) {
    const mo = monthNum(m[1] ?? '');
    const d = Number(m[2]);
    if (mo < 1 || d < 1 || d > 31) continue;
    let date = `${day.slice(0, 4)}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (daysBetween(day, date) < -60) date = `${Number(day.slice(0, 4)) + 1}${date.slice(4)}`;
    best = Math.max(best, zonedToUtc(`${date} 23:59`) ?? 0);
  }
  return isoUtc(best);
}

const routeOf = (u: string): string | null => ROUTE_RE.exec(u)?.slice(1, 3).join('-') ?? null;

function firstMatch<T>(s: string, table: readonly (readonly [RegExp, T])[]): [RegExp, T] | null {
  for (const [re, v] of table) if (re.test(s)) return [re, v];
  return null;
}

/** One WP post (as returned by /wp/v2/posts) on `site` (a CorridorDef.wpSite) -> facts, or null when malformed. */
export function classifyPost(post: unknown, site: string): PostFacts | null {
  const p = obj(post);
  const html = str(obj(p?.content)?.rendered);
  const at = `${str(p?.date_gmt).replace(/Z$/, '')}Z`;
  const ms = isoToMs(at);
  const id = Number(p?.id);
  if (!p || ms === null || !Number.isFinite(id)) return null;
  const text = postText(html);
  const U = text.toUpperCase();
  const all = sentences(text);
  const guard = all.filter((s) => GUARDSMAN_RE.test(s.toUpperCase()));
  const keep = all.filter((s) => !GUARDSMAN_RE.test(s.toUpperCase()));
  const S = keep.map((s) => s.toUpperCase()).join('\n');

  const lifted = TRACTION_LIFT_RE.test(S);
  const traction = TRACTION_RE.test(S) && REQUIRED_RE.test(S) && !lifted;
  const delay = DELAY_RE.test(S);
  const isAdvisory = ADV_WORK_RE.test(U) && ADV_END_RE.test(U);
  let state: RoadState | null = null;
  let headline: string | null = null;
  if (!isAdvisory) {
    const hit = firstMatch(S, RULES);
    if (hit) state = hit[1];
    else if (traction) state = 'traction';
    else if (delay) state = 'delays';
    const re = hit?.[0] ?? (traction ? TRACTION_RE : delay ? DELAY_RE : null);
    if (re) headline = keep.find((s) => re.test(s.toUpperCase())) ?? null;
  }
  const closes = CLOSES_RE.exec(S);
  const eto = ETO_RE.exec(S)?.[1]?.trim() ?? ETO_OPENING_RE.exec(S)?.[3]?.replace(/\s+/g, '') ?? null;

  const siteDefs = (Object.keys(CORRIDORS) as Corridor[]).filter((c) => CORRIDORS[c].wpSite === site);
  const corridors = siteDefs.filter((c) => CORRIDORS[c].postRe.test(U));
  if (guard.length && state === null && siteDefs.includes('bcc') && !corridors.includes('bcc')) corridors.push('bcc');
  const parkingFull = parkingIn(S);

  return {
    id,
    ms,
    at,
    link: str(p.link),
    site: site.replace(/^https?:\/\//, ''),
    text: text.length > 600 ? `${text.slice(0, 599).trimEnd()}…` : text,
    corridors,
    state,
    headline: headline ? headline.slice(0, 200) : null,
    traction,
    lifted,
    delay,
    closesAt: closes?.[2] ? closesAtIso(closes[2], ms) : null,
    eto: eto ? eto.slice(0, 80) : null,
    reason: firstMatch(S, REASONS)?.[1] ?? null,
    parkingFull,
    guardsman: guard.length && state === null ? `Guardsman Pass: ${joinSentences(guard)}`.slice(0, 300) : null,
    advisory: isAdvisory
      ? {
          text: (all[0] ?? text).slice(0, 200),
          until: advisoryUntil(U, ms),
          route: routeOf(U) ?? routeOf(str(obj(p.title)?.rendered).toUpperCase()), // dedupe key only
        }
      : null,
  };
}

/** A posts payload (must be a JSON array, §5.2 gate) -> facts, newest first. Null when the payload is not an array. */
export function classifyFeed(body: unknown, site: string): PostFacts[] | null {
  if (!Array.isArray(body)) return null;
  const out: PostFacts[] = [];
  for (const p of body) {
    const f = classifyPost(p, site);
    if (f) out.push(f);
  }
  return out.sort((a, b) => b.ms - a.ms);
}
