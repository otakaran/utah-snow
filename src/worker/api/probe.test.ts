import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../index.ts';
import { probeList } from '../sources/index.ts';

const KEY = 'test-probe-key';
const testEnv = { ...env, PROBE_KEY: KEY };

function get(path: string, key?: string, e: Env = testEnv): Promise<Response> {
  const headers: Record<string, string> = key ? { 'X-Probe-Key': key } : {};
  const req = new Request(`https://utah.otakar.dev${path}`, { headers });
  return Promise.resolve(worker.fetch(req, e, createExecutionContext()));
}

afterEach(() => vi.restoreAllMocks());

describe('/api/debug/probe', () => {
  it('404 like an unknown route with no key, a wrong key, or no secret set', async () => {
    for (const res of [
      await get('/api/debug/probe?src=all'),
      await get('/api/debug/probe?src=all', 'wrong-key'),
      await get('/api/debug/probe?src=all', KEY, { ...env, PROBE_KEY: '' }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'not-found' });
    }
  });

  it('with the key: one GET per allowlisted host, no Origin/Referer, blocked hints flagged', async () => {
    const seen: Request[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new Request(input, init);
      seen.push(req);
      if (req.url.includes('mtnpowder.com')) {
        return new Response('<html><title>Just a moment...</title></html>', {
          status: 403,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
    });
    const res = await get('/api/debug/probe?src=all', KEY);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as {
      count: number;
      rows: { hostId: string; status: number; blockedHint: boolean }[];
    };
    const allow = probeList();
    expect(body.count).toBe(allow.length);
    expect(seen).toHaveLength(allow.length);
    for (const r of seen) {
      expect(r.headers.get('Origin')).toBeNull();
      expect(r.headers.get('Referer')).toBeNull();
      expect(r.headers.get('User-Agent')).toMatch(/^utah-snow\/1\.0 /);
    }
    const mtn = body.rows.find((r) => r.hostId === 'mtnpowder');
    expect(mtn).toMatchObject({ status: 403, blockedHint: true });
    expect(body.rows.find((r) => r.hostId === 'avy')).toMatchObject({ status: 200, blockedHint: false });

    const one = await get('/api/debug/probe?src=avy', KEY);
    expect(((await one.json()) as { count: number }).count).toBe(1);
  });
});
