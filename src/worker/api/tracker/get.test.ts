import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../../index.ts';
import { clearStore, migrate } from '../../store/test-db.ts';
import type { TrackerState } from './get.ts';

const ORIGIN = 'https://utah.otakar.dev';
const testEnv = { ...env, IP_HASH_SALT: 'test-salt', DEV: '' };
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'utahsnow', Origin: ORIGIN };

async function call(method: string, body?: unknown): Promise<Response> {
  const ctx = createExecutionContext();
  const init = { method, headers: HEADERS, body: body === undefined ? undefined : JSON.stringify(body) };
  const res = await worker.fetch(new Request(`${ORIGIN}/api/tracker`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('GET /api/tracker', () => {
  it('no-store, the documented shape, and never ip_hash, client_id or updated_by', async () => {
    const clientId = 'feedfacecafebeef';
    const add = await call('POST', { clientId, op: 'addPerson', name: 'Otakar', mode: 'ski' });
    const personId = ((await add.json()) as { state: TrackerState }).state.people[0]?.id;
    const day = { clientId, op: 'upsertDay', personId, date: '2027-01-02', resortId: 'alta', status: 'skied' };
    expect((await call('POST', day)).status).toBe(200);
    const parking = { clientId, op: 'upsertBooking', date: '2027-01-02', kind: 'alta-parking', personId: '*' };
    expect((await call('POST', { ...parking, note: 'paid' })).status).toBe(200);

    const res = await call('GET');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Build')).toBe('dev');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const text = await res.text();
    for (const leak of ['ip_hash', 'ipHash', 'client_id', 'clientId', 'updated_by', 'updatedBy', clientId])
      expect(text).not.toContain(leak);
    const body = JSON.parse(text) as TrackerState;
    expect(Object.keys(body).sort()).toEqual(['audit', 'bookings', 'days', 'people', 'serverTime', 'summary']);
    expect(Object.keys(body.people[0] ?? {}).sort()).toEqual(['color', 'id', 'mode', 'name', 'updatedAt']);
    expect(body.days).toEqual([
      { personId, date: '2027-01-02', resortId: 'alta', status: 'skied', updatedAt: expect.any(Number) },
    ]);
    expect(body.bookings).toEqual([
      { date: '2027-01-02', kind: 'alta-parking', personId: '*', note: 'paid', updatedAt: expect.any(Number) },
    ]);
    expect(body.audit.map((a) => a.action)).toEqual(['upsertBooking', 'upsertDay', 'addPerson']);
    expect(Object.keys(body.audit[0] ?? {}).sort()).toEqual(
      ['action', 'after', 'at', 'before', 'entity', 'id', 'key', 'undoneBy'].sort(),
    );
    expect(body.summary[personId ?? '']?.['alta-snowbird']).toEqual({ cap: 7, skied: 1, planned: 0, remaining: 6 });
    expect(body.summary[personId ?? '']?.solitude).toEqual({ cap: null, skied: 0, planned: 0, remaining: null });
    expect(typeof body.serverTime).toBe('number');
  });

  it('405 for other methods', async () => {
    const res = await call('PUT', {});
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, POST');
  });
});
