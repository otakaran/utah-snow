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
