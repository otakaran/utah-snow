import { describe, expect, it } from 'vitest';
import { CAMS } from '../../../config/cams/index.ts';
import type { StakeShot } from '../../shared/stake-archive.ts';
import { isoToMs } from '../../shared/time.ts';
import type { StakeRow } from '../../shared/types.ts';
import liveJson from './fixtures/stake-alta/20261012-live.json?raw';
import synthJson from './fixtures/stake-alta/stake-alta-synthetic.json?raw';
import { STAKE_ALTA_CAM, STAKE_ALTA_URL, stakeAlta } from './stake-alta.ts';
import { type FetchCtx, type FetchOpts, type FetchResult, type PrevRows, ValidationError } from './types.ts';

interface Resp {
  url: string;
  request: Record<string, string>;
  status: number;
  headers: Record<string, string>;
  bodyHeadBase64?: string;
}
const live = JSON.parse(liveJson) as { fetchedAt: string; responses: Resp[] };
const synth = JSON.parse(synthJson) as { responses: Resp[] };
const ROW = 'stake:alta';
const LM = 'Tue, 13 Oct 2026 01:48:10 GMT';
const T = isoToMs('2026-10-13T01:48:10Z') ?? 0;
const NOW = isoToMs(live.fetchedAt) ?? 0;
const HEAD = live.responses[0]?.bodyHeadBase64 ?? '';

/** Recorded request headers plus the max-age=0 that keeps conditional GETs working on workerd. */
const cond = (r: Resp | undefined) => ({ ...r?.request, 'Cache-Control': 'max-age=0' });
const bytesOf = (b64: string): ArrayBuffer => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
function result(r: Resp | undefined, body?: ArrayBuffer): FetchResult<ArrayBuffer> {
  if (!r) throw new Error('fixture response missing');
  const data = body ?? (r.status === 200 ? bytesOf(r.bodyHeadBase64 ?? HEAD) : new ArrayBuffer(0));
  return { status: r.status, url: r.url, headers: new Headers(r.headers), data, bytes: 0, blocked: false, wallMs: 1 };
}
function ctx(res: FetchResult<ArrayBuffer>, now: number, prev: PrevRows = {}) {
  const calls: { url: string; opts?: FetchOpts }[] = [];
  const fx = async <T = unknown>(url: string, opts?: FetchOpts) => {
    calls.push({ url, opts });
    return res as unknown as FetchResult<T>;
  };
  const c: FetchCtx = {
    fetch: Object.assign(fx, { remaining: () => 45, used: () => calls.length }),
    ...{ now, slot: 0, morning: false, keyed: { yt: false, udot: false }, secrets: {}, prev },
  };
  return { c, calls };
}
async function run(res: FetchResult<ArrayBuffer>, now: number, prev: PrevRows = {}) {
  const { c, calls } = ctx(res, now, prev);
  const out = stakeAlta.parse(await stakeAlta.fetch(c), { now, prev });
  return { out, row: out.rows[ROW] as StakeRow, calls };
}

describe('stake-alta', () => {
  it('live 2026-10-12: first sight archives the frame keyed by Last-Modified, hash = MD5 ETag', async () => {
    const { out, row, calls } = await run(result(live.responses[0]), NOW);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${STAKE_ALTA_URL}?t=${Math.floor(NOW / 60_000)}`);
    expect(calls[0]?.opts).toMatchObject({ headers: {}, body: 'bytes', follow: false });
    expect(row.asOf).toBe('2026-10-13T01:48:10.000Z');
    expect(row.cams[STAKE_ALTA_CAM]).toEqual({
      t: T,
      asOf: '2026-10-13T01:48:10.000Z',
      hash: 'c5a2a8ebe02ec27690ed93013ef379db',
      bytes: 2048,
      archived: true,
      lm: LM,
      etag: '"c5a2a8ebe02ec27690ed93013ef379db"',
    });
    expect(out.frames).toHaveLength(1);
    expect(out.frames?.[0]).toMatchObject({
      key: `cam:alta-collins-stake:${T}`,
      t: T,
      camId: STAKE_ALTA_CAM,
      meta: { lm: LM, etag: '"c5a2a8ebe02ec27690ed93013ef379db"', bytes: 2048 },
    });
    expect(out.frames?.[0]?.bytes.byteLength).toBe(2048);
  });

  it('live: the next tick sends If-Modified-Since; the 304 rewrites the same row and no frame', async () => {
    const first = await run(result(live.responses[0]), NOW);
    const prev = { [ROW]: JSON.parse(JSON.stringify(first.row)) };
    const { out, row, calls } = await run(result(live.responses[1]), NOW + 60_000, prev);
    expect(calls[0]?.opts?.headers).toEqual(cond(live.responses[1]));
    expect(row).toEqual(first.row);
    expect(out.frames).toEqual([]);
  });

  it('pre-season gate: a picture older than 24 h is recorded but not archived', async () => {
    const { out, row } = await run(result(live.responses[0]), T + 3 * 86_400_000);
    expect(out.frames).toEqual([]);
    expect(row.cams[STAKE_ALTA_CAM]).toMatchObject({ t: T, archived: false, lm: LM });
    expect(row.asOf).toBe('2026-10-13T01:48:10.000Z');
  });

  it('in-season (synthetic): new frames, an identical re-upload (hash unchanged), then a 304', async () => {
    const [r0, r1, r2, r3] = synth.responses;
    const t0 = isoToMs('2026-01-15T13:55:07Z') ?? 0;
    const t1 = isoToMs('2026-01-15T14:00:09Z') ?? 0;
    const a = await run(result(r0), t0 + 25_000);
    expect(a.out.frames?.map((f) => f.key)).toEqual([`cam:alta-collins-stake:${t0}`]);
    const b = await run(result(r1), t1 + 25_000, { [ROW]: a.row });
    expect(b.calls[0]?.opts?.headers).toEqual(cond(r1));
    expect(b.out.frames?.map((f) => f.t)).toEqual([t1]);
    expect(b.row.cams[STAKE_ALTA_CAM]).toMatchObject({ t: t1, hash: '010f616d2a2339f8c90f9555c1bdef75', bytes: 2048 });
    const c = await run(result(r2), t1 + 325_000, { [ROW]: b.row });
    expect(c.calls[0]?.opts?.headers).toEqual(cond(r2));
    expect(c.out.frames).toEqual([]);
    expect(c.row.cams[STAKE_ALTA_CAM]).toMatchObject({ t: t1, archived: true, lm: 'Thu, 15 Jan 2026 14:05:11 GMT' });
    expect(c.row.asOf).toBe('2026-01-15T14:00:09.000Z');
    const d = await run(result(r3), t1 + 625_000, { [ROW]: c.row });
    expect(d.calls[0]?.opts?.headers).toEqual(cond(r3));
    expect(d.row).toEqual(c.row);
    expect(d.out.frames).toEqual([]);
  });

  it('validation gate: garbage payloads throw ValidationError', async () => {
    const html = new TextEncoder().encode(`<html>${'x'.repeat(2000)}</html>`).buffer as ArrayBuffer;
    const page = { ...live.responses[0], headers: { 'content-type': 'text/html', 'last-modified': LM } } as Resp;
    await expect(run(result(page, html), NOW)).rejects.toThrow(ValidationError);
    const noLm = { ...live.responses[0], headers: { 'content-type': 'image/jpeg', etag: '"x"' } } as Resp;
    await expect(run(result(noLm), NOW)).rejects.toThrow(/bad Last-Modified/);
    await expect(run(result(live.responses[0]), T - 3_600_000)).rejects.toThrow(/bad Last-Modified/); // future
    await expect(run(result(live.responses[1]), NOW)).rejects.toThrow(/304 without a previous state/);
    expect(() => stakeAlta.parse({ status: 200 } as StakeShot, { now: NOW, prev: {} })).toThrow(ValidationError);
  });

  it('fetch: other statuses throw; a missing ETag falls back to SHA-1 of the body', async () => {
    const moved = { url: STAKE_ALTA_URL, request: {}, status: 302, headers: { location: '/x' } };
    await expect(stakeAlta.fetch(ctx(result(moved), NOW).c)).rejects.toThrow(/HTTP 302/);
    const bare = { ...live.responses[0], headers: { 'content-type': 'image/jpeg', 'last-modified': LM } } as Resp;
    const shot = await stakeAlta.fetch(ctx(result(bare), NOW).c);
    expect(shot.hash).toBe('956c30209e911153f1e8b37cac3b4dcc57df6230');
  });

  it('declares one subrequest and the alta-do-stake probe; matches the config CamDef', () => {
    expect(stakeAlta.maxSubrequests(ctx(result(live.responses[0]), NOW).c)).toBe(1);
    expect(stakeAlta.rows).toEqual([ROW]);
    expect(stakeAlta.probes).toEqual([{ hostId: 'alta-do-stake', url: STAKE_ALTA_URL }]);
    const cam = CAMS.find((c) => c.id === STAKE_ALTA_CAM);
    expect(cam && 'archive' in cam ? cam.archive : null).toEqual({ everyMin: 5 });
    expect(cam?.still.card.startsWith(`${STAKE_ALTA_URL}?`)).toBe(true);
  });
});
