import { afterEach, describe, expect, it, vi } from 'vitest';
import { shimCtx, waybackUrl } from './fetch-shim.ts';

const TS = '20260209191006';

afterEach(() => vi.unstubAllEnvs());

describe('fetch shim', () => {
  it('Wayback mode never sends an API key to web.archive.org', () => {
    vi.stubEnv('UDOT_API_KEY', 'secret');
    expect(shimCtx({ now: 0, wayback: TS }).ctx).toMatchObject({
      keyed: { udot: false },
      secrets: { udot: undefined },
    });
    expect(shimCtx({ now: 0 }).ctx.secrets.udot).toBe('secret');
    expect(waybackUrl(TS, 'https://api.example/v2/get/x?key=secret&format=json&_=1')).toBe(
      `https://web.archive.org/web/${TS}id_/https://api.example/v2/get/x?format=json`,
    );
  });
});
