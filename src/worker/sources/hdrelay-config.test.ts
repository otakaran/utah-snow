// Fixtures: live 2026-10-12 (all 12 players, trimmed to the parsed paths). In season: Wayback's only capture of
// one of our GUIDs from a ski season (Peruvian, 2024-11-23; nothing exists for Jan-Mar 2026), served from b9.
import { describe, expect, it } from 'vitest';
import wb20241123 from './fixtures/hdrelay-config/20241123-inseason.json?raw';
import live from './fixtures/hdrelay-config/20261012-live.json?raw';
import {
  DEFAULT_HOST,
  type HdrelayConfigRaw,
  type HdrelayConfigRow,
  hdrelayConfig,
  hdrelayConfigDue,
  PLAYERS,
} from './hdrelay-config.ts';
import { type FetchCtx, type FetchOpts, type FetchX, type PrevRows, ValidationError } from './types.ts';

const NOW = Date.UTC(2026, 9, 13, 8, 50);
const LIVE: HdrelayConfigRaw = JSON.parse(live);
const parse = (raw: unknown, prev: PrevRows = {}) =>
  hdrelayConfig.parse(raw as HdrelayConfigRaw, { now: NOW, prev }).rows['hdrelay:config'] as HdrelayConfigRow;

describe('hdrelay-config', () => {
  it('covers the 12 player GUIDs (Snowbird 5 + Snowbasin 7), one subrequest each, due at 08Z only', () => {
    expect(PLAYERS).toHaveLength(12);
    expect(Object.keys(LIVE).sort()).toEqual(PLAYERS.map((p) => p.id).sort());
    expect(hdrelayConfig.maxSubrequests({} as FetchCtx)).toBe(12);
    expect(hdrelayConfigDue(Date.UTC(2026, 11, 27, 8, 50))).toBe(true);
    expect(hdrelayConfigDue(Date.UTC(2026, 11, 27, 9, 50))).toBe(false);
  });

  it('live 2026-10-12: every camera online on b15, ids match the registry', () => {
    const row = parse(LIVE);
    for (const p of PLAYERS) {
      expect(row[p.id]).toMatchObject({ guid: p.guid, cameraId: p.cameraId, host: '//b15.hdrelay.com', online: true });
    }
    expect(row['snowbird-snowstake']).toMatchObject({ timeoutInactive: 90, recordEnabled: false, hotlink: null });
    expect(row['snowbird-little-cloud']).toMatchObject({ timeoutInactive: 60, recordEnabled: true });
    // Snowbasin's 'Last Snow' bookmark (2026-02-04): the frame builder shows it only if >= frames/info.first.
    expect(row['snowbasin-snowstake']).toMatchObject({
      hotlink: { enabled: true, time: 1770192456000 },
      position: 'default',
      checkedAt: '2026-10-13T08:50:00.000Z',
    });
    expect(row['snowbasin-strawberry-patio']).toMatchObject({ position: 'panorama', hotlink: { enabled: false } });
  });

  it('in season (2024-11-23): the host came from server.hls (b9 then), not the b15 fallback', () => {
    const row = parse(JSON.parse(wb20241123));
    expect(row['snowbird-peruvian-gulch']).toMatchObject({
      host: '//b9.hdrelay.com',
      online: true,
      timeoutInactive: 90,
    });
    // Players that did not answer get the registry fallback (or their previous entry).
    expect(row['snowbird-snowstake']).toMatchObject({ host: DEFAULT_HOST, online: null, checkedAt: null });
  });

  it('a 404 GUID is offline and gone; a failed fetch keeps the previous entry; foreign hosts are refused', () => {
    const prev = parse(LIVE);
    const raw: HdrelayConfigRaw = {
      ...LIVE,
      'snowbasin-needles': { status: 404 },
      'snowbasin-base-area': { status: 0, err: 'DeadlineError' },
    };
    const body = LIVE['snowbasin-earls-plaza']?.body as { server: object };
    raw['snowbasin-earls-plaza'] = { status: 200, body: { ...body, server: { hls: '//evil.example.com' } } };
    const row = parse(raw, {
      'hdrelay:config': { ...prev, 'snowbasin-base-area': { ...prev['snowbasin-base-area'], online: false } },
    });
    expect(row['snowbasin-needles']).toMatchObject({
      online: false,
      gone: true,
      cameraId: '1b6ed87c-f919-4e59-b9cc-7480e3ca31c3',
    });
    expect(row['snowbasin-base-area']?.online).toBe(false);
    expect(row['snowbasin-earls-plaza']?.host).toBe(DEFAULT_HOST);
  });

  it('validation gate: no readable config -> ValidationError', () => {
    expect(() => parse('<html>Just a moment</html>')).toThrow(ValidationError);
    const all404 = Object.fromEntries(PLAYERS.map((p) => [p.id, { status: 404 }]));
    expect(() => parse(all404)).toThrow(ValidationError);
    expect(() => parse({ 'snowbird-snowstake': { status: 200, body: { camera: { id: 42 } } } })).toThrow(
      ValidationError,
    );
  });

  it('fetch: 12 GETs to manage.hdrelay.com, redirects off, no Referer header', async () => {
    const seen: [string, FetchOpts | undefined][] = [];
    const fake = async (url: string, opts?: FetchOpts) => {
      seen.push([url, opts]);
      const data = url.endsWith('5af99fc0-02f8-4dc2-8e9a-ba20ad3093c5') ? '{"error":"player not found"}' : '{}';
      const status = data === '{}' ? 200 : 404;
      return { status, url, headers: new Headers(), data, bytes: data.length, blocked: false, wallMs: 1 };
    };
    const fx = Object.assign(fake, { remaining: () => 45, used: () => seen.length }) as unknown as FetchX;
    const raw = await hdrelayConfig.fetch({ fetch: fx, now: NOW } as FetchCtx);
    expect(seen).toHaveLength(12);
    expect(seen.every(([u, o]) => u.startsWith('https://manage.hdrelay.com/player/') && o?.follow === false)).toBe(
      true,
    );
    expect(seen.some(([, o]) => Object.keys(o?.headers ?? {}).some((h) => /referer/i.test(h)))).toBe(false);
    expect(raw['snowbasin-needles']).toEqual({ status: 404 });
    expect(raw['snowbird-snowstake']).toEqual({ status: 200, body: {} });
  });
});
