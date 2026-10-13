// Ski-day tracker reads, the commit batch, audit rows and rate counters (spec §9.1, §9.3, §9.4). ALL tracker SQL lives
// here and in tracker/writes.ts (the guarded entity writes). Rows leave D1 already mapped to API field names; ip_hash,
// client_id and updated_by are never selected. A commit is ONE batch: guarded write, guarded audit insert (+ undo mark),
// then the four state reads, so the response state is the post-write state and costs no extra D1 call.
import { tryJson } from '../../shared/json.ts';
import type { BookingKind, SkiMode, TrackerResort } from '../../shared/types.ts';

export * from './tracker/writes.ts';

export const AUDIT_LIMIT = 50;

export type DayStatus = 'planned' | 'skied';
export type Entity = 'ski_days' | 'people' | 'bookings';

export interface PersonRow {
  id: string;
  name: string;
  mode: SkiMode;
  color: string;
  updatedAt: number;
  deletedAt: number | null; // soft delete (removePerson); never sent by GET
}

export interface DayRow {
  personId: string;
  date: string;
  resortId: TrackerResort;
  status: DayStatus;
  updatedAt: number;
}

export interface BookingRow {
  date: string;
  kind: BookingKind;
  personId: string; // '*' = car-level parking
  note: string | null;
  updatedAt: number;
}

export interface AuditEntry {
  id: number;
  at: number;
  action: string;
  entity: Entity;
  key: string;
  before: unknown;
  after: unknown;
  undoneBy: number | null;
}

/** Everything in the tracker, deleted people (and their days) included; GET filters (api/tracker/get.ts). */
export interface TrackerRaw {
  people: PersonRow[];
  days: DayRow[];
  bookings: BookingRow[];
  audit: AuditEntry[]; // newest first, AUDIT_LIMIT rows
  target?: AuditEntry | null; // the undo target, when asked for
}

interface AuditDbRow extends Omit<AuditEntry, 'before' | 'after'> {
  before_json: string | null;
  after_json: string | null;
}

const AUDIT_COLS = 'id, at, action, entity, key, before_json, after_json, undone_by AS undoneBy';

function stateStmts(db: D1Database): D1PreparedStatement[] {
  return [
    db.prepare(
      'SELECT id, name, mode, color, updated_at AS updatedAt, deleted_at AS deletedAt FROM people ORDER BY created_at, id',
    ),
    db.prepare(
      'SELECT person_id AS personId, date, resort_id AS resortId, status, updated_at AS updatedAt FROM ski_days ORDER BY date, person_id',
    ),
    db.prepare(
      'SELECT date, kind, person_id AS personId, note, updated_at AS updatedAt FROM bookings ORDER BY date, kind, person_id',
    ),
    db.prepare(`SELECT ${AUDIT_COLS} FROM audit_log ORDER BY id DESC LIMIT ?1`).bind(AUDIT_LIMIT),
  ];
}

const toAudit = (r: AuditDbRow): AuditEntry => ({
  id: r.id,
  at: r.at,
  action: r.action,
  entity: r.entity,
  key: r.key,
  before: tryJson(r.before_json) ?? null,
  after: tryJson(r.after_json) ?? null,
  undoneBy: r.undoneBy ?? null,
});

function decodeState(rs: readonly D1Result[]): TrackerRaw {
  const rows = <T>(i: number): T[] => (rs[i]?.results ?? []) as T[];
  return {
    people: rows<PersonRow>(0),
    days: rows<DayRow>(1),
    bookings: rows<BookingRow>(2),
    audit: rows<AuditDbRow>(3).map(toAudit),
  };
}

/** One batch: people, days, bookings, the last 50 audit rows (+ the audit row `auditId` for undo). */
export async function readTracker(db: D1Database, auditId?: number): Promise<TrackerRaw> {
  const stmts = stateStmts(db);
  if (auditId !== undefined) stmts.push(db.prepare(`SELECT ${AUDIT_COLS} FROM audit_log WHERE id = ?1`).bind(auditId));
  const rs = await db.batch(stmts);
  const raw = decodeState(rs);
  if (auditId !== undefined) {
    const t = rs[4]?.results[0] as AuditDbRow | undefined;
    raw.target = t ? toAudit(t) : null;
  }
  return raw;
}

/**
 * Runs `stmts` (guarded write first, then its audit statements) and the state reads in one batch.
 * `changes` is the guarded write's row count: 0 means a guard rejected it (spec §9.3 step 4).
 */
export async function commit(
  db: D1Database,
  stmts: readonly D1PreparedStatement[],
): Promise<{ changes: number; raw: TrackerRaw }> {
  const rs = await db.batch([...stmts, ...stateStmts(db)]);
  return { changes: Number(rs[0]?.meta.changes ?? 0), raw: decodeState(rs.slice(stmts.length)) };
}

export interface AuditInsert {
  at: number;
  clientId: string;
  ipHash: string;
  action: string;
  entity: Entity;
  key: string;
  before: unknown;
  after: unknown;
}

/** The audit row for the write just before it in the batch; inserts nothing when that write changed nothing. */
export function auditStmt(db: D1Database, a: AuditInsert): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (at, client_id, ip_hash, action, entity, key, before_json, after_json)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE changes() > 0`,
    )
    .bind(
      a.at,
      a.clientId,
      a.ipHash,
      a.action,
      a.entity,
      a.key,
      a.before == null ? null : JSON.stringify(a.before),
      a.after == null ? null : JSON.stringify(a.after),
    );
}

/** After an undo's audit insert: point the undone row at it (only if that insert happened). */
export function markUndoneStmt(db: D1Database, auditId: number): D1PreparedStatement {
  return db
    .prepare(
      'UPDATE audit_log SET undone_by = last_insert_rowid() WHERE id = ?1 AND undone_by IS NULL AND changes() > 0',
    )
    .bind(auditId);
}

export interface RateCounter {
  key: string;
  expiresAt: number; // window end, epoch ms
}

/** One batch of counter increments (spec §9.4); returns each counter's new value, in order. */
export async function bumpCounters(db: D1Database, counters: readonly RateCounter[]): Promise<number[]> {
  const stmt = db.prepare(
    `INSERT INTO counters (key, value, expires_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = counters.value + 1 RETURNING value`,
  );
  const rs = await db.batch(counters.map((c) => stmt.bind(c.key, c.expiresAt)));
  return rs.map((r) => Number((r.results[0] as { value?: number } | undefined)?.value ?? 0));
}

/** A write's optimistic-concurrency token: now, but strictly after the token it replaces (spec §9.3). */
export const nextToken = (now: number, prev: number | null): number => Math.max(now, (prev ?? 0) + 1);

export const findDay = (raw: TrackerRaw, personId: string, date: string): DayRow | undefined =>
  raw.days.find((d) => d.personId === personId && d.date === date);

export const findPerson = (raw: TrackerRaw, id: string): PersonRow | undefined => raw.people.find((p) => p.id === id);

export type BookingKey = Pick<BookingRow, 'date' | 'kind' | 'personId'>;
export const findBooking = (raw: TrackerRaw, k: BookingKey): BookingRow | undefined =>
  raw.bookings.find((b) => b.date === k.date && b.kind === k.kind && b.personId === k.personId);
