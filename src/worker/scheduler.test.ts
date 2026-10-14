import {
  createExecutionContext,
  runDurableObjectAlarm,
  runInDurableObject,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { isoToMs, MIN } from '../shared/time.ts';
import worker from './index.ts';
import { nextAlarmAt } from './scheduler.ts';
import { cronLastStmt, readCronLastAt } from './store/source-state.ts';
import { clearStore, migrate } from './store/test-db.ts';

const NOON = isoToMs('2026-10-13T12:00:00Z') ?? 0;
const at = (min: number, sec: number) => NOON + min * MIN + sec * 1000;
const main = () => env.SCHEDULER.get(env.SCHEDULER.idFromName('main'));
const alarmOf = () => runInDurableObject(main(), (_o, state) => state.storage.getAlarm());
const onChain = (t: number | null) => t !== null && t > Date.now() && t % (5 * MIN) === 90_000;

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('nextAlarmAt', () => {
  it('is the next 5-minute boundary strictly after now, plus 90 s', () => {
    expect(nextAlarmAt(at(3, 10))).toBe(at(6, 30));
    expect(nextAlarmAt(at(5, 0))).toBe(at(11, 30));
    expect(nextAlarmAt(at(4, 59.999))).toBe(at(6, 30));
  });
});

describe('Scheduler', () => {
  it('GET /api/health leaves the main Scheduler with an alarm on the chain', async () => {
    const ctx = createExecutionContext();
    await worker.fetch(new Request('https://utah.otakar.dev/api/health'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(onChain(await alarmOf())).toBe(true);
  });

  it('alarm() re-arms first and skips the tick while cron:last is < 4 min old', async () => {
    const last = Date.now() - MIN;
    await cronLastStmt(env.DB, { slot: 3, startedAt: last, jobs: [], deferred: [], suspects: [] }).run();
    await runInDurableObject(main(), (_o, state) => state.storage.setAlarm(Date.now() + MIN));
    expect(await runDurableObjectAlarm(main())).toBe(true);
    expect(onChain(await alarmOf())).toBe(true);
    expect(await readCronLastAt(env.DB)).toBe(last);
  });
});
