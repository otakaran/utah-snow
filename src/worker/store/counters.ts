// D1 `counters` (key, value, expires_at) plus the /api/health quota reads (spec §5.3, §7, §9.1).
// Every write refreshes expires_at = now + ttl, so `expires_at - ttl` is the last write time.
import { CPU_SUSPECT_TTL_MS } from '../../../config/schedule.ts';
import { localDate } from '../../shared/time.ts';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

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

/** YouTube quota counter key: the quota day is Pacific; LA is Denver - 1 h at every midnight. */
export const ytUnitsKey = (now: number): string => `yt:units:${localDate(now - HOUR_MS)}`;

export interface HealthCounters {
  cpuSuspects: string[]; // jobs flagged in the last 24 h
  ytUnitsToday: number;
  kvWritesToday: number; // stake_frames rows since 00:00 UTC
  trackerWritesToday: number; // audit_log rows since 00:00 UTC
}

/** One batch: recent cpu-suspects, YouTube units, frame and tracker writes today. */
export async function readHealthCounters(db: D1Database, now: number): Promise<HealthCounters> {
  const utcMidnight = now - (now % DAY_MS);
  const [sus, yt, kv, tr] = await db.batch([
    db
      .prepare("SELECT key FROM counters WHERE key LIKE 'cpu-suspect:%' AND expires_at > ?1")
      .bind(now + CPU_SUSPECT_TTL_MS - DAY_MS),
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
