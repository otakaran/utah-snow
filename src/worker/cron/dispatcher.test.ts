import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUDGET, SLOTS } from '../../../config/schedule.ts';
import { SOURCES } from '../sources/index.ts';
import { type FetchCtx, type Source, ValidationError } from '../sources/types.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import { isMaintenance, isMorning, planTick, runTick, slotJobIds, slotOf } from './dispatcher.ts';

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

/** Worst case over every slot x keyed/keyless x morning x maintenance: sum of the scheduled jobs' maxSubrequests. */
function worstSlotLoad(sources: readonly Source[]): { load: number; at: string } {
  let worst = { load: 0, at: '' };
  for (let slot = 0; slot < SLOTS.length; slot++)
    for (const keyed of [true, false])
      for (const morning of [true, false])
        for (const maintenance of [true, false]) {
          const c = { ...ctx, slot, morning, keyed: { yt: keyed, udot: keyed } } as FetchCtx;
          const load = slotJobIds(slot, morning, maintenance)
            .map((id) => sources.find((s) => s.id === id)?.maxSubrequests(c) ?? 0)
            .reduce((a, b) => a + b, 0);
          if (load > worst.load)
            worst = { load, at: `slot ${slot} keyed=${keyed} morning=${morning} maint=${maintenance}` };
        }
  return worst;
}

describe('budget matrix', () => {
  it(`no slot schedules more than ${BUDGET} subrequests for the registered sources`, () => {
    const worst = worstSlotLoad(SOURCES);
    expect(worst.load, worst.at).toBeLessThanOrEqual(BUDGET);
  });

  it('the matrix sees scheduled jobs (guard against a vacuous pass)', () => {
    expect(worstSlotLoad([fake('roads', BUDGET + 1)]).load).toBe(BUDGET + 1);
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
