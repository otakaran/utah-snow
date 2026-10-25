import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUDGET, SLOTS, SUBREQUEST_LIMIT } from '../../../config/schedule.ts';
import { isoUtc } from '../../shared/time.ts';
import { SOURCES } from '../sources/index.ts';
import { type FetchCtx, type Source, ValidationError } from '../sources/types.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import { internalOf, isMaintenance, isMorning, isPruneTick, planTick, runTick, slotOf } from './dispatcher.ts';

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
  it('slot = UTC minute / 5, morning = Denver 04-10, maintenance = slot 9 at 08-11Z or Monday 12Z', () => {
    expect(slotOf(at('2026-12-28T15:00:00Z'))).toBe(0);
    expect(slotOf(at('2026-12-28T15:14:59Z'))).toBe(2);
    expect(slotOf(at('2026-12-28T15:55:00Z'))).toBe(11);
    expect(isMorning(at('2026-12-28T11:00:00Z'))).toBe(true); // 04:00 MST
    expect(isMorning(at('2026-12-28T17:59:00Z'))).toBe(true); // 10:59 MST
    expect(isMorning(at('2026-12-28T18:00:00Z'))).toBe(false);
    expect(isMaintenance(at('2026-12-29T08:45:00Z'))).toBe(true);
    expect(isMaintenance(at('2026-12-29T08:50:00Z'))).toBe(false);
    expect(isMaintenance(at('2026-12-28T12:45:00Z'))).toBe(true); // Monday
    expect(isMaintenance(at('2026-12-29T12:45:00Z'))).toBe(false);
  });
});

describe('admission', () => {
  it('admits in PRIORITY order while the sum stays <= 45 and skips unregistered jobs', () => {
    const plan = planTick(SLOT2_MORNING, [fake('nws-obs', 13), fake('roads', 40), fake('stake-alta', 2)], ctx);
    expect(plan.slot).toBe(2);
    expect(plan.admitted.map((s) => s.id)).toEqual(['stake-alta', 'roads']);
    expect(plan.deferred.map((s) => s.id)).toEqual(['nws-obs']);
  });

  it('counts the tick-start calls, one D1 batch and the KV puts per job against the 50-subrequest cap', () => {
    const stake = { ...fake('stake-alta', 1), maxPuts: 5 }; // 1 fetch + 1 batch + 5 puts
    expect(internalOf([stake, fake('roads', 39)])).toBe(1 + 2 + 6 + 1); // + the Scheduler's cron:last read
    const fits = planTick(SLOT2_MORNING, [stake, fake('roads', 39)], ctx); // 40 fetches + 10 = 50
    expect(fits.deferred).toEqual([]);
    const over = planTick(SLOT2_MORNING, [stake, fake('roads', 40)], ctx); // 41 <= 45, but 41 + 10 = 51
    expect(over.deferred.map((s) => s.id)).toEqual(['roads']);
  });

  it('maintenance only runs in its hours', () => {
    const src = [fake('maintenance', 17)];
    expect(planTick(at('2026-12-29T08:45:00Z'), src, ctx).admitted).toHaveLength(1);
    expect(planTick(at('2026-12-29T14:45:00Z'), src, ctx).admitted).toHaveLength(0);
  });
});

// Maintenance runs one sub-job per hour (08Z HDRelay, 09-11Z UDOT, Monday 12Z NWS points, 2026-12-28 is a Monday);
// 15Z is a Denver morning hour, 20Z is not. Each hour is shifted into every slot.
const HOURS = ['08', '09', '10', '11', '12', '15', '20'].map((h) => at(`2026-12-28T${h}:00:00Z`));

/** Worst case over every slot x keyed/keyless x morning x maintenance hour: fetches, fetches + internal, deferrals. */
function worstSlotLoad(sources: readonly Source[]) {
  const worst = { load: 0, total: 0, deferred: [] as string[], at: '', totalAt: '' };
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
        const total = load + internalOf(jobs);
        if (total > worst.total) Object.assign(worst, { total, totalAt: label });
        worst.deferred.push(...plan.deferred.map((s) => `${s.id} @ ${label}`));
      }
  return worst;
}

describe('budget matrix (real registry)', () => {
  it(`no slot schedules more than ${BUDGET} fetches or ${SUBREQUEST_LIMIT} subrequests in all, nothing deferred`, () => {
    const worst = worstSlotLoad(SOURCES);
    expect(worst.load, worst.at).toBeLessThanOrEqual(BUDGET);
    expect(worst.total, worst.totalAt).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
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
    expect(first.internal).toBe(2 + 3); // tick-start calls + one batch per job, no frames

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

describe('deferral writes', () => {
  it('a deferred row keeps its payload, status and ok_at; a never-seen one starts as error/deferred', async () => {
    const sources = [fake('roads', 45, ['roads:lcc']), fake('nws-obs', 13, ['obs'])];
    const first = await runTick(env, SLOT2_MORNING, { sources });
    expect(first.cron.deferred).toEqual(['nws-obs']);
    const read = () =>
      env.DB.prepare(
        "SELECT status, error, fail_count, ok_at, payload, fetched_at FROM source_state WHERE source_id = 'obs'",
      ).first();
    expect(await read()).toEqual({
      status: 'error',
      error: 'deferred',
      fail_count: 0,
      ok_at: null,
      payload: null,
      fetched_at: first.cron.startedAt,
    });
    const t0 = first.cron.startedAt - 60_000;
    await env.DB.prepare(
      "UPDATE source_state SET payload = '{\"HDP\":1}', status = 'ok', ok_at = ?1, error = NULL WHERE source_id = 'obs'",
    )
      .bind(t0)
      .run();
    const second = await runTick(env, SLOT2_MORNING + 3_600_000, { sources }); // slot 2 again, an hour on
    expect(second.cron.deferred).toEqual(['nws-obs']);
    expect(await read()).toEqual({
      status: 'ok',
      error: 'deferred',
      fail_count: 0,
      ok_at: t0,
      payload: '{"HDP":1}',
      fetched_at: second.cron.startedAt,
    });
  });
});

describe('08Z prune', () => {
  it('runs only at slot 9 of 08Z and deletes expired frames, counters and old histories', async () => {
    const t = at('2026-12-29T08:45:00Z');
    expect([t, t - 5 * 60_000, t + 3_600_000].map(isPruneTick)).toEqual([true, false, false]);
    const now = Date.now(); // the prune cuts relative to the tick's start, not its scheduled time
    const day = 86_400_000;
    const hour = (ms: number) => isoUtc(ms).slice(0, 13);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO stake_frames VALUES (?1, ?2, 1), (?1, ?3, 1)').bind('c', now - 27 * 3_600_000, now),
      env.DB.prepare("INSERT INTO counters VALUES ('old', 1, ?1), ('live', 1, ?2)").bind(now - 60_000, now + day),
      env.DB.prepare("INSERT INTO drive_cache VALUES ('old', '{}', ?1), ('new', '{}', ?2)").bind(now - 31 * day, now),
      env.DB.prepare("INSERT INTO resort_history VALUES ('alta', ?1, '{}'), ('alta', ?2, '{}')").bind(
        hour(now - 31 * day),
        hour(now),
      ),
      env.DB.prepare("INSERT INTO road_history (corridor, at) VALUES ('lcc', ?1), ('lcc', ?2)").bind(
        now - 31 * day,
        now,
      ),
    ]);
    const count = async (table: string) =>
      (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;
    expect((await runTick(env, t - 5 * 60_000, { sources: [] })).pruned).toBe(false);
    expect(await count('stake_frames')).toBe(2);
    expect((await runTick(env, t, { sources: [] })).pruned).toBe(true);
    for (const table of ['stake_frames', 'counters', 'drive_cache', 'resort_history', 'road_history'])
      expect(await count(table), table).toBe(1);
  });
});
