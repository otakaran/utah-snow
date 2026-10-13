import { describe, expect, it } from 'vitest';
import { maintenance } from './maintenance.ts';
import { type FetchCtx, type FetchX, ValidationError } from './types.ts';

const at = (iso: string) => Date.parse(iso);
// 2026-12-28 is a Monday.
const HOURS = { hdrelay: '2026-12-29T08:50:00Z', udot: '2026-12-29T09:50:00Z', points: '2026-12-28T12:50:00Z' };

function mockFetch(contentType: string): { fx: FetchX; calls: string[] } {
  const calls: string[] = [];
  const call = async (url: string) => {
    calls.push(url);
    const headers = new Headers({ 'content-type': contentType });
    return { status: 200, url, headers, data: null, bytes: 0, blocked: false, wallMs: 0 };
  };
  return { fx: Object.assign(call, { remaining: () => 45, used: () => calls.length }) as unknown as FetchX, calls };
}
const ctxAt = (iso: string, fx: FetchX): FetchCtx => ({
  fetch: fx,
  now: at(iso),
  slot: 10,
  morning: false,
  keyed: { yt: false, udot: false },
  secrets: {},
  prev: {},
});

describe('maintenance', () => {
  it('runs one sub-job per maintenance hour, within the 17-subrequest slot budget', () => {
    const { fx } = mockFetch('image/jpeg');
    const due = (iso: string) => [maintenance.rowsDue?.(at(iso)), maintenance.maxSubrequests(ctxAt(iso, fx))];
    expect(due(HOURS.hdrelay)).toEqual([['hdrelay:config'], 12]);
    expect(due(HOURS.udot)).toEqual([['udot:cams'], 17]);
    expect(due('2026-12-29T11:50:00Z')).toEqual([['udot:cams'], 17]);
    expect(due(HOURS.points)).toEqual([['nws:points'], 17]);
    expect(due('2026-12-29T12:50:00Z')).toEqual([[], 0]); // Tuesday
  });

  it('fetches and parses only the due sub; a failed gate throws ValidationError for its row', async () => {
    const ok = mockFetch('image/jpeg');
    const ctx = ctxAt(HOURS.udot, ok.fx);
    const raw = await maintenance.fetch(ctx);
    expect(Object.keys(raw)).toEqual(['udot-cam-check']);
    expect(ok.calls).toHaveLength(17);
    expect(ok.calls.every((u) => u.startsWith('https://www.udottraffic.utah.gov/'))).toBe(true);
    const out = maintenance.parse(raw, { now: ctx.now, prev: {} });
    expect(Object.keys(out.rows)).toEqual(['udot:cams']);
    expect(Object.values(out.rows['udot:cams'] as object)).toHaveLength(17);

    const html = mockFetch('text/html');
    const bad = await maintenance.fetch(ctxAt(HOURS.udot, html.fx));
    expect(() => maintenance.parse(bad, { now: ctx.now, prev: {} })).toThrow(ValidationError);
  });

  it('outside its hours it fetches nothing and writes no row', async () => {
    const m = mockFetch('image/jpeg');
    const ctx = ctxAt('2026-12-29T14:50:00Z', m.fx);
    const raw = await maintenance.fetch(ctx);
    expect(m.calls).toEqual([]);
    expect(maintenance.parse(raw, { now: ctx.now, prev: {} }).rows).toEqual({});
  });
});
