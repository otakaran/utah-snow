import { describe, expect, it } from 'vitest';
import { auditIdFor } from './optimistic.ts';
import type { AuditEntry } from './wire.ts';

const row = (id: number, at: number, action: string, entity: AuditEntry['entity'], key: string): AuditEntry => ({
  id,
  at,
  action,
  entity,
  key,
  before: null,
  after: null,
  undoneBy: null,
});

describe('auditIdFor', () => {
  const audit = [
    row(9, 300, 'undo', 'ski_days', 'ana|2027-01-03'),
    row(8, 200, 'upsertDay', 'ski_days', 'ana|2027-01-03'),
    row(7, 100, 'upsertDay', 'ski_days', 'ana|2027-01-03'),
    row(6, 100, 'upsertBooking', 'bookings', '2027-01-03|alta-parking|*'),
  ];

  it("finds the newest live row of the op's action and key", () => {
    const op = { op: 'upsertDay', personId: 'ana', date: '2027-01-03', resortId: 'alta', status: 'planned' } as const;
    expect(auditIdFor(audit, op)).toBe(8);
    expect(auditIdFor([{ ...row(8, 200, 'upsertDay', 'ski_days', 'ana|2027-01-03'), undoneBy: 9 }], op)).toBeNull();
    expect(auditIdFor(audit, { op: 'deleteDay', personId: 'ana', date: '2027-01-03' })).toBeNull();
    expect(auditIdFor(audit, { op: 'upsertBooking', date: '2027-01-03', kind: 'alta-parking', personId: '*' })).toBe(6);
  });

  it('has nothing to undo for addPerson and undo itself', () => {
    expect(auditIdFor(audit, { op: 'undo', auditId: 8 })).toBeNull();
    expect(auditIdFor(audit, { op: 'addPerson', name: 'Eva', mode: 'ski' })).toBeNull();
  });
});
