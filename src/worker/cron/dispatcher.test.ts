import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUDGET, INTERNAL_BUDGET, SLOTS } from '../../../config/schedule.ts';
import { isoUtc } from '../../shared/time.ts';
import { SOURCES } from '../sources/index.ts';
import { type FetchCtx, type Source, ValidationError } from '../sources/types.ts';
import { MAX_FRAMES_PER_JOB } from '../store/frames.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import { isMaintenance, isMorning, planTick, runTick, slotOf } from './dispatcher.ts';

const at = (iso: string) => Date.parse(iso);
// 2026-12-28 is a Monday; Denver is UTC-7 in winter.
const SLOT2_MORNING = at('2026-12-28T15:10:00Z');

function fake(id: string, max: number, rows = [id], parse?: Source['parse']): Source {
  return {
    id,
    rows,
    probes: [],
    staleAfterMin: 30,
    maxSubrequests: () => max,
    fetch: async () => ({ id }),
    parse: parse ?? ((raw) => ({ rows: Object.fromEntries(rows.map((r) => [r, raw])) })),
  };
}
const ctx = { slot: 2, morning: true, keyed: { yt: false, udot: false }, secrets: {}, prev: {} } as unknown as FetchCtx;

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('slot math', () => {
  it('slot = UTC minute / 5, morning = Denver 04-10, maintenance = slot 10 at 08-11Z or Monday 12Z', () => {
    expect(slotOf(at('2026-12-28T15:00:00Z'))).toBe(0);
    expect(slotOf(at('2026-12-28T15:14:59Z'))).toBe(2);
    expect(slotOf(at('2026-12-28T15:55:00Z'))).toBe(11);
    expect(isMorning(at('2026-12-28T11:00:00Z'))).toBe(true); // 04:00 MST
    expect(isMorning(at('2026-12-28T17:59:00Z'))).toBe(true); // 10:59 MST
    expect(isMorning(at('2026-12-28T18:00:00Z'))).toBe(false);
    expect(isMaintenance(at('2026-12-29T08:50:00Z'))).toBe(true);
    expect(isMaintenance(at('2026-12-29T08:45:00Z'))).toBe(false);
    expect(isMaintenance(at('2026-12-28T12:50:00Z'))).toBe(true); // Monday
    expect(isMaintenance(at('2026-12-29T12:50:00Z'))).toBe(false);
  });
});

describe('admission', () => {
  it('admits in PRIORITY order while the sum stays <= 45 and skips unregistered jobs', () => {
    const plan = planTick(SLOT2_MORNING, [fake('nws-obs', 13), fake('roads', 40), fake('stake-alta', 2)], ctx);
    expect(plan.slot).toBe(2);
    expect(plan.admitted.map((s) => s.id)).toEqual(['stake-alta', 'roads']);
    expect(plan.deferred.map((s) => s.id)).toEqual(['nws-obs']);
  });

  it('maintenance only runs in its hours', () => {
    const src = [fake('maintenance', 17)];
    expect(planTick(at('2026-12-29T08:50:00Z'), src, ctx).admitted).toHaveLength(1);
    expect(planTick(at('2026-12-29T14:50:00Z'), src, ctx).admitted).toHaveLength(0);
  });
});

// Maintenance runs one sub-job per hour (08Z HDRelay, 09-11Z UDOT, Monday 12Z NWS points, 2026-12-28 is a Monday);
// 15Z is a Denver morning hour, 20Z is not. Each hour is shifted into every slot.
const HOURS = ['08', '09', '10', '11', '12', '15', '20'].map((h) => at(`2026-12-28T${h}:00:00Z`));

/** Internal calls (D1 + KV) a tick spends: tick-start read + cron:last write, one batch per job, frame puts. */
const internalOf = (jobs: readonly Source[]) =>
  2 + jobs.length + jobs.filter((s) => s.id.startsWith('stake-')).length * MAX_FRAMES_PER_JOB;

/** Worst case over every slot x keyed/keyless x morning x maintenance hour: subrequests, internal calls, deferrals. */
function worstSlotLoad(sources: readonly Source[]) {
  const worst = { load: 0, internal: 0, deferred: [] as string[], at: '' };
  for (const hour of HOURS)
    for (let slot = 0; slot < SLOTS.length; slot++)
      for (const keyed of [true, false]) {
        const now = hour + slot * 5 * 60_000;
        const keys = { yt: keyed, udot: keyed };
        const c = { ...ctx, now, slot, morning: isMorning(now), keyed: keys, secrets: { yt: 'k', udot: 'k' } };
        const plan = planTick(now, sources, c as FetchCtx);
        const jobs = [...plan.admitted, ...plan.deferred];
        const load = jobs.reduce((n, s) => n + s.maxSubrequests(c as FetchCtx), 0);
        const label = `${isoUtc(now)} keyed=${keyed}`;
        if (load > worst.load) Object.assign(worst, { load, at: label });
        worst.internal = Math.max(worst.internal, internalOf(jobs));
        worst.deferred.push(...plan.deferred.map((s) => `${s.id} @ ${label}`));
      }
  return worst;
}

describe('budget matrix (real registry)', () => {
  it(`no slot schedules more than ${BUDGET} subrequests or ${INTERNAL_BUDGET} internal calls, nothing deferred`, () => {
    const worst = worstSlotLoad(SOURCES);
    expect(worst.load, worst.at).toBeLessThanOrEqual(BUDGET);
    expect(worst.internal).toBeLessThanOrEqual(INTERNAL_BUDGET);
    expect(worst.deferred).toEqual([]);
  });

  it('the matrix sees scheduled jobs (guard against a vacuous pass)', () => {
    const over = worstSlotLoad([fake('roads', BUDGET + 1)]);
    expect(over.load).toBe(BUDGET + 1);
    expect(over.deferred.length).toBeGreaterThan(0);
  });
});

describe('runTick', () => {
  it('writes cron:last, per-job rows, failures keep payload, and flags cpu-suspects next tick', async () => {
    const failing = fake('nws-obs', 13, ['obs'], () => {
      throw new ValidationError('no stations');
    });
    const sources = [fake('roads', 16, ['roads:lcc']), fake('stake-alta', 2), failing];
    const first = await runTick(env, SLOT2_MORNING, { sources });
    expect(first.cron.jobs).toEqual(['stake-alta', 'roads', 'nws-obs']);
    expect(first.logs.map((l) => l.status).sort()).toEqual(['error', 'ok', 'ok']);
    expect(first.internal).toBeLessThanOrEqual(25);

    const row = await env.DB.prepare("SELECT * FROM source_state WHERE source_id = 'obs'").first<{
      status: string;
      fail_count: number;
      error: string;
    }>();
    expect(row).toMatchObject({ status: 'error', fail_count: 1, error: 'ValidationError: no stations' });

    // Simulate a CPU kill: roads:lcc was never written after the previous tick started.
    await env.DB.prepare("UPDATE source_state SET fetched_at = 1 WHERE source_id = 'roads:lcc'").run();
    const second = await runTick(env, SLOT2_MORNING + 300_000, { sources });
    expect(second.cron.suspects).toEqual(['roads']);
    const c = await env.DB.prepare("SELECT value FROM counters WHERE key LIKE 'cpu-suspect:roads:%'").first<{
      value: number;
    }>();
    expect(c?.value).toBe(1);
  });
});
