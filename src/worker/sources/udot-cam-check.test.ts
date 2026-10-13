// Fixtures: live 2026-10-12 (all 49 Cctv ids GET at 02:00Z, split into the three daily batches). The in-season file
// is SYNTHETIC: UDOT re-issued every Cctv id on 2026-10-08, so no Wayback capture can match these ids (see _note).
import { describe, expect, it } from 'vitest';
import live from './fixtures/udot-cam-check/20261012-live.json?raw';
import synthetic from './fixtures/udot-cam-check/udot-cam-check-synthetic.json?raw';
import { type FetchCtx, type FetchOpts, type FetchX, ValidationError } from './types.ts';
import {
  batchCams,
  batchIndex,
  CCTV,
  type UdotCamCheckRaw,
  type UdotCamsRow,
  udotCamCheck,
  udotCamCheckDue,
} from './udot-cam-check.ts';

const at = (h: number) => Date.UTC(2026, 9, 13, h, 50);
const BATCHES: UdotCamCheckRaw[] = JSON.parse(live);
const parse = (raw: unknown, now: number, prev?: UdotCamsRow) =>
  udotCamCheck.parse(raw as UdotCamCheckRaw, { now, prev: prev ? { 'udot:cams': prev } : {} }).rows[
    'udot:cams'
  ] as UdotCamsRow;
const OFFLINE = ['udot-155967', 'udot-164385', 'udot-141123', 'udot-142189', 'udot-154500'];

describe('udot-cam-check', () => {
  it('49 Cctv cams in batches of 17/16/16 at 09/10/11Z; at most 17 subrequests', () => {
    expect(CCTV).toHaveLength(49);
    expect([0, 1, 2].map((i) => batchCams(i).length)).toEqual([17, 16, 16]);
    expect([9, 10, 11].map((h) => batchIndex(at(h)))).toEqual([0, 1, 2]);
    expect(BATCHES.map((b) => Object.keys(b.checks))).toEqual([0, 1, 2].map((i) => batchCams(i).map((c) => c.id)));
    expect(udotCamCheck.maxSubrequests({} as FetchCtx)).toBe(17);
    expect([8, 9, 11, 12].map((h) => udotCamCheckDue(at(h)))).toEqual([false, true, true, false]);
    expect(CCTV.some((c) => c.id.startsWith('udot-vms-'))).toBe(false);
  });

  it('live 2026-10-12, three batches: the 5 PNG placeholders are offline, JPEG and RWIS GIF cams online', () => {
    let row: UdotCamsRow | undefined;
    for (const [i, raw] of BATCHES.entries()) row = parse(raw, at(9 + i), row);
    expect(Object.keys(row ?? {})).toHaveLength(49);
    const offline = Object.entries(row ?? {}).flatMap(([id, s]) => (s.online ? [] : [id]));
    expect(offline.sort()).toEqual([...OFFLINE].sort());
    expect(row?.['udot-165868']).toEqual({ online: true, checkedAt: '2026-10-13T11:50:00.000Z' }); // GIF (RWIS)
    expect(row?.['udot-164559']).toEqual({ online: true, checkedAt: '2026-10-13T09:50:00.000Z' });
  });

  it('in season (synthetic): recoveries, 404s and the placeholder update; 403/timeouts keep the old state', () => {
    const prev: UdotCamsRow = {
      'udot-155967': { online: false, checkedAt: '2026-01-14T09:50:00.000Z' },
      'udot-164768': { online: true, checkedAt: '2026-01-14T09:50:00.000Z' },
      'udot-166000': { online: false, checkedAt: '2026-01-14T09:50:00.000Z' },
      'udot-gone': { online: false, checkedAt: '2026-01-14T09:50:00.000Z' },
    };
    const now = Date.UTC(2026, 0, 15, 9, 50);
    const row = parse(JSON.parse(synthetic), now, prev);
    expect(row['udot-155967']).toEqual({ online: true, checkedAt: '2026-01-15T09:50:00.000Z' });
    expect(row['udot-164806']?.online).toBe(false);
    expect(row['udot-165174']?.online).toBe(false);
    expect(row['udot-164768']).toEqual(prev['udot-164768']);
    expect(row['udot-166000']).toEqual(prev['udot-166000']);
    expect(row['udot-gone']).toBeUndefined();
    expect(row['udot-164559']?.online).toBe(true);
  });

  it('validation gate: no image answer in the batch -> ValidationError', () => {
    expect(() => parse('garbage', at(9))).toThrow(ValidationError);
    const blocked = { batch: 0, checks: { 'udot-164559': { status: 403, type: 'text/html' } } };
    expect(() => parse(blocked, at(9))).toThrow(ValidationError);
  });

  it('fetch: GETs the hour batch with the body cancelled and redirects off', async () => {
    const seen: [string, FetchOpts | undefined][] = [];
    const fake = async (url: string, opts?: FetchOpts) => {
      seen.push([url, opts]);
      const headers = new Headers({ 'content-type': url.endsWith('/154500') ? 'image/png' : 'image/jpeg' });
      return { status: 200, url, headers, data: null, bytes: 0, blocked: false, wallMs: 1 };
    };
    const fx = Object.assign(fake, { remaining: () => 45, used: () => seen.length }) as unknown as FetchX;
    const raw = await udotCamCheck.fetch({ fetch: fx, now: at(11) } as FetchCtx);
    expect(seen).toHaveLength(16);
    expect(seen.every(([, o]) => o?.method !== 'HEAD' && o?.body === 'none' && o.follow === false)).toBe(true);
    expect(raw).toMatchObject({ batch: 2, checks: { 'udot-154500': { status: 200, type: 'image/png' } } });
  });
});
