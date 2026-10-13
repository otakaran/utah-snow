// Pure op helpers for the tracker store: the optimistic patch shown while an op is in flight, the
// optimistic-concurrency token it sends, and what to do after a 409 (spec §9.3). Collections an op does not touch
// keep their array identity, so views that read only them do not re-render.
import type { BookingRow, DayRow, PersonRow, TrackerOp, TrackerState } from './wire.ts';

const sameDay = (d: DayRow, personId: string, date: string): boolean => d.personId === personId && d.date === date;
const sameBooking = (b: BookingRow, o: { date: string; kind: string; personId: string }): boolean =>
  b.date === o.date && b.kind === o.kind && b.personId === o.personId;

const findDay = (s: TrackerState, personId: string, date: string): DayRow | undefined =>
  s.days.find((d) => sameDay(d, personId, date));
const findPerson = (s: TrackerState, id: string): PersonRow | undefined => s.people.find((p) => p.id === id);
const findBooking = (s: TrackerState, o: { date: string; kind: string; personId: string }): BookingRow | undefined =>
  s.bookings.find((b) => sameBooking(b, o));

/** The state as it will look once `op` lands (addPerson and undo wait for the server). */
export function applyOp(s: TrackerState, op: TrackerOp): TrackerState {
  switch (op.op) {
    case 'upsertDay': {
      const prev = findDay(s, op.personId, op.date);
      const row: DayRow = {
        personId: op.personId,
        date: op.date,
        resortId: op.resortId,
        status: op.status,
        updatedAt: prev?.updatedAt ?? 0,
      };
      const rest = s.days.filter((d) => !sameDay(d, op.personId, op.date));
      return { ...s, days: [...rest, row].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) };
    }
    case 'deleteDay':
      return { ...s, days: s.days.filter((d) => !sameDay(d, op.personId, op.date)) };
    case 'updatePerson':
      return {
        ...s,
        people: s.people.map((p) =>
          p.id === op.personId ? { ...p, name: op.name ?? p.name, mode: op.mode ?? p.mode } : p,
        ),
      };
    case 'removePerson':
      return {
        ...s,
        people: s.people.filter((p) => p.id !== op.personId),
        days: s.days.filter((d) => d.personId !== op.personId),
      };
    case 'upsertBooking': {
      const prev = findBooking(s, op);
      const row: BookingRow = {
        date: op.date,
        kind: op.kind,
        personId: op.personId,
        note: op.note ?? prev?.note ?? null,
        updatedAt: prev?.updatedAt ?? 0,
      };
      return { ...s, bookings: [...s.bookings.filter((b) => !sameBooking(b, op)), row] };
    }
    case 'deleteBooking':
      return { ...s, bookings: s.bookings.filter((b) => !sameBooking(b, op)) };
    case 'addPerson':
    case 'undo':
      return s;
  }
}

/** `prevUpdatedAt` for the op against confirmed server state: the row's token, null when absent, undefined = none. */
export function prevOf(s: TrackerState, op: TrackerOp): number | null | undefined {
  switch (op.op) {
    case 'upsertDay':
    case 'deleteDay':
      return findDay(s, op.personId, op.date)?.updatedAt ?? null;
    case 'updatePerson':
    case 'removePerson':
      return findPerson(s, op.personId)?.updatedAt ?? null;
    case 'upsertBooking':
    case 'deleteBooking':
      return findBooking(s, op)?.updatedAt ?? null;
    case 'addPerson':
    case 'undo':
      return undefined;
  }
}

/** True when the server state already shows what the op wanted (someone else made the same change). */
export function satisfied(s: TrackerState, op: TrackerOp): boolean {
  switch (op.op) {
    case 'upsertDay': {
      const d = findDay(s, op.personId, op.date);
      return d !== undefined && d.resortId === op.resortId && d.status === op.status;
    }
    case 'deleteDay':
      return findDay(s, op.personId, op.date) === undefined;
    case 'updatePerson': {
      const p = findPerson(s, op.personId);
      return p !== undefined && (op.name ?? p.name) === p.name && (op.mode ?? p.mode) === p.mode;
    }
    case 'removePerson':
      return findPerson(s, op.personId) === undefined;
    case 'upsertBooking': {
      const b = findBooking(s, op);
      return b !== undefined && (op.note === undefined || (op.note ?? null) === b.note);
    }
    case 'deleteBooking':
      return findBooking(s, op) === undefined;
    case 'addPerson':
    case 'undo':
      return false;
  }
}

export type ConflictPlan = 'done' | 'retry' | 'stop';

/**
 * After a 409 and a fresh state: 'done' when the change is already there; 'retry' (once, with the new token) for
 * field-level person edits and booking checkboxes, where re-sending cannot clobber someone else's choice;
 * 'stop' for day cells and removals, which show the new value and the "Changed on another phone" toast.
 */
export function conflictPlan(s: TrackerState, op: TrackerOp): ConflictPlan {
  if (satisfied(s, op)) return 'done';
  switch (op.op) {
    case 'updatePerson':
      return findPerson(s, op.personId) ? 'retry' : 'stop';
    case 'upsertBooking':
    case 'deleteBooking':
      return 'retry';
    default:
      return 'stop';
  }
}
