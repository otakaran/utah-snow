import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../../index.ts';
import { clearStore, migrate } from '../../store/test-db.ts';
import { auditStmt, commit, dayUpsertStmt } from '../../store/tracker.ts';
import type { TrackerState } from './get.ts';

const ORIGIN = 'https://utah.otakar.dev';
const testEnv = { ...env, IP_HASH_SALT: 'test-salt', DEV: '' };
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'utahsnow', Origin: ORIGIN };
const clientId = '0123456789abcdef';

interface Body {
  ok?: boolean;
  warnings?: string[];
  state: TrackerState;
  current: TrackerState;
  error?: string;
  code?: string;
  message?: string;
  group?: string;
  remaining?: number;
}

async function post(op: Record<string, unknown>): Promise<{ status: number; body: Body }> {
  const ctx = createExecutionContext();
  const init = { method: 'POST', headers: HEADERS, body: JSON.stringify({ clientId, ...op }) };
  const res = await worker.fetch(new Request(`${ORIGIN}/api/tracker`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: (await res.json()) as Body };
}

const auditCount = async () =>
  (await env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log').first<{ n: number }>())?.n ?? -1;
const day = (personId: string, date: string, resortId: string, prevUpdatedAt: number | null = null) =>
  post({ op: 'upsertDay', personId, date, resortId, status: 'planned', prevUpdatedAt });

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO people (id, name, mode, color, created_at, updated_at) VALUES
       ('ota', 'Otakar', 'ski', '#3b82f6', 1, 1), ('sam', 'Sam', 'board', '#ef4444', 2, 2),
       ('kim', 'Kim', 'unknown', '#10b981', 3, 3)`,
    ),
  ]);
});

describe('POST /api/tracker days', () => {
  it('adds a day, then the 8th Alta/Snowbird day is 422 cap-exceeded and writes no audit row', async () => {
    const seed = env.DB.prepare(
      "INSERT INTO ski_days (person_id, date, resort_id, status, updated_at) VALUES ('ota', ?1, ?2, 'skied', 5)",
    );
    const dates = ['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01'];
    await env.DB.batch(dates.map((d, i) => seed.bind(d, i % 2 ? 'snowbird' : 'alta-snowbird')));
    const seventh = await day('ota', '2027-01-02', 'alta');
    expect(seventh.status).toBe(200);
    expect(seventh.body.ok).toBe(true);
    expect(seventh.body.state.summary.ota?.['alta-snowbird']).toMatchObject({ skied: 6, planned: 1, remaining: 0 });
    const audits = await auditCount();
    expect(audits).toBe(1);
    const eighth = await day('ota', '2027-01-03', 'snowbird');
    expect(eighth.status).toBe(422);
    expect(eighth.body).toMatchObject({
      error: 'validation',
      code: 'cap-exceeded',
      group: 'alta-snowbird',
      remaining: 0,
    });
    expect(eighth.body.message).toBe('Otakar has used all 7 Alta/Snowbird days');
    expect(await auditCount()).toBe(audits);
    // swapping the resort of a day already counted is not a new day; other groups are unaffected
    const prev = seventh.body.state.days.find((d) => d.date === '2027-01-02')?.updatedAt ?? null;
    expect((await day('ota', '2027-01-02', 'snowbird', prev)).status).toBe(200);
    expect((await day('ota', '2027-01-03', 'solitude')).status).toBe(200);
  });

  it('the SQL cap clause and changes() guard hold even past the pre-check (race)', async () => {
    const seed = env.DB.prepare(
      "INSERT INTO ski_days (person_id, date, resort_id, status, updated_at) VALUES ('ota', ?1, 'brighton', 'skied', 5)",
    );
    await env.DB.batch(['27', '28', '29', '30', '31'].map((d) => seed.bind(`2026-12-${d}`)));
    await env.DB.batch(['01', '02'].map((d) => seed.bind(`2027-01-${d}`)));
    const write = dayUpsertStmt(env.DB, {
      personId: 'ota',
      date: '2027-01-03',
      resortId: 'brighton',
      status: 'planned',
      updatedAt: 10,
      clientId,
      groupValues: ['brighton'],
      cap: 7,
      prev: null,
    });
    const audit = auditStmt(env.DB, {
      at: 10,
      clientId,
      ipHash: 'x',
      action: 'upsertDay',
      entity: 'ski_days',
      key: 'ota|2027-01-03',
      before: null,
      after: {},
    });
    const { changes, raw } = await commit(env.DB, [write, audit]);
    expect(changes).toBe(0);
    expect(raw.days).toHaveLength(7);
    expect(await auditCount()).toBe(0);
  });

  it('skiers-only: a boarder at Alta, Deer Valley or both is 422; unknown mode warns; DV warns without a booking', async () => {
    for (const r of ['alta', 'deer-valley', 'alta-snowbird']) {
      const res = await day('sam', '2027-01-05', r);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('skiers-only');
    }
    expect((await day('sam', '2027-01-05', 'snowbird')).status).toBe(200);
    const kim = await day('kim', '2027-01-05', 'alta');
    expect(kim.status).toBe(200);
    expect(kim.body.warnings).toEqual(['Confirm ski/board for Kim']);
    const dv = await day('ota', '2027-01-06', 'deer-valley');
    expect(dv.body.warnings).toEqual(['No DV Ikon reservation recorded']);
    const book = { op: 'upsertBooking', date: '2027-01-07', kind: 'dv-lift', personId: 'ota', prevUpdatedAt: null };
    expect((await post(book)).status).toBe(200);
    expect((await day('ota', '2027-01-07', 'deer-valley')).body.warnings).toBeUndefined();
    expect(await auditCount()).toBe(5); // the three 422s wrote none
  });

  it('a stale prevUpdatedAt is 409 with the current state and no audit row', async () => {
    const first = await day('ota', '2027-01-10', 'brighton');
    const row = first.body.state.days[0];
    const audits = await auditCount();
    for (const prev of [null, (row?.updatedAt ?? 0) - 1]) {
      const res = await day('ota', '2027-01-10', 'solitude', prev);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('conflict');
      expect(res.body.current.days).toEqual([row]);
    }
    const gone = await post({ op: 'deleteDay', personId: 'ota', date: '2027-01-11', prevUpdatedAt: 5 });
    expect(gone.status).toBe(409);
    expect(await auditCount()).toBe(audits);
    const del = await post({ op: 'deleteDay', personId: 'ota', date: '2027-01-10', prevUpdatedAt: row?.updatedAt });
    expect(del.status).toBe(200);
    expect(del.body.state.days).toEqual([]);
  });
});

describe('POST /api/tracker people', () => {
  it('add (max 12, unique names), update with a board warning, remove hides the person and their days', async () => {
    const add = await post({ op: 'addPerson', name: 'Jess', mode: 'ski', color: '#f59e0b' });
    expect(add.status).toBe(200);
    expect(add.body.state.people.find((p) => p.name === 'Jess')?.id).toMatch(/^[\w-]{10}$/);
    expect((await post({ op: 'addPerson', name: 'jess', mode: 'ski' })).body.code).toBe('duplicate-name');
    for (let i = 0; i < 8; i++) expect((await post({ op: 'addPerson', name: `P${i}`, mode: 'ski' })).status).toBe(200);
    expect((await post({ op: 'addPerson', name: 'Thirteen', mode: 'ski' })).body.code).toBe('max-people');

    await day('ota', '2027-01-12', 'alta');
    const res = await post({ op: 'updatePerson', personId: 'ota', mode: 'board', prevUpdatedAt: 1 });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual(['Otakar has 1 skiers-only day recorded']);
    const ota = res.body.state.people.find((p) => p.id === 'ota');
    expect(ota?.mode).toBe('board');
    const rm = await post({ op: 'removePerson', personId: 'ota', prevUpdatedAt: ota?.updatedAt });
    expect(rm.status).toBe(200);
    expect(rm.body.state.people.map((p) => p.id)).not.toContain('ota');
    expect(rm.body.state.days).toEqual([]);
    expect(rm.body.state.summary.ota).toBeUndefined();
  });
});

describe('POST /api/tracker undo', () => {
  it('undo restores, a double undo is 409 already-undone, undo after a later edit is 409 changed-since', async () => {
    const a = await day('ota', '2027-01-15', 'brighton');
    const first = a.body.state.days[0];
    const b = await day('ota', '2027-01-15', 'snowbasin', first?.updatedAt);
    const edit = b.body.state.audit[0];
    expect(edit?.action).toBe('upsertDay');

    const undo = await post({ op: 'undo', auditId: edit?.id });
    expect(undo.status).toBe(200);
    expect(undo.body.state.days[0]).toMatchObject({ resortId: 'brighton', status: 'planned' });
    const [undoRow, undone] = undo.body.state.audit;
    expect(undoRow).toMatchObject({ action: 'undo', entity: 'ski_days', key: 'ota|2027-01-15', undoneBy: null });
    expect(undone).toMatchObject({ id: edit?.id, undoneBy: undoRow?.id });

    const audits = await auditCount();
    const again = await post({ op: 'undo', auditId: edit?.id });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already-undone');
    expect((await post({ op: 'undo', auditId: undoRow?.id })).body.code).toBe('already-undone');

    // the first upsert's after-token is gone (the undo rewrote the row): changed-since
    const stale = await post({ op: 'undo', auditId: a.body.state.audit[0]?.id });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('changed-since');
    expect(await auditCount()).toBe(audits);
  });

  it('undo of a delete re-inserts the day; undo of removePerson brings the person back', async () => {
    const a = await day('ota', '2027-01-20', 'solitude');
    const prev = a.body.state.days[0]?.updatedAt;
    const del = await post({ op: 'deleteDay', personId: 'ota', date: '2027-01-20', prevUpdatedAt: prev });
    const back = await post({ op: 'undo', auditId: del.body.state.audit[0]?.id });
    expect(back.status).toBe(200);
    expect(back.body.state.days).toMatchObject([{ personId: 'ota', date: '2027-01-20', resortId: 'solitude' }]);

    const rm = await post({ op: 'removePerson', personId: 'sam', prevUpdatedAt: 2 });
    expect(rm.body.state.people.map((p) => p.id)).toEqual(['ota', 'kim']);
    const restored = await post({ op: 'undo', auditId: rm.body.state.audit[0]?.id });
    expect(restored.status).toBe(200);
    expect(restored.body.state.people.map((p) => p.id)).toEqual(['ota', 'sam', 'kim']);
    expect((await post({ op: 'undo', auditId: 999 })).body.code).toBe('bad-input');
  });
});
