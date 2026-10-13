// Stake frames (spec §6.3, §2.2). For each Output.frames entry, in order: KV put `cam:{camId}:{t}` (26 h TTL,
// metadata {lm, etag, bytes}), and only after the put succeeded, the stake_frames index row, which joins the job's
// D1 batch. A failed put writes no index row (the picture is lost; the spec accepts that). KV allows 1,000 writes a
// day and the stake jobs plan <= 480 (one per cam per run), so a job puts at most MAX_FRAMES_PER_JOB frames per run.

import { errorText } from '../lib/log.ts';
import type { Frame } from '../sources/types.ts';

export const FRAME_TTL_S = 93_600; // 26 h
export const MAX_FRAMES_PER_JOB = 2; // stake-alta has 1 cam, stake-skiutah 2
const KEY_RE = /^cam:(.+):(\d+)$/;

export interface FramesWrite {
  stmts: D1PreparedStatement[]; // index rows of the frames whose put succeeded
  puts: number; // KV calls made (they count against INTERNAL_BUDGET)
  errors: string[];
}

export async function putFrames(kv: KVNamespace, db: D1Database, frames: readonly Frame[]): Promise<FramesWrite> {
  const out: FramesWrite = { stmts: [], puts: 0, errors: [] };
  if (!frames.length) return out;
  const insert = db.prepare('INSERT OR IGNORE INTO stake_frames (cam_id, t, bytes) VALUES (?1, ?2, ?3)');
  for (const f of frames.slice(0, MAX_FRAMES_PER_JOB)) {
    const camId = f.camId ?? KEY_RE.exec(f.key)?.[1];
    if (!camId || !Number.isFinite(f.t)) {
      out.errors.push(`frame ${f.key}: bad key or t`);
      continue;
    }
    out.puts++;
    try {
      await kv.put(f.key, f.bytes, { expirationTtl: FRAME_TTL_S, metadata: f.meta ?? null });
    } catch (err) {
      out.errors.push(`frame ${f.key}: ${errorText(err)}`);
      continue;
    }
    out.stmts.push(insert.bind(camId, f.t, f.meta?.bytes ?? f.bytes.byteLength));
  }
  if (frames.length > MAX_FRAMES_PER_JOB) out.errors.push(`${frames.length - MAX_FRAMES_PER_JOB} frames over the cap`);
  return out;
}

// Reads for /api/cams and /api/stake/* (spec §6.3, §6.4, §7).

export interface FrameRow {
  t: number; // epoch ms (the picture's Last-Modified)
  bytes: number;
}
/** Per archived cam: the newest frame and the newest one old enough to serve (KV may lag a fresh put). */
export interface FrameStat {
  cam_id: string;
  newest: number;
  ready: number | null;
}
export interface PayloadRow {
  source_id: string;
  payload: string | null;
  fetched_at: number;
}

export const frameKey = (camId: string, t: number): string => `cam:${camId}:${t}`;

/** One archived JPEG from KV, or null when it expired or was never written. */
export function readFrame(kv: KVNamespace, camId: string, t: number): Promise<ArrayBuffer | null> {
  return kv.get(frameKey(camId, t), 'arrayBuffer');
}

/** Index rows of one cam with from <= t <= to, oldest first. */
export async function listFrames(db: D1Database, camId: string, from: number, to: number): Promise<FrameRow[]> {
  const sql = 'SELECT t, bytes FROM stake_frames WHERE cam_id = ?1 AND t BETWEEN ?2 AND ?3 ORDER BY t';
  return (await db.prepare(sql).bind(camId, from, to).all<FrameRow>()).results;
}

const payloadsStmt = (db: D1Database, rowIds: readonly string[]): D1PreparedStatement =>
  db
    .prepare(
      'SELECT source_id, payload, fetched_at FROM source_state WHERE source_id IN (SELECT value FROM json_each(?1))',
    )
    .bind(JSON.stringify(rowIds));

/** source_state payloads of the given rows (absent rows are simply missing). */
export async function readPayloads(db: D1Database, rowIds: readonly string[]): Promise<PayloadRow[]> {
  return (await payloadsStmt(db, rowIds).all<PayloadRow>()).results;
}

/** /api/cams inputs in one D1 round trip: the status rows plus per-cam frame stats (ready = t <= readyBefore). */
export async function readCamInputs(
  db: D1Database,
  rowIds: readonly string[],
  readyBefore: number,
): Promise<{ rows: PayloadRow[]; frames: FrameStat[] }> {
  const stats = db
    .prepare(
      'SELECT cam_id, MAX(t) AS newest, MAX(CASE WHEN t <= ?1 THEN t END) AS ready FROM stake_frames GROUP BY cam_id',
    )
    .bind(readyBefore);
  const [rows, frames] = await db.batch<unknown>([payloadsStmt(db, rowIds), stats]);
  return { rows: (rows?.results ?? []) as PayloadRow[], frames: (frames?.results ?? []) as FrameStat[] };
}
