// Pure one-line descriptions of audit rows (spec §9.3: last 50, each with Undo). before/after are row snapshots
// (camelCase API rows or snake_case D1 rows); a missing side means the row did not exist.
import { formatLocalDate } from '../../../shared/time.ts';
import type { BookingKind, TrackerResort } from '../../../shared/types.ts';
import { BOOKING_LABEL } from './bookings-model.ts';
import { RESORT_LABEL, STATUS_WORD } from './grid-model.ts';

interface AuditLike {
  action: string;
  entity: string;
  key: string;
  before: unknown;
  after: unknown;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null;

/** A string field by its camelCase or snake_case name. */
function field(o: Obj | null, camel: string, snake: string): string | null {
  const v = o?.[camel] ?? o?.[snake];
  return typeof v === 'string' ? v : null;
}

const removed = (o: Obj | null): boolean => o !== null && (o.deletedAt ?? o.deleted_at ?? null) !== null;
const md = (date: string | undefined): string => (date ? formatLocalDate(date, 'md') || date : '');

function resortText(o: Obj | null): string {
  const r = field(o, 'resortId', 'resort_id');
  const s = field(o, 'status', 'status');
  const label = r && r in RESORT_LABEL ? RESORT_LABEL[r as TrackerResort] : (r ?? '?');
  return s === 'planned' || s === 'skied' ? `${label} (${STATUS_WORD[s].toLowerCase()})` : label;
}

function dayLine(key: string, b: Obj | null, a: Obj | null, nameOf: (id: string) => string): string {
  const [personId = '', date] = key.split('|');
  const head = `${nameOf(personId)} · ${md(date)}`;
  if (!b) return `${head}: ${resortText(a)}`;
  if (!a) return `${head}: cleared ${resortText(b)}`;
  return `${head}: ${resortText(b)} → ${resortText(a)}`;
}

function personLine(key: string, b: Obj | null, a: Obj | null, nameOf: (id: string) => string): string {
  const name = field(a, 'name', 'name') ?? field(b, 'name', 'name') ?? nameOf(key);
  if (!b || (removed(b) && a && !removed(a))) return `${b ? 'Restored' : 'Added'} ${name}`;
  if (!a || removed(a)) return `Removed ${name}`;
  const was = field(b, 'name', 'name');
  if (was && was !== name) return `Renamed ${was} → ${name}`;
  const mode = field(a, 'mode', 'mode');
  return mode ? `${name}: ${field(b, 'mode', 'mode') ?? '?'} → ${mode}` : `Edited ${name}`;
}

function bookingLine(key: string, b: Obj | null, a: Obj | null, nameOf: (id: string) => string): string {
  const [date, kind = '', personId = '*'] = key.split('|');
  const label = BOOKING_LABEL[kind as BookingKind] ?? kind;
  const who = personId === '*' ? '' : ` · ${nameOf(personId)}`;
  const verb = !b ? 'Booked' : !a ? 'Unbooked' : 'Updated';
  return `${verb} ${label} · ${md(date)}${who}`;
}

/** 'Ana · Dec 28: Brighton (planned) → Alta (skied)', 'Added Eva', 'Undo: Booked Alta parking · Jan 2'. */
export function describeAudit(e: AuditLike, nameOf: (id: string) => string): string {
  const b = asObj(e.before);
  const a = asObj(e.after);
  let line: string;
  if (e.entity === 'ski_days') line = dayLine(e.key, b, a, nameOf);
  else if (e.entity === 'people') line = personLine(e.key, b, a, nameOf);
  else if (e.entity === 'bookings') line = bookingLine(e.key, b, a, nameOf);
  else line = `${e.action} ${e.key}`;
  return e.action === 'undo' ? `Undo: ${line}` : line;
}

/** The person an audit row is about (day, person or per-person booking), or null for crew-wide rows. */
export function auditPerson(e: Pick<AuditLike, 'entity' | 'key'>): string | null {
  const parts = e.key.split('|');
  const id =
    e.entity === 'ski_days' ? parts[0] : e.entity === 'people' ? e.key : e.entity === 'bookings' ? parts[2] : null;
  return id && id !== '*' ? id : null;
}
