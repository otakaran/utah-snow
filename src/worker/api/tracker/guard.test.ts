import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../../index.ts';
import { clearStore, migrate } from '../../store/test-db.ts';

const ORIGIN = 'https://utah.otakar.dev';
const IP = '203.0.113.7';
const SALT = 'test-salt';
const testEnv = { ...env, IP_HASH_SALT: SALT, DEV: '' };
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'utahsnow',
  Origin: ORIGIN,
  'CF-Connecting-IP': IP,
};
const OP = { clientId: '0123456789abcdef', op: 'addPerson', name: 'Otakar', mode: 'ski' };

async function post(body: unknown, headers: Record<string, string> = HEADERS, e: Env = testEnv): Promise<Response> {
  const ctx = createExecutionContext();
  const req = new Request(`${ORIGIN}/api/tracker`, { method: 'POST', headers, body: JSON.stringify(body) });
  const res = await worker.fetch(req, e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('POST /api/tracker guards', () => {
  it('runs the shared POST guard first (api/post-guard.ts): 403 for a wrong Origin, nothing written', async () => {
    const res = await post(OP, { ...HEADERS, Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM people').first<{ n: number }>())?.n).toBe(0);
  });

  it('422 bad-input for malformed ops', async () => {
    const bad = [
      { ...OP, clientId: 'nope' },
      { ...OP, op: 'dropTable' },
      { ...OP, name: ' padded ' },
      { clientId: OP.clientId, op: 'upsertDay', personId: 'p1', date: '2026-12-26', resortId: 'alta', status: 'skied' },
      { clientId: OP.clientId, op: 'upsertDay', personId: 'p1', date: '2026-12-32', resortId: 'alta', status: 'skied' },
      {
        clientId: OP.clientId,
        op: 'upsertDay',
        personId: 'p1',
        date: '2027-01-02',
        resortId: 'park-city',
        status: 'skied',
      },
      { clientId: OP.clientId, op: 'deleteDay', personId: 'p1', date: '2027-01-02', prevUpdatedAt: null },
      { clientId: OP.clientId, op: 'upsertBooking', date: '2027-01-02', kind: 'dv-lift', personId: '*' },
      { clientId: OP.clientId, op: 'upsertBooking', date: '2027-01-02', kind: 'alta-parking', personId: 'p1' },
      'not an object',
    ];
    for (const body of bad) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'validation', code: 'bad-input' });
    }
  });
});
