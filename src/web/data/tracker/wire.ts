// Wire shapes of GET/POST /api/tracker (spec §7, §9.3) and their client-side checks. Rows that fail a check are
// dropped, so a partial or newer payload never crashes a view. The API never sends ip_hash, client_id or updated_by.
import type { DayStatus } from '../../../shared/caps.ts';
import { isoToMs } from '../../../shared/time.ts';
import type {
  BookingKind,
  PickTracker,
  SkiMode,
  TrackerAuditRow,
  TrackerBookingRow,
  TrackerDayRow,
  TrackerEntity,
  TrackerPerson,
  TrackerResort,
  TrackerState as WireState,
} from '../../../shared/types.ts';

/** One crew member (`people` row without its token). */
export type Person = Omit<TrackerPerson, 'updatedAt'>;
export type PersonRow = TrackerPerson;
export type TrackerDay = PickTracker['days'][number];
export type DayRow = TrackerDayRow;
export type TrackerBooking = NonNullable<PickTracker['bookings']>[number];
export type BookingRow = TrackerBookingRow;
export type AuditEntry = TrackerAuditRow;
/** The client keeps everything but `summary` (it recomputes caps from `days`). */
export type TrackerState = Omit<WireState, 'summary'>;

export const EMPTY_STATE: TrackerState = { people: [], days: [], bookings: [], audit: [], serverTime: 0 };

/** One POST /api/tracker op without its token; the store adds `prevUpdatedAt` and `clientId` when it sends. */
export type TrackerOp =
  | { op: 'upsertDay'; personId: string; date: string; resortId: TrackerResort; status: DayStatus }
  | { op: 'deleteDay'; personId: string; date: string }
  | { op: 'addPerson'; name: string; mode: SkiMode }
  | { op: 'updatePerson'; personId: string; name?: string; mode?: SkiMode }
  | { op: 'removePerson'; personId: string }
  | { op: 'upsertBooking'; date: string; kind: BookingKind; personId: string; note?: string | null }
  | { op: 'deleteBooking'; date: string; kind: BookingKind; personId: string }
  | { op: 'undo'; auditId: number };

const MODES: readonly string[] = ['ski', 'board', 'unknown'];
const ENTITIES: readonly string[] = ['ski_days', 'people', 'bookings'];
const RESORTS: readonly string[] = [
  'alta',
  'snowbird',
  'alta-snowbird',
  'brighton',
  'solitude',
  'deer-valley',
  'snowbasin',
];
const KINDS: readonly string[] = [
  'dv-lift',
  'alta-parking',
  'brighton-parking',
  'solitude-parking',
  'snowbird-parking',
];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function rows<T>(raw: unknown, map: (o: Obj) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const r of raw) {
    const v = isObj(r) ? map(r) : null;
    if (v) out.push(v);
  }
  return out;
}

const person = (o: Obj): PersonRow | null =>
  str(o.id) && str(o.name) && str(o.mode) && MODES.includes(o.mode) && num(o.updatedAt)
    ? {
        id: o.id,
        name: o.name,
        mode: o.mode as SkiMode,
        color: str(o.color) ? o.color : '',
        updatedAt: o.updatedAt,
      }
    : null;

const day = (o: Obj): DayRow | null =>
  str(o.personId) && str(o.date) && str(o.resortId) && RESORTS.includes(o.resortId) && num(o.updatedAt)
    ? {
        personId: o.personId,
        date: o.date,
        resortId: o.resortId as TrackerResort,
        status: o.status === 'planned' ? 'planned' : 'skied',
        updatedAt: o.updatedAt,
      }
    : null;

const booking = (o: Obj): BookingRow | null =>
  str(o.date) && str(o.kind) && KINDS.includes(o.kind) && num(o.updatedAt)
    ? {
        date: o.date,
        kind: o.kind as BookingKind,
        personId: str(o.personId) ? o.personId : '*',
        note: str(o.note) ? o.note : null,
        updatedAt: o.updatedAt,
      }
    : null;

/** before/after arrive as objects (or JSON text from an older Worker). */
function json(v: unknown): unknown {
  if (!str(v)) return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const auditRow = (o: Obj): AuditEntry | null =>
  num(o.id) && num(o.at) && str(o.action) && str(o.entity) && ENTITIES.includes(o.entity) && str(o.key)
    ? {
        id: o.id,
        at: o.at,
        action: o.action,
        entity: o.entity as TrackerEntity,
        key: o.key,
        before: json(o.before),
        after: json(o.after),
        undoneBy: num(o.undoneBy) ? o.undoneBy : null,
      }
    : null;

/** The GET shape (also `state` in a 200 and possibly `current` in a 409), or null when it is not one. */
export function parseState(raw: unknown): TrackerState | null {
  if (!isObj(raw) || !Array.isArray(raw.people) || !Array.isArray(raw.days)) return null;
  const people = rows(raw.people, person);
  const ids = new Set(people.map((p) => p.id));
  const serverTime = num(raw.serverTime) ? raw.serverTime : (isoToMs(str(raw.serverTime) ? raw.serverTime : null) ?? 0);
  return {
    people,
    days: rows(raw.days, day).filter((d) => ids.has(d.personId)), // a removed person's days stay hidden
    bookings: rows(raw.bookings, booking),
    audit: rows(raw.audit, auditRow).sort((a, b) => b.at - a.at || b.id - a.id),
    serverTime,
  };
}

const CODE_TEXT: Record<string, string> = {
  'skiers-only': 'Alta and Deer Valley are skiers-only',
  'cap-exceeded': 'No Ikon days left in that group',
  'max-people': 'The crew is full (12 people)',
  'duplicate-name': 'Someone in the crew already has that name',
  'bad-input': 'That change was not valid',
  'already-undone': 'Already undone',
  'changed-since': 'Changed since – undo the newer change first',
};

/** Inline text for a failed mutation (403, 409 on undo, 422, 429, 5xx). */
export function failureText(status: number, body: unknown): string {
  const b = isObj(body) ? body : {};
  if (status === 429) {
    const s = num(b.retryAfterS) ? b.retryAfterS : 60;
    const wait = s < 90 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`;
    return `Too many changes from this network – try again in ${wait}`;
  }
  if (status === 403) return 'Not saved: this page is not allowed to edit the tracker';
  const code = str(b.code) ? b.code : '';
  if (status === 422 || status === 409) {
    if (str(b.message) && b.message.trim()) return b.message;
    return CODE_TEXT[code] ?? (status === 409 ? 'Changed on another phone' : 'That change was not valid');
  }
  if (status === 503 && str(b.message) && b.message.trim()) return `Not saved: ${b.message}`;
  return `Not saved (HTTP ${status}) – try again`;
}

/** Server warnings of a 200 (`warnings?: string[]`). */
export const warningsOf = (body: unknown): string[] =>
  isObj(body) && Array.isArray(body.warnings) ? body.warnings.filter(str) : [];

/** `state` of a 200, or `current` of a 409 when it is a full state. */
export const stateIn = (body: unknown, key: 'state' | 'current'): TrackerState | null =>
  isObj(body) ? parseState(body[key]) : null;
