// Dispatcher read (spec §5.3 D1 call 1), one batch: the previous cron:last, every row's fetched_at, the last-good
// payloads of `needIds`, and the prev inputs that are not source_state rows when `needIds` names them:
// 'yt:pending' / 'yt:units' (counters, §6.1) and 'resort_history:<id>' (last 3 days, §5.5).
import type { PrevRows } from '../sources/types.ts';
import { decodePending, decodeUnits, YT_PENDING, YT_UNITS, ytPendingReadStmt, ytUnitsReadStmt } from './counters.ts';
import { decodeHistory, HISTORY_PREFIX, historyReadStmt } from './history.ts';
import { CRON_LAST, type CronLast, parseCronLast } from './source-state.ts';

export interface TickState {
  cronLast: CronLast | null;
  fetchedAt: Map<string, number>;
  prev: PrevRows;
}

interface ExtraRead {
  key: string;
  stmt: D1PreparedStatement;
  decode(r: D1Result | undefined): unknown;
}

function extraReads(db: D1Database, ids: readonly string[], now: number): ExtraRead[] {
  const out: ExtraRead[] = [];
  for (const key of new Set(ids)) {
    if (key === YT_PENDING) out.push({ key, stmt: ytPendingReadStmt(db, now), decode: decodePending });
    else if (key === YT_UNITS) out.push({ key, stmt: ytUnitsReadStmt(db, now), decode: decodeUnits });
    else if (key.startsWith(HISTORY_PREFIX)) {
      const stmt = historyReadStmt(db, key.slice(HISTORY_PREFIX.length), now);
      out.push({ key, stmt, decode: decodeHistory });
    }
  }
  return out;
}

export async function readTickState(db: D1Database, needIds: readonly string[], now: number): Promise<TickState> {
  const sql =
    `SELECT source_id, fetched_at, CASE WHEN source_id = '${CRON_LAST}' OR ` +
    '(ok_at IS NOT NULL AND source_id IN (SELECT value FROM json_each(?1))) THEN payload END AS payload FROM source_state';
  const extras = extraReads(db, needIds, now);
  const [main, ...rest] = await db.batch([db.prepare(sql).bind(JSON.stringify(needIds)), ...extras.map((e) => e.stmt)]);
  const fetchedAt = new Map<string, number>();
  const prev: PrevRows = {};
  let cronLast: CronLast | null = null;
  for (const r of (main?.results ?? []) as { source_id: string; fetched_at: number; payload: string | null }[]) {
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
  extras.forEach((e, i) => {
    prev[e.key] = e.decode(rest[i]);
  });
  return { cronLast, fetchedAt, prev };
}
