// Durable Object alarm chain: the Worker schedules its own 5-minute tick when Cloudflare cron triggers stall.
// One instance ('main'). `/ensure` arms the alarm when none is set (called by `scheduled`, /api/health and
// /api/debug/tick). alarm() re-arms FIRST, so any throw keeps the chain, then skips when cron:last started
// < 4 min ago (a working cron trigger or tick.yml got there first), else awaits runTick exactly like `scheduled`.
// Alarms land 90 s after each 5-minute boundary, so a live cron trigger ticks first and the alarm skips.
import { DurableObject } from 'cloudflare:workers';
import { MIN } from '../shared/time.ts';
import { runTick } from './cron/dispatcher.ts';
import { json, notFound } from './http.ts';
import { readCronLastAt } from './store/source-state.ts';

const STEP_MS = 5 * MIN;
const OFFSET_MS = 90_000;
const FRESH_MS = 4 * MIN;

/** The next 5-minute boundary strictly after `now`, plus 90 s. */
export function nextAlarmAt(now: number): number {
  return (Math.floor(now / STEP_MS) + 1) * STEP_MS + OFFSET_MS;
}

/** Arms the chain if it is idle; resolves to the DO's `{ alarmAt }` response. */
export function ensureScheduler(env: Env): Promise<Response> {
  return env.SCHEDULER.get(env.SCHEDULER.idFromName('main')).fetch('https://scheduler/ensure');
}

export class Scheduler extends DurableObject<Env> {
  override async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname !== '/ensure') return notFound();
    let alarmAt = await this.ctx.storage.getAlarm();
    if (alarmAt === null) {
      alarmAt = nextAlarmAt(Date.now());
      await this.ctx.storage.setAlarm(alarmAt);
    }
    return json({ alarmAt });
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    await this.ctx.storage.setAlarm(nextAlarmAt(now));
    const last = await readCronLastAt(this.env.DB);
    if (last !== null && now - last < FRESH_MS) return;
    await runTick(this.env, now);
  }
}
