// D1 `counters` (key, value, expires_at) plus the /api/health quota reads (spec §5.3, §7, §9.1).
// Every write refreshes expires_at = now + ttl, so `expires_at - ttl` is the last write time.
import { OSRM } from '../../../config/bases.ts';
import { CPU_SUSPECT_TTL_MS } from '../../../config/schedule.ts';
import { addDays, DAY, HOUR, localDate, ptDate, zonedToUtc } from '../../shared/time.ts';

export const YT_PENDING = 'yt:pending'; // ctx.prev key: cam ids of the yt:pending:{camId} counters
export const YT_UNITS = 'yt:units'; // ctx.prev key: units spent today (America/Los_Angeles quota day)
const YT_UNITS_TTL_MS = 2 * DAY;
const YT_PENDING_TTL_MS = 2 * HOUR; // six youtube ticks: a report outlives a failed job or two

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

export interface RateCounter {
  key: string;
  limit: number;
  expiresAt: number; // window end, epoch ms
}

/**
 * One batch of conditional increments (the rate limits, spec §7, §9.4): each counter gets +1 only while it is below
 * its limit, so a request over a limit writes nothing to it. Returns, in order, whether each one was under its limit.
 */
export async function bumpUnder(db: D1Database, counters: readonly RateCounter[]): Promise<boolean[]> {
  const stmt = db.prepare(
    `INSERT INTO counters (key, value, expires_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = counters.value + 1 WHERE counters.value < ?3 RETURNING value`,
  );
  const rs = await db.batch(counters.map((c) => stmt.bind(c.key, c.expiresAt, c.limit)));
  return rs.map((r) => r.results.length > 0);
}

/** `cpu-suspect:{job}:{Denver date}` increment for the dispatcher's tick-start batch. */
export function cpuSuspectStmt(db: D1Database, job: string, now: number): D1PreparedStatement {
  return counterIncStmt(db, `cpu-suspect:${job}:${localDate(now)}`, 1, now + CPU_SUSPECT_TTL_MS);
}

/** POST /api/cams/report: one more `yt:pending:{camId}` report for the next youtube tick (spec §6.1). */
export const bumpYtPending = (db: D1Database, camId: string, now: number): Promise<number> =>
  incrementCounter(db, `${YT_PENDING}:${camId}`, 1, YT_PENDING_TTL_MS, now);

/**
 * GET /api/drive limits for the Denver day, expiring at the next Denver midnight (`resetAt`, for retryAfterS):
 * `drive:ip:{ipHash}:{YYYYMMDD}` counts one client's lookups (cache hits too), `drive:{YYYYMMDD}` everyone's misses.
 */
export function driveCounters(
  hash: string,
  now: number,
): { lookups: RateCounter; misses: RateCounter; resetAt: number } {
  const today = localDate(now);
  const day = today.replace(/-/g, '');
  const resetAt = zonedToUtc(`${addDays(today, 1)} 00:00`) ?? now + DAY;
  return {
    lookups: { key: `drive:ip:${hash}:${day}`, limit: OSRM.lookupsPerIpDay, expiresAt: resetAt },
    misses: { key: `drive:${day}`, limit: OSRM.missesPerDay, expiresAt: resetAt },
    resetAt,
  };
}

const DRIVE_LEASE = 'drive:lease';

/** Takes the single /api/drive miss lease until `until` (free, or the holder's expired); false while it is held. */
export async function takeDriveLease(db: D1Database, now: number, until: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO counters (key, value, expires_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at WHERE counters.expires_at <= ?3 RETURNING value`,
    )
    .bind(DRIVE_LEASE, until, now)
    .first();
  return row !== null;
}

/** Ends this request's lease (`until` as taken), never a later holder's. */
export async function releaseDriveLease(db: D1Database, until: number): Promise<void> {
  await db.prepare('DELETE FROM counters WHERE key = ?1 AND expires_at = ?2').bind(DRIVE_LEASE, until).run();
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
