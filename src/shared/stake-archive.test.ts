import { describe, expect, it } from 'vitest';
import { readCam, type StakeShot, settle, toShot } from './stake-archive.ts';
import type { StakeCam } from './types.ts';

const LM = 'Tue, 13 Oct 2026 01:48:10 GMT';
const T = Date.parse('2026-10-13T01:48:10Z');
const NOW = T + 5 * 60_000;
const jpeg = (n = 2048) => {
  const u = new Uint8Array(n);
  u.set([0xff, 0xd8, 0xff]);
  return u.buffer;
};
const shot: StakeShot = { status: 200, lm: LM, etag: '"e1"', type: 'image/jpeg', body: jpeg(), hash: 'h1' };
const prev: StakeCam = { t: T - 3_600_000, asOf: 'x', hash: 'h0', bytes: 9, archived: true, lm: 'l', etag: null };

describe('settle', () => {
  it('archives a new fresh picture as one frame keyed by its Last-Modified', () => {
    const r = settle('cam1', shot, prev, NOW);
    expect(r).toMatchObject({
      ok: true,
      cam: { t: T, asOf: '2026-10-13T01:48:10.000Z', hash: 'h1', bytes: 2048, archived: true, lm: LM, etag: '"e1"' },
      frame: { key: `cam:cam1:${T}`, t: T, camId: 'cam1', meta: { lm: LM, etag: '"e1"', bytes: 2048 } },
    });
  });

  it('moves only the validators for the same pixels, and skips frames older than 24 h', () => {
    expect(settle('c', { ...shot, hash: 'h0' }, prev, NOW)).toEqual({
      ok: true,
      cam: { ...prev, hash: 'h0', lm: LM, etag: '"e1"' },
      frame: null,
    });
    const stale = settle('c', shot, null, NOW + 2 * 86_400_000);
    expect(stale).toMatchObject({ ok: true, cam: { archived: false }, frame: null });
  });

  it('keeps the previous state on 304 and rejects bad shots with a reason', () => {
    expect(settle('c', { ...shot, status: 304, body: null }, prev, NOW)).toEqual({ ok: true, cam: prev, frame: null });
    const bad: [StakeShot, string][] = [
      [{ ...shot, status: 304, body: null }, 'c: 304 without a previous state'],
      [{ ...shot, type: 'text/html' }, 'c: body is not a JPEG'],
      [{ ...shot, body: jpeg(100) }, 'c: body is not a JPEG'],
      [{ ...shot, lm: '2026-10-13T01:48:10Z' }, 'c: bad Last-Modified'],
      [{ ...shot, lm: 'Tue, 13 Oct 2026 02:48:10 GMT' }, 'c: bad Last-Modified'], // an hour in the future
      [{ ...shot, hash: null }, 'c: no content hash'],
    ];
    for (const [s, error] of bad) expect(settle('c', s, null, NOW)).toEqual({ ok: false, error });
  });
});

describe('toShot and readCam', () => {
  const res = (status: number, etag: string) => ({
    status,
    headers: new Headers({ etag, 'last-modified': LM, 'content-type': 'image/jpeg' }),
    data: jpeg(),
  });

  it('uses a digest ETag as the hash and SHA-1 of the body otherwise', async () => {
    const md5 = 'c5a2a8eb0123456789abcdef01234567';
    expect((await toShot(res(200, `"${md5}"`))).hash).toBe(md5);
    expect((await toShot(res(200, 'W/"abc"'))).hash).toMatch(/^[0-9a-f]{40}$/);
    expect(await toShot(res(304, '"x"'))).toMatchObject({ status: 304, body: null, hash: null, lm: LM });
    await expect(toShot(res(302, '"x"'))).rejects.toThrow('HTTP 302');
  });

  it('reads a cam from a last-good row and drops malformed ones', () => {
    const row = { cams: { a: { ...prev, err: 'old', junk: 1 }, b: { t: 'x' } } };
    expect(readCam(row, 'a')).toEqual(prev);
    expect([readCam(row, 'b'), readCam(row, 'z'), readCam({}, 'a'), readCam('[]', 'a')]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
