// Cron dispatcher (spec §5.3): runTick, called inside the Scheduler DO (scheduler.ts) for every trigger. Per tick:
//   1. admit the slot's registered jobs in PRIORITY order while sum(maxSubrequests) <= BUDGET and, with the tick's
//      D1 and KV calls (internalOf), <= SUBREQUEST_LIMIT; the rest are deferred;
//   2. D1 call 1: previous cron:last, every row's fetched_at, last-good payloads and other prev inputs (`reads`,
//      counters, resort_history) for the admitted jobs;
//   3. D1 call 2: cron:last, deferrals, cpu-suspect counters (previous jobs that wrote none of their due rows) and,
//      at the 08Z maintenance tick, the D1 prune (store/prune.ts);
//   4. run admitted jobs under Promise.allSettled; each writes its own rows as soon as it settles (cron/job.ts);
//   5. one log line per job.
import { BUDGET, PRIORITY, SUBREQUEST_LIMIT, TICK_CALLS, TICK_DEADLINE_MS } from '../../../config/schedule.ts';
import { createFetchx } from '../lib/fetchx.ts';
import { errorText, logLine } from '../lib/log.ts';
import { SOURCES } from '../sources/index.ts';
import type { FetchCtx, Source } from '../sources/types.ts';
import { cpuSuspectStmt } from '../store/counters.ts';
import { pruneStmts } from '../store/prune.ts';
import { type CronLast, writeTickStart } from '../store/source-state.ts';
import { readTickState } from '../store/tick-state.ts';
import { type JobEnv, type JobLog, readsOf, rowsAt, runJob } from './job.ts';
import { isMaintenance, isMorning, isPruneTick, slotJobIds, slotOf } from './slots.ts';

export type { JobLog } from './job.ts';
export { isMaintenance, isMorning, isPruneTick, slotJobIds, slotOf } from './slots.ts';
export type CronEnv = JobEnv & { YT_API_KEY?: string; UDOT_API_KEY?: string };

function priorityOf(id: string): number {
  const key = id.startsWith('nws-grid:') ? 'nws-grid' : id;
  const i = (PRIORITY as readonly string[]).indexOf(key);
  return i < 0 ? PRIORITY.length : i;
}

export interface TickPlan {
  slot: number;
  morning: boolean;
  maintenance: boolean;
  admitted: Source[];
  deferred: Source[];
}

/** D1 + KV calls a tick with these jobs spends: TICK_CALLS, then one batch and the KV puts per job. */
export const internalOf = (jobs: readonly Source[]): number =>
  TICK_CALLS + jobs.reduce((n, s) => n + 1 + (s.maxPuts ?? 0), 0);

/** Pure admission. Job ids without a registered source are skipped (adapters not written yet). */
export function planTick(ms: number, sources: readonly Source[], ctx: FetchCtx): TickPlan {
  const slot = slotOf(ms);
  const morning = isMorning(ms);
  const maintenance = isMaintenance(ms);
  const jobs = slotJobIds(slot, morning, maintenance)
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is Source => s !== undefined)
    .sort((a, b) => priorityOf(a.id) - priorityOf(b.id));
  const admitted: Source[] = [];
  const deferred: Source[] = [];
  let used = 0;
  for (const src of jobs) {
    const need = src.maxSubrequests(ctx);
    const fits = used + need <= BUDGET && used + need + internalOf([...admitted, src]) <= SUBREQUEST_LIMIT;
    if (deferred.length === 0 && fits) {
      admitted.push(src);
      used += need;
    } else deferred.push(src); // admission stops at the first job that does not fit
  }
  return { slot, morning, maintenance, admitted, deferred };
}

/**
 * Jobs of the previous tick that wrote none of the rows they were due to write since it started: the runtime killed
 * them. A job writes all of its rows in one batch, so one fresh row clears it (maintenance writes only its due sub).
 */
export function findSuspects(prev: CronLast, fetchedAt: Map<string, number>, sources: readonly Source[]): string[] {
  return prev.jobs.filter((job) => {
    const src = sources.find((s) => s.id === job);
    const rows = src ? rowsAt(src, prev.startedAt) : [];
    return rows.length > 0 && rows.every((r) => (fetchedAt.get(r) ?? 0) < prev.startedAt);
  });
}

export interface TickResult {
  cron: CronLast;
  morning: boolean;
  maintenance: boolean;
  pruned: boolean;
  ext: number;
  internal: number; // D1 + KV calls actually spent (<= internalOf(admitted))
  logs: JobLog[];
}

export interface TickOpts {
  sources?: readonly Source[];
  fetchImpl?: typeof fetch;
}

export async function runTick(env: CronEnv, scheduledTime: number, opts: TickOpts = {}): Promise<TickResult> {
  const sources = opts.sources ?? SOURCES;
  const startedAt = Date.now(); // cron triggers land 30-50 s after scheduledTime, so the deadline counts from here
  const fx = createFetchx({ deadlineAt: startedAt + TICK_DEADLINE_MS, fetchImpl: opts.fetchImpl });
  const ctx: FetchCtx = {
    fetch: fx,
    now: startedAt,
    slot: slotOf(scheduledTime),
    morning: isMorning(scheduledTime),
    keyed: { yt: !!env.YT_API_KEY, udot: !!env.UDOT_API_KEY },
    secrets: { yt: env.YT_API_KEY, udot: env.UDOT_API_KEY },
    prev: {},
  };
  const plan = planTick(scheduledTime, sources, ctx);
  const state = await readTickState(env.DB, plan.admitted.flatMap(readsOf), startedAt);
  ctx.prev = state.prev;
  const suspects = state.cronLast ? findSuspects(state.cronLast, state.fetchedAt, sources) : [];
  const cron: CronLast = {
    slot: plan.slot,
    startedAt,
    jobs: plan.admitted.map((s) => s.id),
    deferred: plan.deferred.map((s) => s.id),
    suspects,
  };
  const pruned = isPruneTick(scheduledTime);
  await writeTickStart(
    env.DB,
    cron,
    plan.deferred.flatMap((s) => rowsAt(s, startedAt)),
    [
      ...suspects.map((job) => cpuSuspectStmt(env.DB, job, startedAt)),
      ...(pruned ? pruneStmts(env.DB, startedAt) : []),
    ],
  );
  const settled = await Promise.allSettled(plan.admitted.map((src) => runJob(env, src, ctx, plan.slot)));
  const logs = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  for (const r of settled)
    if (r.status === 'rejected') logLine({ slot: plan.slot, ok: false, err: errorText(r.reason) });
  const result: TickResult = {
    cron,
    morning: plan.morning,
    maintenance: plan.maintenance,
    pruned,
    ext: fx.used(),
    internal: TICK_CALLS + plan.admitted.length + logs.reduce((n, l) => n + l.frames, 0),
    logs,
  };
  logLine({ tick: plan.slot, jobs: cron.jobs.length, deferred: cron.deferred, suspects, pruned, ext: result.ext });
  return result;
}
