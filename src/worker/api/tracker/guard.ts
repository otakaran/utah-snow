// POST /api/tracker guards (spec §9.4): the shared 403/503/429 and JSON-object checks (../post-guard.ts), then 422
// bad-input (parseOp). Plus the day rules shared by upsertDay and undo (422 skiers-only / cap-exceeded, warnings).
import { CAP_GROUPS, TRACKER_RESORTS } from '../../../../config/ikon.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import { capOf, group, remaining, skiersOnly } from '../../../shared/caps.ts';
import type { Obj } from '../../../shared/json.ts';
import { addDays, isTripDay } from '../../../shared/time.ts';
import type { BookingKind, SkiMode, TrackerResort } from '../../../shared/types.ts';
import { type DayStatus, MAX_PEOPLE, type PersonRow, type TrackerRaw } from '../../store/tracker.ts';
import { admit, invalid } from '../post-guard.ts';

export { invalid };

export type Op =
  | { op: 'upsertDay'; personId: string; date: string; resortId: TrackerResort; status: DayStatus; prev: number | null }
  | { op: 'deleteDay'; personId: string; date: string; prev: number }
  | { op: 'addPerson'; name: string; mode: SkiMode; color: string | null }
  | { op: 'updatePerson'; personId: string; name?: string; mode?: SkiMode; color?: string; prev: number }
  | { op: 'removePerson'; personId: string; prev: number }
  | { op: 'upsertBooking'; date: string; kind: BookingKind; personId: string; note: string | null; prev: number | null }
  | { op: 'deleteBooking'; date: string; kind: BookingKind; personId: string; prev: number }
  | { op: 'undo'; auditId: number };

/** A request that passed every guard. */
export interface Guarded {
  op: Op;
  clientId: string;
  ipHash: string;
  now: number;
}

const BOOKING_KINDS = [
  'dv-lift',
  'alta-parking',
  'brighton-parking',
  'solitude-parking',
  'snowbird-parking',
] as const satisfies readonly BookingKind[];

class BadInput extends Error {}

/** Every guard of §9.4; the parsed op, or the 403/503/429/422 response. */
export async function guard(req: Request, env: Env, now: number): Promise<Guarded | Response> {
  const a = await admit(req, env, now);
  if (a instanceof Response) return a;
  try {
    const clientId = take<string>(
      a.body,
      'clientId',
      (v) => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v),
      '16 hex',
    );
    return { op: parseOp(a.body), clientId, ipHash: a.ipHash, now };
  } catch (err) {
    if (err instanceof BadInput) return invalid('bad-input', err.message);
    throw err;
  }
}

function take<T>(o: Obj, k: string, ok: (v: unknown) => boolean, what: string): T {
  if (!ok(o[k])) throw new BadInput(`${k}: expected ${what}`);
  return o[k] as T;
}

const chars = (s: string): number => [...s].length;
const oneOf =
  (list: readonly string[]) =>
  (v: unknown): boolean =>
    typeof v === 'string' && list.includes(v);
const isId = (v: unknown): boolean => typeof v === 'string' && /^[\w-]{1,32}$/.test(v);
const isDate = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && addDays(v, 0) === v && isTripDay(v);
const isToken = (v: unknown): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isName = (v: unknown): boolean =>
  typeof v === 'string' && v === v.trim() && chars(v) >= 1 && chars(v) <= 40 && !/\p{Cc}/u.test(v);
const isColor = (v: unknown): boolean => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const isNote = (v: unknown): boolean => v == null || (typeof v === 'string' && chars(v) <= 80 && !/\p{Cc}/u.test(v));
const isMode = oneOf(['ski', 'board', 'unknown']);
const opt = <T>(o: Obj, k: string, ok: (v: unknown) => boolean, what: string): T | undefined =>
  o[k] === undefined ? undefined : take<T>(o, k, ok, what);
const prevOf = (o: Obj): number | null =>
  take<number | null>(o, 'prevUpdatedAt', (v) => v == null || isToken(v), 'ms or null') ?? null;
const prevSet = (o: Obj): number => take<number>(o, 'prevUpdatedAt', isToken, 'ms');

function bookingKey(o: Obj): { date: string; kind: BookingKind; personId: string } {
  const date = take<string>(o, 'date', isDate, 'a trip date');
  const kind = take<BookingKind>(o, 'kind', oneOf(BOOKING_KINDS), BOOKING_KINDS.join('|'));
  const perPerson = kind === 'dv-lift';
  const personId = take<string>(o, 'personId', perPerson ? isId : (v) => v === '*', perPerson ? 'a person id' : "'*'");
  return { date, kind, personId };
}

function parseOp(o: Obj): Op {
  const person = () => take<string>(o, 'personId', isId, 'a person id');
  const date = () => take<string>(o, 'date', isDate, 'a trip date');
  switch (o.op) {
    case 'upsertDay':
      return {
        op: 'upsertDay',
        personId: person(),
        date: date(),
        resortId: take(o, 'resortId', oneOf(TRACKER_RESORTS), TRACKER_RESORTS.join('|')),
        status: take(o, 'status', oneOf(['planned', 'skied']), 'planned|skied'),
        prev: prevOf(o),
      };
    case 'deleteDay':
      return { op: 'deleteDay', personId: person(), date: date(), prev: prevSet(o) };
    case 'addPerson':
      return {
        op: 'addPerson',
        name: take(o, 'name', isName, '1-40 characters, trimmed'),
        mode: take(o, 'mode', isMode, 'ski|board|unknown'),
        color: opt<string>(o, 'color', isColor, '#rrggbb') ?? null,
      };
    case 'updatePerson':
      return {
        op: 'updatePerson',
        personId: person(),
        name: opt(o, 'name', isName, '1-40 characters, trimmed'),
        mode: opt(o, 'mode', isMode, 'ski|board|unknown'),
        color: opt(o, 'color', isColor, '#rrggbb'),
        prev: prevSet(o),
      };
    case 'removePerson':
      return { op: 'removePerson', personId: person(), prev: prevSet(o) };
    case 'upsertBooking': {
      const note = take<string | null>(o, 'note', isNote, 'at most 80 characters')?.trim() || null;
      return { op: 'upsertBooking', ...bookingKey(o), note, prev: prevOf(o) };
    }
    case 'deleteBooking':
      return { op: 'deleteBooking', ...bookingKey(o), prev: prevSet(o) };
    case 'undo':
      return { op: 'undo', auditId: take(o, 'auditId', (v) => isToken(v) && (v as number) > 0, 'an audit id') };
    default:
      throw new BadInput('op: unknown');
  }
}

const resortName = (r: TrackerResort): string => RESORTS[r === 'alta-snowbird' ? 'alta' : r].name;

/** 422 when the rules refuse `resortId` for the person on `date` (spec §9.3 upsertDay); else the warnings. */
export function dayRules(raw: TrackerRaw, p: PersonRow, date: string, resortId: TrackerResort): Response | string[] {
  if (p.mode === 'board' && skiersOnly(resortId))
    return invalid('skiers-only', `${resortName(resortId)} is skiers-only and ${p.name} rides a board`);
  const g = group(resortId);
  const left = remaining(raw.days, p.id, g, { excludeDate: date });
  if (left <= 0) {
    const message = `${p.name} has used all ${capOf(g)} ${CAP_GROUPS[g].label} days`;
    return invalid('cap-exceeded', message, { group: g, remaining: Math.max(0, left) });
  }
  const warnings: string[] = [];
  if (p.mode === 'unknown' && skiersOnly(resortId)) warnings.push(`Confirm ski/board for ${p.name}`);
  const dv = raw.bookings.some((b) => b.kind === 'dv-lift' && b.personId === p.id && b.date === date);
  if (resortId === 'deer-valley' && !dv) warnings.push('No DV Ikon reservation recorded');
  return warnings;
}

/** 422 when `name` would join the active crew as a 13th person or clash (case-insensitive) with another active name. */
export function personClash(raw: TrackerRaw, selfId: string | null, name: string): Response | null {
  const others = raw.people.filter((p) => p.deletedAt === null && p.id !== selfId);
  if (others.length >= MAX_PEOPLE) return invalid('max-people', `The crew is full (${MAX_PEOPLE} people)`);
  const lower = name.toLowerCase();
  if (others.some((p) => p.name.toLowerCase() === lower))
    return invalid('duplicate-name', `${name} is already in the crew`);
  return null;
}
