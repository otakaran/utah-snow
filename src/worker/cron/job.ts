// One admitted job (spec §5.3 steps 4-5): fetch, parse, then one D1 batch with its rows plus history, YouTube
// counters and the stake_frames index rows (after their KV puts). A failure or deferral touches only the rows the
// job was due to write. One log line per job.
import { errorText, logLine } from '../lib/log.ts';
import {
  BlockedError,
  BudgetError,
  DeadlineError,
  type FetchCtx,
  type FetchOpts,
  type FetchX,
  type Source,
} from '../sources/types.ts';
import { YT_PENDING, YT_UNITS, ytAfterStmts } from '../store/counters.ts';
import { putFrames } from '../store/frames.ts';
import { HISTORY_PREFIX, historyStmts } from '../store/history.ts';
import { writeJobDeferred, writeJobFail, writeJobOk } from '../store/source-state.ts';

export type JobEnv = { DB: D1Database; FRAMES: KVNamespace };
const YT_ROW = 'yt:state';

/** prev inputs a job reads that are not source_state rows; store/tick-state.ts loads them (§6.1, §5.5). */
const STORE_READS: Readonly<Record<string, readonly string[]>> = {
  youtube: [YT_PENDING, YT_UNITS],
  'resort:snowbasin': [`${HISTORY_PREFIX}snowbasin`],
};

/** Rows a run at `now` writes: the due subset when the job declares one (maintenance), else all of its rows. */
export const rowsAt = (src: Source, now: number): readonly string[] => src.rowsDue?.(now) ?? src.rows;

/** What the tick-start read must load into ctx.prev for this job. */
export const readsOf = (src: Source): string[] => [...src.rows, ...(src.reads ?? []), ...(STORE_READS[src.id] ?? [])];

export interface JobLog {
  job: string;
  slot: number;
  wallMs: number;
  ok: boolean;
  bytes: number;
  ext: number;
  frames: number; // KV puts
  status: 'ok' | 'error' | 'blocked' | 'deferred';
  err?: string;
}

const named = (err: unknown, ...names: string[]): boolean => err instanceof Error && names.includes(err.name);

/** fetchx errors arrive as the re-exported classes, or by name from code that rebuilt them (§5.2). */
export function outcomeOf(err: unknown): 'deferred' | 'blocked' | 'error' {
  if (err instanceof BudgetError || err instanceof DeadlineError || named(err, 'BudgetError', 'DeadlineError')) {
    return 'deferred';
  }
  return err instanceof BlockedError || named(err, 'BlockedError') ? 'blocked' : 'error';
}

export async function runJob(env: JobEnv, src: Source, base: FetchCtx, slot: number): Promise<JobLog> {
  let ext = 0;
  const counted = <T = unknown>(url: string, opts?: FetchOpts) => {
    ext++;
    return base.fetch<T>(url, opts);
  };
  const jobFetch: FetchX = Object.assign(counted, { remaining: base.fetch.remaining, used: base.fetch.used });
  const t0 = Date.now();
  const log: JobLog = { job: src.id, slot, wallMs: 0, ok: false, bytes: 0, ext: 0, frames: 0, status: 'ok' };
  try {
    const raw = await src.fetch({ ...base, fetch: jobFetch });
    const out = src.parse(raw, { now: base.now, prev: base.prev });
    const frames = await putFrames(env.FRAMES, env.DB, out.frames ?? []);
    const at = Date.now();
    const after = [...historyStmts(env.DB, out.rows, base.prev, at), ...frames.stmts];
    if (YT_ROW in out.rows) after.push(...ytAfterStmts(env.DB, out.rows[YT_ROW], base.prev[YT_PENDING], at));
    log.bytes = await writeJobOk(env.DB, out.rows, at, after);
    log.frames = frames.puts;
    if (frames.errors.length) log.err = frames.errors.join('; ');
    log.ok = true;
  } catch (err) {
    const rows = rowsAt(src, base.now);
    const status = outcomeOf(err);
    log.status = status;
    if (status === 'deferred') await writeJobDeferred(env.DB, rows, Date.now());
    else {
      log.err = errorText(err);
      await writeJobFail(env.DB, rows, status, log.err, Date.now());
    }
  }
  log.wallMs = Date.now() - t0;
  log.ext = ext;
  logLine({ ...log });
  return log;
}
