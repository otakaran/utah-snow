// resort_history and road_history (spec §5.5, §5.6, §9.1), written in the job's success batch.
// resort_history: the first `resort:<id>` payload of each UTC hour (INSERT OR IGNORE, so <= 6 rows/h). It is copied
// from source_state by SQL, so it must follow the row upserts in the batch. Readers get the last 3 days in
// ctx.prev['resort_history:<id>'] as { hour, payload }[], with payload slimmed to { snow: { reportAt, new24hIn } }
// (what the 48/72 h sums read), so a tick never JSON.parses 72 full reports.
// road_history: one row when a corridor's (state, tractionLaw, latestPost.id) changes; UDOT deletes old posts.
import { DAY, isoUtc } from '../../shared/time.ts';
import type { RoadStatus } from '../../shared/types.ts';
import type { PrevRows } from '../sources/types.ts';

export const HISTORY_PREFIX = 'resort_history:';
const HISTORY_DAYS = 3;

/** 'YYYY-MM-DDTHH' (UTC): the resort_history hour key. */
export const hourOf = (ms: number): string => isoUtc(ms).slice(0, 13);

type Road = Partial<Pick<RoadStatus, 'state' | 'tractionLaw' | 'latestPost' | 'headline'>>;
const roadOf = (v: unknown): Road | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Road) : null);
const roadKey = (r: Road | null): string =>
  JSON.stringify([r?.state ?? null, r?.tractionLaw ?? null, r?.latestPost?.id ?? null]);

/** History statements for a successful job's rows; `prev` holds the last-good payloads loaded at tick start. */
export function historyStmts(
  db: D1Database,
  rows: Record<string, unknown>,
  prev: PrevRows,
  now: number,
): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const [id, value] of Object.entries(rows)) {
    if (id.startsWith('resort:')) {
      out.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO resort_history (resort_id, hour, payload)
             SELECT ?1, ?2, payload FROM source_state WHERE source_id = ?3 AND payload IS NOT NULL`,
          )
          .bind(id.slice('resort:'.length), hourOf(now), id),
      );
      continue;
    }
    const road = id.startsWith('roads:') ? roadOf(value) : null;
    if (!road?.state || roadKey(road) === roadKey(roadOf(prev[id]))) continue;
    const traction = typeof road.tractionLaw === 'boolean' ? Number(road.tractionLaw) : null;
    out.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO road_history (corridor, at, state, traction, post_id, text) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
        )
        .bind(
          id.slice('roads:'.length),
          now,
          road.state,
          traction,
          road.latestPost?.id ?? null,
          road.latestPost?.text ?? road.headline ?? null,
        ),
    );
  }
  return out;
}

/** Tick-start read of one resort's last 3 days (slim payloads), for the readTickState batch. */
export function historyReadStmt(db: D1Database, resortId: string, now: number): D1PreparedStatement {
  return db
    .prepare(
      `SELECT hour, json_object('snow', json_object('reportAt', json_extract(payload, '$.snow.reportAt'),
         'new24hIn', json_extract(payload, '$.snow.new24hIn'))) AS payload
       FROM resort_history WHERE resort_id = ?1 AND hour >= ?2 ORDER BY hour`,
    )
    .bind(resortId, hourOf(now - HISTORY_DAYS * DAY));
}

export function decodeHistory(r: D1Result | undefined): { hour: string; payload: unknown }[] {
  const out: { hour: string; payload: unknown }[] = [];
  for (const row of (r?.results ?? []) as { hour: string; payload: string }[]) {
    try {
      out.push({ hour: row.hour, payload: JSON.parse(row.payload) });
    } catch {
      // skip a corrupt row
    }
  }
  return out;
}
