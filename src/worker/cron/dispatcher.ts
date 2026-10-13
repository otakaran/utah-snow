// Cron dispatcher (spec §5.3): one */5 trigger. Per tick:
//   1. admit the slot's registered jobs in PRIORITY order while sum(maxSubrequests) <= BUDGET; the rest are deferred;
//   2. D1 call 1: previous cron:last, every row's fetched_at, last-good payloads and other prev inputs (`reads`,
//      counters, resort_history) for the admitted jobs;
//   3. D1 call 2: cron:last, deferrals, cpu-suspect counters (previous jobs that wrote none of their due rows) and,
//      at the 08Z maintenance tick, the D1 prune (store/prune.ts);
//   4. run admitted jobs under Promise.allSettled; each writes its own rows as soon as it settles (cron/job.ts);
//   5. one log line per job.
import { BUDGET, MAINT, MORNING_HOURS, PRIORITY, SLOTS, TICK_DEADLINE_MS } from '../../../config/schedule.ts';
import { DAY, HOUR, localHour, MIN } from '../../shared/time.ts';
import { createFetchx } from '../lib/fetchx.ts';
import { errorText, logLine } from '../lib/log.ts';
import { SOURCES } from '../sources/index.ts';
import type { FetchCtx, Source } from '../sources/types.ts';
import { cpuSuspectStmt } from '../store/counters.ts';
import { pruneStmts } from '../store/prune.ts';
import { type CronLast, writeTickStart } from '../store/source-state.ts';
import { readTickState } from '../store/tick-state.ts';
import { type JobEnv, type JobLog, readsOf, rowsAt, runJob } from './job.ts';

export type { JobLog } from './job.ts';
export type CronEnv = JobEnv & { YT_API_KEY?: string; UDOT_API_KEY?: string };

/** 0-11 = UTC minute / 5. */
export const slotOf = (ms: number): number => Math.floor((ms % HOUR) / (5 * MIN));
export const isMorning = (ms: number): boolean => {
  const h = localHour(ms);
  return h >= MORNING_HOURS.from && h <= MORNING_HOURS.to;
};
/** Slot 10 at 08-11Z, plus Mondays at 12Z. */
export function isMaintenance(ms: number): boolean {
  if (slotOf(ms) !== MAINT.slot) return false;
  const h = Math.floor(ms / HOUR) % 24;
  const monday = (Math.floor(ms / DAY) + 4) % 7 === 1; // 1970-01-01 was a Thursday
  return (MAINT.utcHours as readonly number[]).includes(h) || (monday && h === MAINT.mondayUtcHour);
}

/** The daily D1 prune rides on the first maintenance hour (08Z, with hdrelay-config). */
export const isPruneTick = (ms: number): boolean =>
  isMaintenance(ms) && Math.floor(ms / HOUR) % 24 === MAINT.utcHours[0];

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

/** Job ids scheduled in a slot (config/schedule.ts), registered or not. */
export function slotJobIds(slot: number, morning: boolean, maintenance: boolean): string[] {
  const def = SLOTS[slot] ?? { always: [], morning: [] };
  return [...new Set([...def.always, ...(morning ? def.morning : [])])].filter(
    (id) => id !== 'maintenance' || maintenance,
  );
}

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
    if (deferred.length === 0 && used + need <= BUDGET) {
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
  internal: number; // D1 + KV calls (INTERNAL_BUDGET = 25)
  logs: JobLog[];
}

export interface TickOpts {
  sources?: readonly Source[];
  fetchImpl?: typeof fetch;
}

export async function runTick(env: CronEnv, scheduledTime: number, opts: TickOpts = {}): Promise<TickResult> {
  const sources = opts.sources ?? SOURCES;
  const startedAt = Date.now();
  const fx = createFetchx({ deadlineAt: scheduledTime + TICK_DEADLINE_MS, fetchImpl: opts.fetchImpl });
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
    internal: 2 + plan.admitted.length + logs.reduce((n, l) => n + l.frames, 0),
    logs,
  };
  logLine({ tick: plan.slot, jobs: cron.jobs.length, deferred: cron.deferred, suspects, pruned, ext: result.ext });
  return result;
}
