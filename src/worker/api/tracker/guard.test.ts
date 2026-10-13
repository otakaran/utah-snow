import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../index.ts';
import { ipHash } from '../../lib/hash.ts';
import { clearStore, migrate } from '../../store/test-db.ts';
import { rateCounters } from '../post-guard.ts';

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
afterEach(() => vi.useRealTimers());

describe('POST /api/tracker guards', () => {
  it('403 for a wrong Origin, a missing X-Requested-With or a non-JSON Content-Type', async () => {
    const cases = [
      { ...HEADERS, Origin: 'https://evil.example' },
      { ...HEADERS, Origin: 'http://localhost:5173' }, // DEV unset
      { 'Content-Type': 'application/json', Origin: ORIGIN },
      { ...HEADERS, 'Content-Type': 'text/plain' },
    ];
    for (const h of cases) {
      const res = await post(OP, h);
      expect(res.status).toBe(403);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'forbidden' });
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM people').first<{ n: number }>())?.n).toBe(0);
  });

  it('accepts a localhost origin only when DEV=1', async () => {
    const res = await post(OP, { ...HEADERS, Origin: 'http://127.0.0.1:4173' }, { ...testEnv, DEV: '1' });
    expect(res.status).toBe(200);
  });

  it('503 when the IP_HASH_SALT secret is missing', async () => {
    const res = await post(OP, HEADERS, { ...testEnv, IP_HASH_SALT: '' });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('unavailable');
  });

  it('the 121st mutation of the hour from one IP is 429 with retryAfterS to the end of the hour', async () => {
    const now = Date.UTC(2027, 0, 2, 15, 59, 30);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const [hour] = rateCounters(await ipHash(IP, SALT), now);
    expect(hour?.key).toMatch(/^rl:[0-9a-f]{16}:2027010215$/);
    await env.DB.prepare('INSERT INTO counters (key, value, expires_at) VALUES (?1, 119, ?2)')
      .bind(hour?.key, hour?.expiresAt)
      .run();
    expect((await post(OP)).status).toBe(200); // the 120th
    const res = await post({ ...OP, name: 'Sam' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate-limited', retryAfterS: 30 });
    expect(res.headers.get('Retry-After')).toBe('30');
    // another IP still writes; the global daily counter is shared
    expect((await post({ ...OP, name: 'Jess' }, { ...HEADERS, 'CF-Connecting-IP': '198.51.100.1' })).status).toBe(200);
  });

  it('the global daily limit applies to every IP', async () => {
    const now = Date.UTC(2027, 0, 2, 23, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    await env.DB.prepare("INSERT INTO counters (key, value, expires_at) VALUES ('rl:global:20270102', 2000, ?1)")
      .bind(now + 3_600_000)
      .run();
    const res = await post(OP);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { retryAfterS: number }).retryAfterS).toBe(3600);
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
