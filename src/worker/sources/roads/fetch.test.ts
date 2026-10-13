import { describe, expect, it } from 'vitest';
import type { RoadStatus } from '../../../shared/types.ts';
import type { FetchCtx } from '../types.ts';
import { fetchRoads, roadsBudget } from './fetch.ts';
import { parseRoads } from './parse.ts';

describe('roads fetch plan', () => {
  it('maxSubrequests equals the documented worst case and the calls fetch() makes', async () => {
    const budget = (slot: number, keyed: boolean) =>
      roadsBudget({
        slot,
        keyed: { yt: false, udot: keyed },
        secrets: keyed ? { udot: 'k' } : {},
      } as FetchCtx);
    expect([0, 1, 2, 4, 6, 8, 10].map((s) => budget(s, false))).toEqual([16, 13, 20, 16, 20, 16, 20]);
    expect([0, 2].map((s) => budget(s, true))).toEqual([10, 18]);
    for (const [slot, keyed] of [
      [0, false],
      [2, false],
      [2, true],
    ] as const) {
      let calls = 0;
      const fetch = (async (url: string) => {
        calls++;
        if (keyed && url.includes('/traffic?')) throw new Error('HTTP 503'); // forces the keyed `event` fallback
        const data = url.includes('/List/') ? { recordsTotal: 500, recordsFiltered: 500, data: [] } : [];
        return { status: 200, url, headers: new Headers(), data, bytes: 0, blocked: false, wallMs: 0 };
      }) as unknown as FetchCtx['fetch'];
      const ctx = { fetch, now: 0, slot, morning: false, keyed: { yt: false, udot: keyed }, prev: {} } as FetchCtx;
      ctx.secrets = keyed ? { udot: 'k' } : {};
      const raw = await fetchRoads(ctx);
      expect([slot, keyed, calls]).toEqual([slot, keyed, budget(slot, keyed)]);
      expect(JSON.stringify(raw.errors)).not.toMatch(/key=k/);
    }
  });

  it('keyless: a 403 from /List/GetData skips the other List calls; rows come from WP and note it', async () => {
    const urls: string[] = [];
    const fetch = (async (url: string) => {
      urls.push(url);
      if (url.includes('/List/')) throw Object.assign(new Error(`HTTP 403 ${url}`), { name: 'HttpError', status: 403 });
      return { status: 200, url, headers: new Headers(), data: [], bytes: 0, blocked: false, wallMs: 0 };
    }) as unknown as FetchCtx['fetch'];
    const ctx = { fetch, now: 0, slot: 2, morning: false, keyed: { yt: false, udot: false }, secrets: {}, prev: {} };
    const raw = await fetchRoads(ctx as FetchCtx);
    expect(urls.filter((u) => u.includes('/List/'))).toHaveLength(1); // no pages, sign or traffic searches
    expect(urls).toHaveLength(8); // WP 3 + List 1 + Snowbird 3 + Brighton 1
    expect([raw.conditions, raw.passes, raw.signs, raw.traffic]).toEqual([null, null, null, null]);
    const rows = parseRoads(raw, { now: Date.parse('2026-10-12T17:00:00Z'), prev: {} }).rows as Record<
      string,
      RoadStatus
    >;
    expect(Object.keys(rows)).toHaveLength(4);
    for (const r of Object.values(rows)) {
      expect(r.state).toBe('open');
      expect(r.crossChecks[0]).toEqual({
        source: 'UDOT list',
        raw: 'unavailable (HTTP 403); WP posts only',
        state: 'unknown',
      });
    }
  });
});
