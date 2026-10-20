import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { BlockedError, type Output, type ParseCtx, type Source, ValidationError } from '../sources/types.ts';
import { ytUnitsKey } from '../store/counters.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import { runTick } from './dispatcher.ts';
import { outcomeOf } from './job.ts';

const at = (iso: string) => Date.parse(iso);
const SLOT0 = at('2026-12-28T15:00:00Z'); // stake-alta, stake-skiutah, roads
const SLOT1 = at('2026-12-28T15:05:00Z'); // resort:snowbasin
const SLOT3 = at('2026-12-28T15:15:00Z'); // youtube
const MAINT = at('2026-12-29T09:45:00Z');

function job(id: string, rows: string[], parse: (ctx: ParseCtx) => Output, extra: Partial<Source> = {}): Source {
  return {
    id,
    rows,
    probes: [],
    staleAfterMin: 30,
    maxSubrequests: () => 1,
    fetch: async () => null,
    parse: (_raw, ctx) => parse(ctx),
    ...extra,
  };
}
const all = async <T>(sql: string): Promise<T[]> => (await env.DB.prepare(sql).all<T>()).results;
const state = (id: string) =>
  env.DB.prepare('SELECT status, error, source_as_of FROM source_state WHERE source_id = ?1')
    .bind(id)
    .first<{ status: string; error: string | null; source_as_of: string | null }>();

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('job outcome', () => {
  it('fetchx errors count by class or by name', () => {
    const named = (name: string) => Object.assign(new Error('x'), { name });
    expect(outcomeOf(new BlockedError('imperva'))).toBe('blocked');
    expect(outcomeOf(named('BlockedError'))).toBe('blocked');
    expect(outcomeOf(named('DeadlineError'))).toBe('deferred');
    expect(outcomeOf(new ValidationError('gate'))).toBe('error');
  });
});

describe('job writes', () => {
  it('stake frames: KV put with TTL metadata, then the stake_frames index row in the job batch', async () => {
    const t = at('2026-12-28T14:58:00Z');
    const key = `cam:alta-collins-stake:${t}`;
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]).buffer;
    const meta = { lm: 'Mon, 28 Dec 2026 14:58:00 GMT', etag: null, bytes: 6 };
    const stake = job('stake-alta', ['stake:alta'], () => ({
      rows: { 'stake:alta': { asOf: '2026-12-28T14:58:00.000Z', cams: {} } },
      frames: [{ key, t, bytes, camId: 'alta-collins-stake', meta }],
    }));
    const tick = await runTick(env, SLOT0, { sources: [stake] });
    expect(tick.logs[0]).toMatchObject({ status: 'ok', frames: 1 });
    expect(tick.internal).toBe(4); // 2 tick batches + the job batch + 1 KV put
    const kv = await env.FRAMES.getWithMetadata(key, 'arrayBuffer');
    expect(new Uint8Array(kv.value ?? new ArrayBuffer(0))).toEqual(new Uint8Array(bytes));
    expect(kv.metadata).toEqual(meta);
    expect(await all('SELECT cam_id, t, bytes FROM stake_frames')).toEqual([
      { cam_id: 'alta-collins-stake', t, bytes: 6 },
    ]);
    expect((await state('stake:alta'))?.source_as_of).toBe('2026-12-28T14:58:00.000Z');
  });

  it('resort_history once per hour, read back slim for snowbasin; preseason rows are offseason', async () => {
    let history: unknown;
    let season = 'open';
    const resort = job('resort:snowbasin', ['resort:snowbasin'], (ctx) => {
      history = ctx.prev['resort_history:snowbasin'];
      const snow = { reportAt: '2026-12-28T05:00:00-07:00', new24hIn: 4 };
      return { rows: { 'resort:snowbasin': { id: 'snowbasin', season, snow, lifts: { list: [] } } } };
    });
    await runTick(env, SLOT1, { sources: [resort] });
    expect(history).toEqual([]);
    expect(await state('resort:snowbasin')).toMatchObject({ status: 'ok', source_as_of: '2026-12-28T05:00:00-07:00' });
    season = 'preseason';
    await runTick(env, SLOT1 + 1000, { sources: [resort] });
    expect(history).toEqual([
      {
        hour: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
        payload: { snow: { reportAt: expect.any(String), new24hIn: 4 } },
      },
    ]);
    expect(await all('SELECT resort_id FROM resort_history')).toHaveLength(1);
    expect((await state('resort:snowbasin'))?.status).toBe('offseason');
  });

  it('road_history gets a row only when (state, tractionLaw, latestPost.id) changes', async () => {
    let road = { state: 'open', tractionLaw: false, latestPost: null as { id: number; text: string } | null };
    const roads = job('roads', ['roads:lcc'], () => ({
      rows: { 'roads:lcc': { corridor: 'lcc', headline: 'Open', ...road } },
    }));
    await runTick(env, SLOT0, { sources: [roads] });
    await runTick(env, SLOT0 + 1000, { sources: [roads] });
    road = { state: 'traction', tractionLaw: true, latestPost: { id: 7, text: 'Traction law in effect' } };
    await runTick(env, SLOT0 + 2000, { sources: [roads] });
    expect(await all('SELECT corridor, state, traction, post_id, text FROM road_history ORDER BY at')).toEqual([
      { corridor: 'lcc', state: 'open', traction: 0, post_id: null, text: 'Open' },
      { corridor: 'lcc', state: 'traction', traction: 1, post_id: 7, text: 'Traction law in effect' },
    ]);
  });

  it('youtube: pending reports and units in prev; pending keys deleted, unitsTick added', async () => {
    const exp = Date.now() + 3_600_000;
    await env.DB.prepare("INSERT INTO counters (key, value, expires_at) VALUES ('yt:pending:brighton-crest', 1, ?1)")
      .bind(exp)
      .run();
    const seen: unknown[] = [];
    const yt = job('youtube', ['yt:state'], (ctx) => {
      seen.push([ctx.prev['yt:pending'], ctx.prev['yt:units']]);
      return { rows: { 'yt:state': { v: 1, mode: 'api', unitsTick: 3, unmapped: [] } } };
    });
    await runTick(env, SLOT3, { sources: [yt] });
    await runTick(env, SLOT3 + 1000, { sources: [yt] });
    expect(seen).toEqual([
      [['brighton-crest'], 0],
      [[], 3],
    ]);
    expect(await all("SELECT key FROM counters WHERE key LIKE 'yt:pending:%'")).toEqual([]);
    const units = await env.DB.prepare('SELECT value FROM counters WHERE key = ?1')
      .bind(ytUnitsKey(Date.now()))
      .first();
    expect(units).toEqual({ value: 6 });
  });

  it('rowsDue: a failure marks only the due rows, and a run writing only them is no cpu-suspect', async () => {
    const failing = job(
      'maintenance',
      ['a:row', 'b:row'],
      () => {
        throw new ValidationError('bad batch');
      },
      { rowsDue: () => ['b:row'] },
    );
    await runTick(env, MAINT, { sources: [failing] });
    const rows = await all("SELECT source_id, status FROM source_state WHERE source_id != 'cron:last'");
    expect(rows).toEqual([{ source_id: 'b:row', status: 'error' }]);
    const ok = job('maintenance', ['a:row', 'b:row'], () => ({ rows: { 'b:row': { ok: true } } }), {
      rowsDue: () => ['b:row'],
    });
    await runTick(env, MAINT, { sources: [ok] });
    const next = await runTick(env, MAINT + 300_000, { sources: [ok] });
    expect(next.cron.suspects).toEqual([]);
  });
});
