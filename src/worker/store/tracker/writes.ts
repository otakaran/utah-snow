// Guarded tracker entity writes (spec §9.3 step 3). Each statement changes 0 rows when its optimistic-concurrency
// token (`prev` = the updated_at the client saw; null = "expect no row") or a business guard fails, so the audit insert
// that follows (`changes() > 0`) is skipped and the API re-reads to tell 409 from 422. Used by the ops and by undo.
import type { BookingKind, SkiMode, TrackerResort } from '../../../shared/types.ts';
import type { DayStatus } from '../tracker.ts';

export const MAX_PEOPLE = 12; // active people (spec §9.3 addPerson)

export interface DayWrite {
  personId: string;
  date: string;
  resortId: TrackerResort;
  status: DayStatus;
  updatedAt: number;
  clientId: string;
  /** Tracker values of the resort's cap group (alta-snowbird: alta, snowbird, alta-snowbird). */
  groupValues: readonly string[];
  cap: number; // days allowed in the group; unlimited binds 1e9
  prev: number | null;
}

/** Insert or update a day: cap clause over the person's other dates, then the token. A set `prev` never inserts. */
export function dayUpsertStmt(db: D1Database, d: DayWrite): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO ski_days (person_id, date, resort_id, status, updated_at, updated_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE (SELECT COUNT(*) FROM ski_days WHERE person_id = ?1 AND date <> ?2
                AND resort_id IN (SELECT value FROM json_each(?7))) < ?8
         AND (?9 IS NULL OR EXISTS (SELECT 1 FROM ski_days WHERE person_id = ?1 AND date = ?2))
       ON CONFLICT (person_id, date) DO UPDATE SET resort_id = excluded.resort_id, status = excluded.status,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by
       WHERE ski_days.updated_at = ?9`,
    )
    .bind(
      d.personId,
      d.date,
      d.resortId,
      d.status,
      d.updatedAt,
      d.clientId,
      JSON.stringify(d.groupValues),
      Number.isFinite(d.cap) ? d.cap : 1e9,
      d.prev,
    );
}

export function dayDeleteStmt(db: D1Database, personId: string, date: string, prev: number): D1PreparedStatement {
  return db
    .prepare('DELETE FROM ski_days WHERE person_id = ?1 AND date = ?2 AND updated_at = ?3')
    .bind(personId, date, prev);
}

export interface PersonInsert {
  id: string;
  name: string;
  mode: SkiMode;
  color: string;
  at: number;
}

/** addPerson: at most 12 active, active names unique (case-insensitive). */
export function personInsertStmt(db: D1Database, p: PersonInsert): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO people (id, name, mode, color, created_at, updated_at, deleted_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?5, NULL
       WHERE (SELECT COUNT(*) FROM people WHERE deleted_at IS NULL) < ${MAX_PEOPLE}
         AND NOT EXISTS (SELECT 1 FROM people WHERE deleted_at IS NULL AND lower(name) = lower(?2))`,
    )
    .bind(p.id, p.name, p.mode, p.color, p.at);
}

export interface PersonSet {
  id: string;
  name: string;
  mode: SkiMode;
  color: string;
  deletedAt: number | null; // null = active afterwards
  updatedAt: number;
  prev: number;
}

/**
 * updatePerson / removePerson (deletedAt set) / their undo. Leaving the person active re-checks the 12-active limit
 * and the unique name against the other active people.
 */
export function personSetStmt(db: D1Database, p: PersonSet): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE people SET name = ?2, mode = ?3, color = ?4, deleted_at = ?5, updated_at = ?6
       WHERE id = ?1 AND updated_at = ?7
         AND (?5 IS NOT NULL OR (
           (SELECT COUNT(*) FROM people WHERE deleted_at IS NULL AND id <> ?1) < ${MAX_PEOPLE}
           AND NOT EXISTS (SELECT 1 FROM people WHERE deleted_at IS NULL AND id <> ?1 AND lower(name) = lower(?2))))`,
    )
    .bind(p.id, p.name, p.mode, p.color, p.deletedAt, p.updatedAt, p.prev);
}

export interface BookingWrite {
  date: string;
  kind: BookingKind;
  personId: string;
  note: string | null;
  updatedAt: number;
  clientId: string;
  prev: number | null;
}

export function bookingUpsertStmt(db: D1Database, b: BookingWrite): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO bookings (date, kind, person_id, note, updated_at, updated_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE ?7 IS NULL OR EXISTS (SELECT 1 FROM bookings WHERE date = ?1 AND kind = ?2 AND person_id = ?3)
       ON CONFLICT (date, kind, person_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by
       WHERE bookings.updated_at = ?7`,
    )
    .bind(b.date, b.kind, b.personId, b.note, b.updatedAt, b.clientId, b.prev);
}

export function bookingDeleteStmt(
  db: D1Database,
  key: { date: string; kind: BookingKind; personId: string },
  prev: number,
): D1PreparedStatement {
  return db
    .prepare('DELETE FROM bookings WHERE date = ?1 AND kind = ?2 AND person_id = ?3 AND updated_at = ?4')
    .bind(key.date, key.kind, key.personId, prev);
}
