import { describe, expect, it } from 'vitest';
import { CAMS } from '../../../config/cams/index.ts';
import { isoToMs } from '../../shared/time.ts';
import type { StakeRow } from '../../shared/types.ts';
import jan1Json from './fixtures/stake-skiutah/20260101-inseason.json?raw';
import jan2Json from './fixtures/stake-skiutah/20260102-inseason.json?raw';
import liveJson from './fixtures/stake-skiutah/20261012-live.json?raw';
import { SKIUTAH_BLOB_URL, SKIUTAH_STAKES, stakeSkiutah } from './stake-skiutah.ts';
import {
  BudgetError,
  type FetchCtx,
  type FetchOpts,
  type FetchResult,
  type PrevRows,
  ValidationError,
} from './types.ts';

interface Resp {
  url: string;
  request: Record<string, string>;
  status: number;
  headers: Record<string, string>;
  bodyHeadBase64?: string;
}
type Fixture = { fetchedAt: string; responses: Resp[] };
const live = JSON.parse(liveJson) as Fixture;
const jan1 = JSON.parse(jan1Json) as Fixture;
const jan2 = JSON.parse(jan2Json) as Fixture;
const ROW = 'stake:skiutah';
const DV = 'deer-valley-ontario-snowstake-still';
const SOL = 'solitude-snowstake-still';
const ms = (iso: string) => isoToMs(iso) ?? 0;

const bytesOf = (b64: string): ArrayBuffer => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
function result(r: Resp, body?: ArrayBuffer): FetchResult<ArrayBuffer> {
  const data = body ?? (r.status === 200 ? bytesOf(r.bodyHeadBase64 ?? '') : new ArrayBuffer(0));
  return { status: r.status, url: r.url, headers: new Headers(r.headers), data, bytes: 0, blocked: false, wallMs: 1 };
}
const named = (name: string, msg: string) => Object.assign(new Error(msg), { name });
/** Recorded request headers plus the max-age=0 that keeps conditional GETs working on workerd. */
const cond = (h: Record<string, string>) => ({ ...h, 'Cache-Control': 'max-age=0' });
/** Responses by blob id; an Error value makes that request reject. */
type Route = Record<string, Resp | Error>;
function pick(f: Fixture, i: number): Resp {
  const r = f.responses[i];
  if (!r) throw new Error('fixture response missing');
  return r;
}

async function run(route: Route, now: number, prev: PrevRows = {}) {
  const calls: { url: string; opts?: FetchOpts }[] = [];
  const fx = async <T = unknown>(url: string, opts?: FetchOpts) => {
    calls.push({ url, opts });
    const r = route[url.slice(SKIUTAH_BLOB_URL.length).split('?')[0] ?? ''];
    if (!r || r instanceof Error) throw r ?? new Error('unrouted');
    return result(r) as unknown as FetchResult<T>;
  };
  const c: FetchCtx = {
    fetch: Object.assign(fx, { remaining: () => 45, used: () => calls.length }),
    ...{ now, slot: 0, morning: false, keyed: { yt: false, udot: false }, secrets: {}, prev },
  };
  const out = stakeSkiutah.parse(await stakeSkiutah.fetch(c), { now, prev });
  return { out, row: out.rows[ROW] as StakeRow, calls };
}

describe('stake-skiutah', () => {
  const NOW = ms(live.fetchedAt);
  const liveRoute = { ZFfEsBSprV7GfFinXUifK3: pick(live, 0), 525820161: pick(live, 1) };

  it('live 2026-10-12: both stills archived on first sight, hash = SHA-1 ETag, t = Last-Modified', async () => {
    const { out, row, calls } = await run(liveRoute, NOW);
    expect(calls.map((c) => c.url)).toEqual(
      SKIUTAH_STAKES.map((s) => `${SKIUTAH_BLOB_URL}${s.blob}?_ts=${Math.floor(NOW / 1000)}`),
    );
    expect(calls.every((c) => c.opts?.follow === false && c.opts.body === 'bytes')).toBe(true);
    expect(calls.map((c) => c.opts?.headers)).toEqual([{}, {}]);
    expect(row.asOf).toBe('2026-10-13T01:53:26.000Z'); // the newer of the two
    expect(row.cams[DV]).toMatchObject({ t: ms('2026-10-13T01:53:26Z'), archived: true, bytes: 2048 });
    expect(row.cams[DV]?.hash).toBe('f39c8dbc756e95d609f84cc6c6929f7a7e0a473c');
    expect(row.cams[SOL]).toMatchObject({ t: ms('2026-10-13T01:07:52Z'), archived: true });
    expect(row.cams[SOL]?.hash).toBe('685cc77710a56265a4efa4091b5fa7c09bf1001a');
    expect(out.frames?.map((f) => f.key)).toEqual([
      `cam:${DV}:${ms('2026-10-13T01:53:26Z')}`,
      `cam:${SOL}:${ms('2026-10-13T01:07:52Z')}`,
    ]);
  });

  it('live: the next run sends If-None-Match; 304s rewrite the same row and no frames', async () => {
    const first = await run(liveRoute, NOW);
    const dv304 = { ...pick(live, 0), status: 304 };
    const { out, row, calls } = await run({ ZFfEsBSprV7GfFinXUifK3: dv304, 525820161: pick(live, 2) }, NOW + 9000, {
      [ROW]: first.row,
    });
    expect(calls[1]?.opts?.headers).toEqual(cond(pick(live, 2).request));
    expect(calls[0]?.opts?.headers).toEqual(cond({ 'If-None-Match': '"f39c8dbc756e95d609f84cc6c6929f7a7e0a473c"' }));
    expect(row).toEqual(first.row);
    expect(out.frames).toEqual([]);
  });

  it('pre-season gate: stills older than 24 h are recorded but not archived', async () => {
    const { out, row } = await run(liveRoute, NOW + 2 * 86_400_000);
    expect(out.frames).toEqual([]);
    expect(Object.values(row.cams).map((c) => c.archived)).toEqual([false, false]);
  });

  it('in-season (Wayback Jan 1-2): partial first run, then new frames for both cams', async () => {
    const outage = named('HttpError', 'HTTP 503 https://www.skiutah.com/files/blob/webcam/ZFfEsBSprV7GfFinXUifK3');
    const a = await run({ ZFfEsBSprV7GfFinXUifK3: outage, 525820161: pick(jan1, 0) }, ms(jan1.fetchedAt));
    expect(Object.keys(a.row.cams)).toEqual([SOL]); // DV failed with no previous state
    expect(a.out.frames?.map((f) => f.t)).toEqual([ms('2026-01-01T19:20:23Z')]);
    const route = { ZFfEsBSprV7GfFinXUifK3: pick(jan2, 0), 525820161: pick(jan2, 1) };
    const b = await run(route, ms(jan2.fetchedAt), { [ROW]: a.row });
    expect(b.calls[1]?.opts?.headers).toEqual(cond({ 'If-None-Match': '"7bf0a72da237acf9055ccd87e0ab90eac3a8159d"' }));
    expect(b.out.frames?.map((f) => f.key)).toEqual([
      `cam:${DV}:${ms('2026-01-02T01:05:53Z')}`,
      `cam:${SOL}:${ms('2026-01-02T00:20:24Z')}`,
    ]);
    expect(b.row.asOf).toBe('2026-01-02T01:05:53.000Z');
    expect(b.row.cams[SOL]?.hash).toBe('6a048e6a12e15ff55abc79710742a935ebc0162d');
  });

  it('one failing cam keeps its last state with err; the next success clears it', async () => {
    const first = await run(liveRoute, NOW);
    const blocked = named('BlockedError', 'blocked: https://www.skiutah.com/x?key=SECRET');
    const b = await run({ ZFfEsBSprV7GfFinXUifK3: blocked, 525820161: pick(live, 2) }, NOW + 9000, {
      [ROW]: first.row,
    });
    expect(b.row.cams[DV]).toEqual({ ...first.row.cams[DV], err: expect.stringContaining('BlockedError') });
    expect(b.row.cams[DV]?.err).toContain('key=***');
    const c = await run(liveRoute, NOW + 18_000, { [ROW]: b.row });
    expect(c.row.cams[DV]?.err).toBeUndefined();
  });

  it('every cam failing fails the job; a deferral error always propagates', async () => {
    const e1 = named('HttpError', 'HTTP 500 a');
    await expect(run({ ZFfEsBSprV7GfFinXUifK3: e1, 525820161: named('HttpError', 'b') }, NOW)).rejects.toBe(e1);
    const budget = new BudgetError('external budget 45 spent');
    await expect(run({ ZFfEsBSprV7GfFinXUifK3: pick(live, 0), 525820161: budget }, NOW)).rejects.toBe(budget);
  });

  it('validation gate: garbage payloads throw ValidationError', async () => {
    const page: Resp = { ...pick(live, 0), headers: { 'content-type': 'text/html', 'last-modified': 'x' } };
    const html = { ...page, bodyHeadBase64: btoa(`<html>${'x'.repeat(2000)}</html>`) };
    await expect(run({ ZFfEsBSprV7GfFinXUifK3: html, 525820161: html }, NOW)).rejects.toThrow(ValidationError);
    expect(() => stakeSkiutah.parse([], { now: NOW, prev: {} })).toThrow(/no response/);
  });

  it('declares one subrequest per cam and matches the config CamDefs', () => {
    expect(stakeSkiutah.maxSubrequests({} as FetchCtx)).toBe(2);
    expect(stakeSkiutah.rows).toEqual([ROW]);
    expect(stakeSkiutah.probes[0]?.url).toBe(`${SKIUTAH_BLOB_URL}ZFfEsBSprV7GfFinXUifK3`);
    for (const { camId, blob } of SKIUTAH_STAKES) {
      const cam = CAMS.find((c) => c.id === camId);
      expect(cam?.kind).toBe('skiutah');
      expect(cam && 'archive' in cam ? cam.archive : null).toEqual({ everyMin: 15 });
      expect(cam?.still.card.startsWith(`${SKIUTAH_BLOB_URL}${blob}?`)).toBe(true);
    }
  });
});
