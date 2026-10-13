// /api/snapshot body (spec §5.1, §7, §5.8): concatenates source_state.payload strings (no JSON.parse) and
// builds each Meta from columns. Every block is always present; a row that does not exist yet gets
// data: null and a never-ok meta (okAt null -> red badge). ETag = W/"s-{max fetched_at}-{row count}".
import { TRIP } from '../../../config/ikon.ts';
import { isoUtc } from '../../shared/time.ts';
import type { Corridor, Meta, ResortId, SourceStatus } from '../../shared/types.ts';
import { redact } from '../lib/log.ts';

const RESORTS: readonly ResortId[] = ['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley', 'snowbasin'];
const CORRIDORS: readonly Corridor[] = ['lcc', 'bcc', 'parleys', 'snowbasin'];
const POINTS = ['base', 'summit'] as const;
const INTERNAL = new Set(['cron:last']); // never part of the snapshot
// snowbird's trails ETag only feeds its next run (If-None-Match) and is never sent; its value is null or a string.
const PRIVATE = '"trailsEtag":(?:null|"(?:[^"\\\\]|\\\\.)*")';
const PRIVATE_RES = [new RegExp(`${PRIVATE},`), new RegExp(`,${PRIVATE}(?=})`)]; // first/middle key, last key

export interface SnapshotRow {
  source_id: string;
  payload: string | null;
  source_as_of: string | null;
  fetched_at: number;
  ok_at: number | null;
  status: SourceStatus;
  error: string | null;
  fail_count: number;
}

export interface BuiltSnapshot {
  body: string;
  etag: string;
}

const iso = (ms: number | null): string | null => (ms === null ? null : isoUtc(ms));

/** Drops the private key from a payload string without parsing it. */
export function stripPrivate(payload: string): string {
  return payload.includes('"trailsEtag":') ? PRIVATE_RES.reduce((s, re) => s.replace(re, ''), payload) : payload;
}

export async function readSnapshotRows(db: D1Database): Promise<SnapshotRow[]> {
  const sql =
    'SELECT source_id, payload, source_as_of, fetched_at, ok_at, status, error, fail_count FROM source_state ' +
    'ORDER BY source_id';
  return (await db.prepare(sql).all<SnapshotRow>()).results.filter((r) => !INTERNAL.has(r.source_id));
}

function metaOf(id: string, r: SnapshotRow | undefined, staleAfterMin: (id: string) => number): Meta {
  if (!r) {
    return {
      source: id,
      fetchedAt: null,
      okAt: null,
      asOf: null,
      status: 'error',
      failCount: 0,
      staleAfterMin: staleAfterMin(id),
    };
  }
  const m: Meta = {
    source: id,
    fetchedAt: iso(r.fetched_at),
    okAt: iso(r.ok_at),
    asOf: r.source_as_of,
    status: r.status,
    failCount: r.fail_count,
    staleAfterMin: staleAfterMin(id),
  };
  if (r.error) m.error = redact(r.error);
  return m;
}

/** Pure: rows -> snapshot JSON string + weak ETag. */
export function buildSnapshot(rows: readonly SnapshotRow[], staleAfterMin: (id: string) => number): BuiltSnapshot {
  const byId = new Map(rows.map((r) => [r.source_id, r]));
  const block = (id: string) => {
    const r = byId.get(id);
    const data = r?.payload ? stripPrivate(r.payload) : 'null';
    return `{"data":${data},"meta":${JSON.stringify(metaOf(id, r, staleAfterMin))}}`;
  };
  const record = (pairs: [key: string, id: string][]) =>
    `{${pairs.map(([k, id]) => `${JSON.stringify(k)}:${block(id)}`).join(',')}}`;

  const maxFetched = rows.reduce((m, r) => Math.max(m, r.fetched_at), 0);
  const sources = rows.map((r) => JSON.stringify(metaOf(r.source_id, r, staleAfterMin))).join(',');
  const body =
    `{"v":1,"generatedAt":${JSON.stringify(isoUtc(maxFetched))}` +
    `,"trip":${JSON.stringify({ start: TRIP.start, end: TRIP.end })}` +
    `,"resorts":${record(RESORTS.map((r) => [r, `resort:${r}`]))}` +
    `,"forecast":${record(RESORTS.flatMap((r) => POINTS.map((p): [string, string] => [`${r}:${p}`, `nws:${r}:${p}`])))}` +
    `,"afd":${block('nws:afd')},"alerts":${block('nws:alerts')},"avalanche":${block('avy:uac')}` +
    `,"roads":${record(CORRIDORS.map((c) => [c, `roads:${c}`]))}` +
    `,"snotel":${block('snotel')},"obs":${block('obs')},"sources":[${sources}]}`;
  return { body, etag: `W/"s-${maxFetched}-${rows.length}"` };
}

export async function loadSnapshot(db: D1Database, staleAfterMin: (id: string) => number): Promise<BuiltSnapshot> {
  return buildSnapshot(await readSnapshotRows(db), staleAfterMin);
}
