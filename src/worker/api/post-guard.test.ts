import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ipHash } from '../lib/hash.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import { admit, rateCounters } from './post-guard.ts';

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
const NOW = Date.UTC(2027, 0, 2, 15, 59, 30);

const req = (body: string = '{}', headers: Record<string, string> = HEADERS) =>
  new Request(`${ORIGIN}/api/tracker`, { method: 'POST', headers, body });
const statusOf = (r: Awaited<ReturnType<typeof admit>>) => (r instanceof Response ? r.status : 200);
const counter = (key: string) => env.DB.prepare('SELECT value FROM counters WHERE key = ?1').bind(key).first();
const seed = (key: string, value: number, expiresAt: number) =>
  env.DB.prepare('INSERT INTO counters (key, value, expires_at) VALUES (?1, ?2, ?3)').bind(key, value, expiresAt).run();

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('admit (POST /api/tracker and /api/cams/report)', () => {
  it('403 for a wrong Origin, a missing X-Requested-With or a non-JSON Content-Type; localhost only when DEV=1', async () => {
    for (const h of [
      { ...HEADERS, Origin: 'https://evil.example' },
      { ...HEADERS, Origin: 'http://localhost:5173' }, // DEV unset
      { 'Content-Type': 'application/json', Origin: ORIGIN },
      { ...HEADERS, 'Content-Type': 'text/plain' },
    ]) {
      const res = await admit(req('{}', h), testEnv, NOW);
      expect(res).toBeInstanceOf(Response);
      expect(await (res as Response).json()).toEqual({ error: 'forbidden' });
    }
    const dev = await admit(req('{}', { ...HEADERS, Origin: 'http://127.0.0.1:4173' }), { ...testEnv, DEV: '1' }, NOW);
    expect(statusOf(dev)).toBe(200);
  });

  it('503 when the IP_HASH_SALT secret is missing', async () => {
    const res = await admit(req(), { ...testEnv, IP_HASH_SALT: '' }, NOW);
    expect(res instanceof Response && (await res.json())).toMatchObject({ error: 'unavailable', code: 'no-salt' });
  });

  it('the 121st request of the hour from one IP is 429 to the end of the hour; it never counts globally', async () => {
    const [hour, , global] = rateCounters(await ipHash(IP, SALT), NOW);
    expect(hour.key).toMatch(/^rl:[0-9a-f]{16}:2027010215$/);
    await seed(hour.key, 119, hour.expiresAt);
    expect(statusOf(await admit(req(), testEnv, NOW))).toBe(200); // the 120th
    const res = await admit(req(), testEnv, NOW);
    expect(res instanceof Response && res.headers.get('Retry-After')).toBe('30');
    expect(res instanceof Response && (await res.json())).toEqual({ error: 'rate-limited', retryAfterS: 30 });
    expect(await counter(hour.key)).toEqual({ value: 120 }); // over-limit requests write nothing
    expect(await counter(global.key)).toEqual({ value: 1 }); // only the admitted one
    // another IP still writes
    expect(statusOf(await admit(req('{}', { ...HEADERS, 'CF-Connecting-IP': '198.51.100.1' }), testEnv, NOW))).toBe(
      200,
    );
  });

  it('an IPv6 client is its /64: rotating addresses inside it shares one counter', async () => {
    const [hour] = rateCounters(await ipHash('2001:db8:0:1::1', SALT), NOW);
    await seed(hour.key, 120, hour.expiresAt);
    const res = await admit(req('{}', { ...HEADERS, 'CF-Connecting-IP': '2001:db8:0:1:ffff::42' }), testEnv, NOW);
    expect(statusOf(res)).toBe(429);
  });

  it('the global daily limit applies to every IP', async () => {
    const now = Date.UTC(2027, 0, 2, 23, 0, 0);
    await seed('rl:global:20270102', 2000, now + 3_600_000);
    const res = await admit(req(), testEnv, now);
    expect(res instanceof Response && (await res.json())).toEqual({ error: 'rate-limited', retryAfterS: 3600 });
  });

  it('422 for a body over 4 KB (by Content-Length, or in UTF-8 bytes) or one that is not a JSON object', async () => {
    const wide = JSON.stringify({ note: 'é'.repeat(2100) }); // 2.1k characters, 4.2 KB
    const sized = new Request(`${ORIGIN}/api/tracker`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Length': '5000' },
      body: '{}',
    });
    for (const r of [req(wide), sized, req('[1]'), req('nope')]) {
      const res = await admit(r, testEnv, NOW);
      expect(res instanceof Response && (await res.json())).toMatchObject({ error: 'validation', code: 'bad-input' });
    }
    expect(statusOf(await admit(req(JSON.stringify({ note: 'é'.repeat(1000) })), testEnv, NOW))).toBe(200);
  });
});
