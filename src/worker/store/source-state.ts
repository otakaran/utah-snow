// source_state reads and writes for the cron dispatcher and /api/health (spec §5.3, §5.8, §9.1).
// One row per source row id; a failure keeps the payload, a deferral only touches fetched_at and error.
// 'cron:last' is a row too: payload = CronLast JSON, fetched_at = tick start.
import type { SourceStatus } from '../../shared/types.ts';
import type { PrevRows } from '../sources/types.ts';

export const CRON_LAST = 'cron:last';

export interface CronLast {
  slot: number;
  startedAt: number; // epoch ms
  jobs: string[]; // admitted
  deferred: string[]; // not admitted (budget) or not runnable
  suspects: string[]; // jobs of the previous tick flagged cpu-suspect by this tick
}

export interface MetaRow {
  source_id: string;
  payload: string | null; // only for cron:last and yt:state in readMetaRows()
  source_as_of: string | null;
  fetched_at: number;
  ok_at: number | null;
  status: SourceStatus;
  error: string | null;
  fail_count: number;
}

const COLS = 'source_id, source_as_of, fetched_at, ok_at, status, error, fail_count';

function parseCronLast(payload: string | null | undefined): CronLast | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as CronLast;
  } catch {
    return null;
  }
}

/** Every row's meta (payloads only for cron:last and yt:state). One query. */
export async function readMetaRows(db: D1Database): Promise<MetaRow[]> {
  const sql = `SELECT ${COLS}, CASE WHEN source_id IN ('${CRON_LAST}', 'yt:state') THEN payload END AS payload FROM source_state`;
  return (await db.prepare(sql).all<MetaRow>()).results;
}

export function cronLastOf(rows: readonly MetaRow[]): CronLast | null {
  return parseCronLast(rows.find((r) => r.source_id === CRON_LAST)?.payload);
}

/**
 * Dispatcher read (D1 call 1): previous cron:last, every row's fetched_at, and last-good payloads for `needIds`.
 */
export async function readTickState(
  db: D1Database,
  needIds: readonly string[],
): Promise<{ cronLast: CronLast | null; fetchedAt: Map<string, number>; prev: PrevRows }> {
  const sql =
    `SELECT source_id, fetched_at, CASE WHEN source_id = '${CRON_LAST}' OR ` +
    '(ok_at IS NOT NULL AND source_id IN (SELECT value FROM json_each(?1))) THEN payload END AS payload FROM source_state';
  const { results } = await db
    .prepare(sql)
    .bind(JSON.stringify(needIds))
    .all<{ source_id: string; fetched_at: number; payload: string | null }>();
  const fetchedAt = new Map<string, number>();
  const prev: PrevRows = {};
  let cronLast: CronLast | null = null;
  for (const r of results) {
    if (r.source_id === CRON_LAST) {
      cronLast = parseCronLast(r.payload);
      continue;
    }
    fetchedAt.set(r.source_id, r.fetched_at);
    if (r.payload !== null) {
      try {
        prev[r.source_id] = JSON.parse(r.payload);
      } catch {
        // a corrupt payload is simply not carried forward
      }
    }
  }
  return { cronLast, fetchedAt, prev };
}

export function cronLastStmt(db: D1Database, c: CronLast): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO source_state (source_id, payload, fetched_at, ok_at, status, error, fail_count)
       VALUES ('${CRON_LAST}', ?1, ?2, ?2, 'ok', NULL, 0)
       ON CONFLICT(source_id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at,
         ok_at = excluded.ok_at, status = 'ok', error = NULL`,
    )
    .bind(JSON.stringify(c), c.startedAt);
}

/** Deferral: rows keep payload and status; fetched_at = now, error = 'deferred'. */
export function deferStmt(db: D1Database, rowIds: readonly string[], now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO source_state (source_id, fetched_at, status, error, fail_count)
       SELECT value, ?1, 'error', 'deferred', 0 FROM json_each(?2) WHERE true
       ON CONFLICT(source_id) DO UPDATE SET fetched_at = excluded.fetched_at, error = 'deferred'`,
    )
    .bind(now, JSON.stringify(rowIds));
}

/** Tick start (D1 call 2): cron:last, deferrals and cpu-suspect counters in one batch. */
export async function writeTickStart(
  db: D1Database,
  c: CronLast,
  deferredRows: readonly string[],
  extra: readonly D1PreparedStatement[],
): Promise<void> {
  const stmts = [cronLastStmt(db, c), ...extra];
  if (deferredRows.length) stmts.push(deferStmt(db, deferredRows, c.startedAt));
  await db.batch(stmts);
}

function asOfOf(v: unknown): string | null {
  const a = v && typeof v === 'object' ? (v as { asOf?: unknown }).asOf : null;
  return typeof a === 'string' ? a : null;
}

/** Success: payload plus meta for every row. Returns the payload bytes written. */
export async function writeJobOk(db: D1Database, rows: Record<string, unknown>, now: number): Promise<number> {
  const stmt = db.prepare(
    `INSERT INTO source_state (source_id, payload, source_as_of, fetched_at, ok_at, status, error, fail_count)
     VALUES (?1, ?2, ?3, ?4, ?4, 'ok', NULL, 0)
     ON CONFLICT(source_id) DO UPDATE SET payload = excluded.payload, source_as_of = excluded.source_as_of,
       fetched_at = excluded.fetched_at, ok_at = excluded.ok_at, status = 'ok', error = NULL, fail_count = 0`,
  );
  let bytes = 0;
  const stmts = Object.entries(rows).map(([id, value]) => {
    const payload = JSON.stringify(value ?? null);
    bytes += payload.length;
    return stmt.bind(id, payload, asOfOf(value), now);
  });
  if (stmts.length) await db.batch(stmts);
  return bytes;
}

/** Failure: status, error, fail_count + 1; the payload is kept. `error` must already be redacted. */
export async function writeJobFail(
  db: D1Database,
  rowIds: readonly string[],
  status: 'error' | 'blocked',
  error: string,
  now: number,
): Promise<void> {
  if (!rowIds.length) return;
  await db
    .prepare(
      `INSERT INTO source_state (source_id, fetched_at, status, error, fail_count)
       SELECT value, ?1, ?2, ?3, 1 FROM json_each(?4) WHERE true
       ON CONFLICT(source_id) DO UPDATE SET fetched_at = excluded.fetched_at, status = excluded.status,
         error = excluded.error, fail_count = source_state.fail_count + 1`,
    )
    .bind(now, status, error, JSON.stringify(rowIds))
    .run();
}

export async function writeJobDeferred(db: D1Database, rowIds: readonly string[], now: number): Promise<void> {
  if (rowIds.length) await deferStmt(db, rowIds, now).run();
}
