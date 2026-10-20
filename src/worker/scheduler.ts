// The 'Scheduler' Durable Object (one instance, 'main'): every cron tick runs here, whichever trigger woke it.
// A stateless Worker gets 10 ms of CPU per invocation on the free plan and a tick needs 20-25 ms (about 1 ms per
// fetch), so the runtime killed up to half of them (cpu-suspect flags, stale rows); a DO invocation gets 30 s.
// - /tick?t=<scheduledTime>: `scheduled` (the cron trigger) and POST /api/debug/tick (tick.yml) call it, and the
//   alarm chain runs the same code. One tick at a time, and none while cron:last started < 4 min ago, so the
//   three triggers never double up; the caller gets a TickOutcome.
// - /ensure arms the alarm chain when it is idle (/api/health calls it; /tick arms too). alarm() re-arms FIRST, so
//   any throw keeps the chain. Alarms land 90 s after each 5-minute boundary, so a live cron trigger ticks first.
import { DurableObject } from 'cloudflare:workers';
import { isoUtc, MIN } from '../shared/time.ts';
import { runTick, type TickOpts } from './cron/dispatcher.ts';
import { json, notFound } from './http.ts';
import { errorText, logLine } from './lib/log.ts';
import { readCronLastAt } from './store/source-state.ts';

const STEP_MS = 5 * MIN;
const OFFSET_MS = 90_000;
export const FRESH_MS = 4 * MIN;

export type TickOutcome =
  | { ran: true; slot: number; jobs: string[]; deferred: string[] }
  | { skipped: 'fresh'; lastTickAt: string }
  | { skipped: 'busy' };

/** The next 5-minute boundary strictly after `now`, plus 90 s. */
export function nextAlarmAt(now: number): number {
  return (Math.floor(now / STEP_MS) + 1) * STEP_MS + OFFSET_MS;
}

const main = (env: Env) => env.SCHEDULER.get(env.SCHEDULER.idFromName('main'));

/** Arms the chain if it is idle; resolves to the DO's `{ alarmAt }` response. */
export function ensureScheduler(env: Env): Promise<Response> {
  return main(env).fetch('https://scheduler/ensure');
}

/** Runs one tick inside the Scheduler (none while one runs or cron:last is fresh) and arms the chain. */
export async function tickViaScheduler(env: Env, scheduledTime: number): Promise<TickOutcome> {
  const res = await main(env).fetch(`https://scheduler/tick?t=${scheduledTime}`);
  const body = (await res.json()) as TickOutcome | { error: string };
  if (!res.ok || 'error' in body) throw new Error(`scheduler tick: ${'error' in body ? body.error : res.status}`);
  return body;
}

export class Scheduler extends DurableObject<Env> {
  private running: Promise<TickOutcome> | null = null;

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/ensure') return json({ alarmAt: await this.arm() });
    if (url.pathname !== '/tick') return notFound();
    const t = Number(url.searchParams.get('t'));
    await this.arm();
    try {
      return json(await this.tick(Number.isFinite(t) && t > 0 ? t : Date.now()));
    } catch (err) {
      return json({ error: errorText(err) }, { status: 500 });
    }
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    await this.ctx.storage.setAlarm(nextAlarmAt(now));
    try {
      await this.tick(now);
    } catch (err) {
      logLine({ alarm: true, ok: false, err: errorText(err) }); // no rethrow: alarm retries would not help
    }
  }

  /** One tick at a time: a call while one runs reports `busy` without waiting. `opts` is for tests. */
  tick(scheduledTime: number, opts?: TickOpts): Promise<TickOutcome> {
    if (this.running) return Promise.resolve({ skipped: 'busy' });
    const run = this.run(scheduledTime, opts).finally(() => {
      this.running = null;
    });
    this.running = run;
    return run;
  }

  /** Sets the next alarm when none is pending; returns the pending one's time. */
  private async arm(): Promise<number> {
    let alarmAt = await this.ctx.storage.getAlarm();
    if (alarmAt === null) {
      alarmAt = nextAlarmAt(Date.now());
      await this.ctx.storage.setAlarm(alarmAt);
    }
    return alarmAt;
  }

  private async run(scheduledTime: number, opts?: TickOpts): Promise<TickOutcome> {
    const now = Date.now();
    const last = await readCronLastAt(this.env.DB);
    if (last !== null && now - last < FRESH_MS) return { skipped: 'fresh', lastTickAt: isoUtc(last) };
    const { cron } = await runTick(this.env, scheduledTime, opts);
    return { ran: true, slot: cron.slot, jobs: cron.jobs, deferred: cron.deferred };
  }
}
