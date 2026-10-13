import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GUARDSMAN } from '../../../config/bases.ts';
import type { DriveResponse } from '../../shared/types.ts';
import worker from '../index.ts';
import { ipHash } from '../lib/hash.ts';
import { driveCounters } from '../store/counters.ts';
import { clearStore, migrate } from '../store/test-db.ts';
import { makeDrive } from './drive.ts';

const BASE = 'https://utah.otakar.dev/api/drive';
const KEY = '40.761,-111.891';
const XRW = { 'X-Requested-With': 'utahsnow' };

/** OSRM: 30 min / 20 mi per route; deer-valley's geometry passes Guardsman; `fail` resorts answer 500. */
function osrm(fail: RegExp | null = null) {
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (fail?.test(url)) return new Response('{"code":"Error"}', { status: 500 });
    const near = url.includes('-111.4786,40.6404') ? [[GUARDSMAN.lon + 0.004, GUARDSMAN.lat]] : [];
    const coordinates = [[-111.89, 40.76], ...near, [-111.6, 40.6]];
    const route = { duration: 1800, distance: 32186.88, geometry: { type: 'LineString', coordinates } };
    return Response.json({ code: 'Ok', routes: [route] });
  });
  const delay = vi.fn(async (_ms: number) => {});
  return { urls, fetchImpl: fetchImpl as unknown as typeof fetch, delay };
}

async function call(query: string, deps = osrm(), headers: Record<string, string> = XRW): Promise<Response> {
  const url = new URL(`${BASE}?${query}`);
  return makeDrive(deps)(new Request(url, { headers }), env, createExecutionContext(), url);
}

const cached = () =>
  env.DB.prepare('SELECT key FROM drive_cache')
    .all()
    .then((r) => r.results);
const counter = (key: string) => env.DB.prepare('SELECT value FROM counters WHERE key = ?1').bind(key).first();
const seedCounter = (key: string, value: number, expiresAt: number) =>
  env.DB.prepare('INSERT INTO counters (key, value, expires_at) VALUES (?1, ?2, ?3)').bind(key, value, expiresAt).run();
const seedHit = (now: number) =>
  env.DB.prepare('INSERT INTO drive_cache (key, payload, created_at) VALUES (?1, \'{"cached":1}\', ?2)')
    .bind(KEY, now)
    .run();

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
  await env.DB.prepare('DELETE FROM drive_cache').run();
});
afterEach(() => vi.useRealTimers());

describe('GET /api/drive', () => {
  it('403 without X-Requested-With (an <img> probe); 422 outside the Wasatch or without numeric coordinates', async () => {
    const get = (q: string, headers: Record<string, string> = XRW) =>
      worker.fetch(new Request(`${BASE}?${q}`, { headers }), env, createExecutionContext());
    expect((await get('lat=40.761&lon=-111.891', {})).status).toBe(403);
    for (const q of ['lat=40.2&lon=-111.9', 'lat=40.7&lon=-111.1', 'lat=abc&lon=-111.9', 'lon=-111.9']) {
      const res = await get(q);
      expect(res.status, q).toBe(422);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Build')).toBe('dev');
    }
    expect(await (await get('lat=40.2&lon=-111.9')).json()).toMatchObject({ code: 'outside-wasatch' });
  });

  it('computes six routes 1.1 s apart, flags Guardsman, caches the complete answer for the next hit', async () => {
    const deps = osrm();
    const res = await call('lat=40.76084&lon=-111.89104', deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    const body = (await res.json()) as DriveResponse;
    expect(body).toMatchObject({ origin: { lat: 40.761, lon: -111.891 } });
    expect(Object.keys(body)).toEqual(['origin', 'results']); // no time: a cached answer never says when it was asked
    expect(body.results.alta).toEqual({ min: 30, mi: 20 });
    expect(body.results.brighton).toEqual({ min: 30, mi: 20, via: 'bcc-mouth' });
    expect(body.results['deer-valley']).toEqual({ min: 30, mi: 20, warning: GUARDSMAN.warning });
    expect(deps.urls).toHaveLength(6);
    expect(deps.urls.filter((u) => u.includes(';-111.7869,40.6197;') && u.endsWith('?overview=false'))).toHaveLength(2);
    expect(deps.urls.filter((u) => u.endsWith('?overview=full&geometries=geojson'))).toHaveLength(4);
    expect(deps.urls[0]?.startsWith('https://router.project-osrm.org/route/v1/driving/-111.891,40.761;')).toBe(true);
    expect(deps.delay.mock.calls).toEqual(Array(5).fill([1100]));
    expect(await cached()).toEqual([{ key: KEY }]);

    const again = osrm();
    const hit = await call('lat=40.761&lon=-111.891', again);
    expect(hit.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(await hit.json()).toEqual(body);
    expect(again.urls).toHaveLength(0);
  });

  it('from inside Big Cottonwood, Brighton and Solitude route directly (no detour down to the BCC mouth)', async () => {
    const deps = osrm();
    const body = (await (await call('lat=40.62&lon=-111.592', deps)).json()) as DriveResponse; // Solitude Village
    expect(deps.urls.filter((u) => u.includes(';-111.7869,40.6197;'))).toEqual([]);
    expect(body.results.solitude).toEqual({ min: 30, mi: 20 });
  });

  it('omits a failed resort: partial, no-store, not cached', async () => {
    const deps = osrm(/-111\.8571,41\.2172/); // snowbasin's base lot
    const res = await call('lat=40.761&lon=-111.891', deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as DriveResponse;
    expect(body.partial).toBe(true);
    expect(Object.keys(body.results)).toEqual(['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley']);
    expect(await cached()).toEqual([]);
  });

  it('429 above 20 misses per Denver day, retryAfterS to Denver midnight; a cache hit still answers', async () => {
    const now = Date.UTC(2027, 0, 2, 23, 0, 0); // 16:00 MST
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    await seedCounter('drive:20270102', 20, now + 8 * 3_600_000);
    const deps = osrm();
    const res = await call('lat=40.62&lon=-111.81', deps);
    expect(res.status).toBe(429);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'rate-limited', retryAfterS: 8 * 3600 });
    expect(deps.urls).toHaveLength(0);
    expect(await counter('drive:20270102')).toEqual({ value: 20 }); // a refused miss writes nothing
    await seedHit(now);
    const hit = await call('lat=40.761&lon=-111.891', deps);
    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual({ cached: 1 });
  });

  it('10 lookups per client and Denver day, cache hits included; another client still gets the hit', async () => {
    const now = Date.UTC(2027, 0, 2, 23, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const ip = '203.0.113.7';
    const { lookups } = driveCounters(await ipHash(ip, env.IP_HASH_SALT), now);
    await seedCounter(lookups.key, 10, lookups.expiresAt);
    await seedHit(now);
    const res = await call('lat=40.761&lon=-111.891', osrm(), { ...XRW, 'CF-Connecting-IP': ip });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate-limited', retryAfterS: 8 * 3600 });
    const other = await call('lat=40.761&lon=-111.891', osrm(), { ...XRW, 'CF-Connecting-IP': '198.51.100.1' });
    expect(other.status).toBe(200);
  });

  it('one miss at a time: a held lease answers 503 busy (Retry-After 10, no miss counted); an expired one is taken', async () => {
    const now = Date.now();
    await seedCounter('drive:lease', 1, now + 30_000);
    const deps = osrm();
    const busy = await call('lat=40.62&lon=-111.81', deps);
    expect(busy.status).toBe(503);
    expect(busy.headers.get('Retry-After')).toBe('10');
    expect(deps.urls).toHaveLength(0);
    const misses = await env.DB.prepare("SELECT COUNT(*) AS n FROM counters WHERE key GLOB 'drive:2*'").first();
    expect(misses).toEqual({ n: 0 });
    await env.DB.prepare("UPDATE counters SET expires_at = ?1 WHERE key = 'drive:lease'")
      .bind(now - 1)
      .run();
    expect((await call('lat=40.62&lon=-111.81', deps)).status).toBe(200);
    expect(await counter('drive:lease')).toBeNull(); // released
  });
});
