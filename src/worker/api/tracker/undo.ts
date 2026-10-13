// The undo op (spec §9.3 "Undo"). Allowed once per audit row, never for an undo row, and only while the entity still
// carries the token in after_json (absent when after is null): otherwise 409 already-undone / changed-since. The
// revert goes through the same guarded writes as the ops (a re-inserted day re-checks the cap, so undo can be a 422),
// then the 'undo' audit row and `undone_by` on the original, all in the commit batch (mutate.ts run()).
import { capOf, GROUP_VALUES, group } from '../../../shared/caps.ts';
import {
  type AuditEntry,
  type BookingRow,
  bookingDeleteStmt,
  bookingUpsertStmt,
  type DayRow,
  dayDeleteStmt,
  dayUpsertStmt,
  findBooking,
  findDay,
  findPerson,
  markUndoneStmt,
  nextToken,
  type PersonRow,
  personSetStmt,
  type TrackerRaw,
} from '../../store/tracker.ts';
import { invalid } from '../post-guard.ts';
import { conflict } from './get.ts';
import { dayRules, type Guarded, personClash } from './guard.ts';
import type { Plan } from './mutate.ts';

type Revert = Omit<Plan, 'action' | 'entity' | 'key' | 'extra' | 'conflictCode'>;

const changedSince = (raw: TrackerRaw, g: Guarded) => conflict(raw, g.now, 'changed-since');

function undoDay(db: D1Database, t: AuditEntry, raw: TrackerRaw, g: Guarded): Revert | Response {
  const before = t.before as DayRow | null;
  const after = t.after as DayRow | null;
  const pk = before ?? after;
  if (!pk) return invalid('bad-input', `audit ${t.id} has no rows`);
  const prev = after?.updatedAt ?? null;
  const token = (r: TrackerRaw) => findDay(r, pk.personId, pk.date)?.updatedAt ?? null;
  if (token(raw) !== prev) return changedSince(raw, g);
  if (!before)
    return { write: dayDeleteStmt(db, pk.personId, pk.date, prev ?? 0), before: after, after: null, prev, token };
  const p = findPerson(raw, before.personId);
  if (!p) return invalid('bad-input', `audit ${t.id}: unknown person`);
  const rules = dayRules(raw, p, before.date, before.resortId);
  if (rules instanceof Response) return rules;
  const restored: DayRow = {
    personId: before.personId,
    date: before.date,
    resortId: before.resortId,
    status: before.status,
    updatedAt: nextToken(g.now, prev),
  };
  const gr = group(before.resortId);
  const write = { ...restored, clientId: g.clientId, groupValues: GROUP_VALUES[gr], cap: capOf(gr), prev };
  return {
    write: dayUpsertStmt(db, write),
    before: after,
    after: restored,
    prev,
    token,
    warnings: rules,
    rejected: (fresh) => {
      const r = dayRules(fresh, p, before.date, before.resortId);
      return r instanceof Response ? r : null;
    },
  };
}

/** addPerson is undone by a soft delete; removePerson and updatePerson by restoring the before row. */
function undoPerson(db: D1Database, t: AuditEntry, raw: TrackerRaw, g: Guarded): Revert | Response {
  const before = t.before as PersonRow | null;
  const after = t.after as PersonRow | null;
  if (!after) return invalid('bad-input', `audit ${t.id} has no rows`);
  const token = (r: TrackerRaw) => findPerson(r, after.id)?.updatedAt ?? null;
  if (token(raw) !== after.updatedAt) return changedSince(raw, g);
  const updatedAt = nextToken(g.now, after.updatedAt);
  const src = before ?? { ...after, deletedAt: updatedAt };
  const next: PersonRow = {
    id: after.id,
    name: src.name,
    mode: src.mode,
    color: src.color,
    deletedAt: src.deletedAt,
    updatedAt,
  };
  const clash = next.deletedAt === null ? personClash(raw, next.id, next.name) : null;
  if (clash) return clash;
  return {
    write: personSetStmt(db, { ...next, prev: after.updatedAt }),
    before: after,
    after: next,
    prev: after.updatedAt,
    token,
    rejected: (fresh) => (next.deletedAt === null ? personClash(fresh, next.id, next.name) : null),
  };
}

function undoBooking(db: D1Database, t: AuditEntry, raw: TrackerRaw, g: Guarded): Revert | Response {
  const before = t.before as BookingRow | null;
  const after = t.after as BookingRow | null;
  const pk = before ?? after;
  if (!pk) return invalid('bad-input', `audit ${t.id} has no rows`);
  const prev = after?.updatedAt ?? null;
  const token = (r: TrackerRaw) => findBooking(r, pk)?.updatedAt ?? null;
  if (token(raw) !== prev) return changedSince(raw, g);
  if (!before) return { write: bookingDeleteStmt(db, pk, prev ?? 0), before: after, after: null, prev, token };
  const restored: BookingRow = {
    date: before.date,
    kind: before.kind,
    personId: before.personId,
    note: before.note,
    updatedAt: nextToken(g.now, prev),
  };
  return {
    write: bookingUpsertStmt(db, { ...restored, clientId: g.clientId, prev }),
    before: after,
    after: restored,
    prev,
    token,
  };
}

export function undoPlan(db: D1Database, auditId: number, raw: TrackerRaw, g: Guarded): Plan | Response {
  const t = raw.target;
  if (!t) return invalid('bad-input', `auditId: no entry ${auditId}`);
  if (t.undoneBy !== null || t.action === 'undo') return conflict(raw, g.now, 'already-undone');
  const revert =
    t.entity === 'ski_days'
      ? undoDay(db, t, raw, g)
      : t.entity === 'people'
        ? undoPerson(db, t, raw, g)
        : undoBooking(db, t, raw, g);
  if (revert instanceof Response) return revert;
  return {
    ...revert,
    action: 'undo',
    entity: t.entity,
    key: t.key,
    extra: [markUndoneStmt(db, t.id)],
    conflictCode: 'changed-since',
  };
}
