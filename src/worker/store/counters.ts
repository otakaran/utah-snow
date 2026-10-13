// D1 `counters` (key, value, expires_at) plus the /api/health quota reads (spec §5.3, §7, §9.1).
// Every write refreshes expires_at = now + ttl, so `expires_at - ttl` is the last write time.
import { CPU_SUSPECT_TTL_MS } from '../../../config/schedule.ts';
import { DAY, localDate, ptDate } from '../../shared/time.ts';

export const YT_PENDING = 'yt:pending'; // ctx.prev key: cam ids of the yt:pending:{camId} counters
export const YT_UNITS = 'yt:units'; // ctx.prev key: units spent today (America/Los_Angeles quota day)
const YT_UNITS_TTL_MS = 2 * DAY;

export function counterIncStmt(db: D1Database, key: string, by: number, expiresAt: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO counters (key, value, expires_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = counters.value + excluded.value, expires_at = excluded.expires_at`,
    )
    .bind(key, by, expiresAt);
}

export async function incrementCounter(
  db: D1Database,
  key: string,
  by: number,
  ttlMs: number,
  now: number,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO counters (key, value, expires_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = counters.value + excluded.value, expires_at = excluded.expires_at
       RETURNING value`,
    )
    .bind(key, by, now + ttlMs)
    .first<{ value: number }>();
  return row?.value ?? by;
}

/** `cpu-suspect:{job}:{Denver date}` increment for the dispatcher's tick-start batch. */
export function cpuSuspectStmt(db: D1Database, job: string, now: number): D1PreparedStatement {
  return counterIncStmt(db, `cpu-suspect:${job}:${localDate(now)}`, 1, now + CPU_SUSPECT_TTL_MS);
}

/** YouTube quota counter key: the quota day is Pacific. */
export const ytUnitsKey = (now: number): string => `yt:units:${ptDate(now)}`;

/** Tick-start reads (readTickState batch): live `yt:pending:*` keys and today's units. */
export const ytPendingReadStmt = (db: D1Database, now: number): D1PreparedStatement =>
  db.prepare("SELECT key FROM counters WHERE key LIKE 'yt:pending:%' AND expires_at > ?1").bind(now);
export const ytUnitsReadStmt = (db: D1Database, now: number): D1PreparedStatement =>
  db.prepare('SELECT value FROM counters WHERE key = ?1').bind(ytUnitsKey(now));
export const decodePending = (r: D1Result | undefined): string[] =>
  ((r?.results ?? []) as { key: string }[]).map((x) => x.key.slice('yt:pending:'.length));
export const decodeUnits = (r: D1Result | undefined): number =>
  Number((r?.results[0] as { value?: number } | undefined)?.value ?? 0);

/** After a successful youtube run: drop the pending reports it was given, add the units it spent (48 h expiry). */
export function ytAfterStmts(db: D1Database, row: unknown, pending: unknown, now: number): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  const ids = Array.isArray(pending) ? pending.filter((p): p is string => typeof p === 'string') : [];
  if (ids.length) {
    const sql = "DELETE FROM counters WHERE key IN (SELECT 'yt:pending:' || value FROM json_each(?1))";
    out.push(db.prepare(sql).bind(JSON.stringify(ids)));
  }
  const units = (row as { unitsTick?: unknown } | null)?.unitsTick;
  if (typeof units === 'number' && units > 0)
    out.push(counterIncStmt(db, ytUnitsKey(now), units, now + YT_UNITS_TTL_MS));
  return out;
}

export interface HealthCounters {
  cpuSuspects: string[]; // jobs flagged in the last 24 h
  ytUnitsToday: number;
  kvWritesToday: number; // stake_frames rows since 00:00 UTC
  trackerWritesToday: number; // audit_log rows since 00:00 UTC
}

/** One batch: recent cpu-suspects, YouTube units, frame and tracker writes today. */
export async function readHealthCounters(db: D1Database, now: number): Promise<HealthCounters> {
  const utcMidnight = now - (now % DAY);
  const [sus, yt, kv, tr] = await db.batch([
    db
      .prepare("SELECT key FROM counters WHERE key LIKE 'cpu-suspect:%' AND expires_at > ?1")
      .bind(now + CPU_SUSPECT_TTL_MS - DAY),
    db.prepare('SELECT value AS n FROM counters WHERE key = ?1').bind(ytUnitsKey(now)),
    db.prepare('SELECT COUNT(*) AS n FROM stake_frames WHERE t >= ?1').bind(utcMidnight),
    db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE at >= ?1').bind(utcMidnight),
  ]);
  const n = (r: D1Result | undefined) => Number((r?.results[0] as { n?: number } | undefined)?.n ?? 0);
  const jobs = new Set(
    (sus?.results as { key: string }[] | undefined)?.map((r) => r.key.split(':').slice(1, -1).join(':')),
  );
  return { cpuSuspects: [...jobs], ytUnitsToday: n(yt), kvWritesToday: n(kv), trackerWritesToday: n(tr) };
}
