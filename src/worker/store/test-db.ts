// Test-only: apply migrations/*.sql to the workerd test D1 (vitest worker project). Idempotent via d1_migrations.
import { applyD1Migrations } from 'cloudflare:test';
import init from '../../../migrations/0001_init.sql?raw';
import tracker from '../../../migrations/0002_tracker.sql?raw';

const split = (sql: string): string[] =>
  sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, '').trim() !== '');

export function migrate(db: D1Database): Promise<void> {
  return applyD1Migrations(db, [
    { name: '0001_init.sql', queries: split(init) },
    { name: '0002_tracker.sql', queries: split(tracker) },
  ]);
}

/** Empty the store and tracker tables between tests (storage is shared across a test file); FK order. */
export async function clearStore(db: D1Database): Promise<void> {
  await db.batch(
    ['source_state', 'counters', 'stake_frames', 'audit_log', 'ski_days', 'bookings', 'people'].map((t) =>
      db.prepare(`DELETE FROM ${t}`),
    ),
  );
}
