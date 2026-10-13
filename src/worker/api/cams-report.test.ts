import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../index.ts';
import { clearStore, migrate } from '../store/test-db.ts';

const ORIGIN = 'https://utah.otakar.dev';
const IP = '203.0.113.9';
const testEnv = { ...env, IP_HASH_SALT: 'test-salt', DEV: '' };
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'utahsnow',
  Origin: ORIGIN,
  'CF-Connecting-IP': IP,
};
const CAM = 'solitude-snowstake';

async function report(body: unknown, headers: Record<string, string> = HEADERS): Promise<Response> {
  const ctx = createExecutionContext();
  const req = new Request(`${ORIGIN}/api/cams/report`, { method: 'POST', headers, body: JSON.stringify(body) });
  const res = await worker.fetch(req, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const keys = async (): Promise<{ key: string; value: number }[]> =>
  (await env.DB.prepare("SELECT key, value FROM counters WHERE key NOT LIKE 'rl:%' ORDER BY key").all()).results as {
    key: string;
    value: number;
  }[];

beforeEach(async () => {
  await migrate(env.DB);
  await clearStore(env.DB);
});

describe('POST /api/cams/report', () => {
  it('202 bumps yt:pending:{camId} and never writes yt:state', async () => {
    const first = await report({ camId: CAM, code: 150 });
    expect(first.status).toBe(202);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(first.headers.get('X-Build')).toBe('dev');
    expect(await first.json()).toEqual({ queued: true });
    expect((await report({ camId: CAM, code: 2 })).status).toBe(202);
    expect(await keys()).toEqual([{ key: `yt:pending:${CAM}`, value: 2 }]);
    const yt = await env.DB.prepare("SELECT COUNT(*) AS n FROM source_state WHERE source_id = 'yt:state'").first();
    expect(yt).toEqual({ n: 0 });
  });

  it('422 for a non-YouTube cam, an unknown cam or a code the player never reports', async () => {
    for (const body of [
      { camId: 'alta-collins-stake', code: 150 },
      { camId: 'nope', code: 150 },
      { camId: CAM, code: 3 },
      { camId: CAM },
    ]) {
      const res = await report(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'validation', code: 'bad-input' });
    }
    expect(await keys()).toEqual([]);
  });

  it('runs the shared POST guard first (api/post-guard.ts): 403 without X-Requested-With', async () => {
    const res = await report({ camId: CAM, code: 150 }, { ...HEADERS, 'X-Requested-With': '' });
    expect(res.status).toBe(403);
    expect(await keys()).toEqual([]);
  });
});
