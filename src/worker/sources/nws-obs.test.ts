import { describe, expect, it } from 'vitest';
import type { ObsNow } from '../../shared/types.ts';
import live from './fixtures/nws-obs/20261012-live.json?raw';
import synthetic from './fixtures/nws-obs/nws-obs-synthetic.json?raw';
import { nwsObs, OBS_STATIONS, obsUrl } from './nws-obs.ts';
import type { FetchCtx, FetchOpts, FetchResult, FetchX, PrevRows } from './types.ts';
import { ValidationError } from './types.ts';

const LIVE_NOW = Date.parse('2026-10-13T01:40:00Z');
const SYN_NOW = Date.parse('2026-02-17T06:10:00Z');
const obs = (raw: string, now: number, prev: PrevRows = {}) =>
  nwsObs.parse(JSON.parse(raw), { now, prev }).rows.obs as Record<string, ObsNow>;

function ctxWith(handler: (url: string, opts?: FetchOpts) => Promise<FetchResult<string>>): FetchCtx {
  const fetch = Object.assign(handler, { remaining: () => 45, used: () => 0 }) as unknown as FetchX;
  const keyed = { yt: false, udot: false };
  return { fetch, now: LIVE_NOW, slot: 2, morning: false, keyed, secrets: {}, prev: {} };
}
const ok = (url: string, data: string): FetchResult<string> => ({
  status: 200,
  url,
  headers: new Headers(),
  data,
  bytes: data.length,
  blocked: false,
  wallMs: 1,
});

describe('nws-obs (NWS station observations)', () => {
  it('fetches the 13 C.2 stations derived from config, alternates excluded', () => {
    expect([...OBS_STATIONS].sort()).toEqual(
      ['AGD', 'UTALC', 'HDP', 'SBDU1', 'UTBTN', 'PC056', 'BRW', 'DVE', 'DVP', 'EMPUT', 'SBE', 'SWI', 'OGP'].sort(),
    );
    expect(nwsObs.maxSubrequests({} as FetchCtx)).toBe(13);
  });

  it('live 2026-10-12: reports year-round (no pre-season gate), converts to °F / mph', () => {
    const o = obs(live, LIVE_NOW);
    expect(Object.keys(o)).toHaveLength(13);
    expect(o.HDP).toEqual({
      station: 'HDP',
      tempF: 28,
      windMph: 5,
      gustMph: 8,
      dirDeg: 247.5,
      at: '2026-10-13T01:00:00.000Z',
    });
    expect(o.AGD).toMatchObject({ tempF: 33.4, windMph: 2.8, gustMph: 4.8, dirDeg: 48.7 });
    expect(o.SBDU1).toMatchObject({ tempF: 34.7, windMph: null, gustMph: null, dirDeg: null }); // temp-only station
    expect(o.OGP).toMatchObject({ tempF: 32.1, windMph: null, gustMph: 36.2, dirDeg: null });
  });

  it('in-season (synthetic storm): drops QC-rejected values, keeps a fresh prev entry, drops an old one', () => {
    const prev = {
      obs: {
        EMPUT: { station: 'EMPUT', tempF: 12, windMph: 20, gustMph: 45, dirDeg: 200, at: '2026-02-17T05:00:00.000Z' },
        SBE: { station: 'SBE', tempF: 30, windMph: 3, gustMph: 9, dirDeg: 90, at: '2026-02-16T20:00:00.000Z' },
      },
    };
    const o = obs(synthetic, SYN_NOW, prev);
    expect(Object.keys(o).sort()).toEqual(['AGD', 'BRW', 'DVP', 'EMPUT', 'HDP', 'OGP', 'SBDU1']);
    expect(o.HDP).toMatchObject({ tempF: 11, windMph: 32, gustMph: 59.9, dirDeg: 228 });
    expect(o.BRW).toMatchObject({ tempF: 15, windMph: 25.3, gustMph: 49.5 });
    expect(o.OGP).toMatchObject({ tempF: 13, windMph: null, gustMph: 64.6 });
    expect(o.DVP).toMatchObject({ tempF: 17, windMph: 17, gustMph: null }); // 412 km/h gust flagged X
    expect(o.EMPUT).toEqual(prev.obs.EMPUT);
  });

  it('validation gate: garbage or only stale observations throw ValidationError', () => {
    const garbage = JSON.stringify({ AGD: '<html>', HDP: { properties: {} }, BRW: { properties: { stationId: 'X' } } });
    expect(() => obs(garbage, LIVE_NOW)).toThrow(ValidationError);
    expect(() => obs(live, LIVE_NOW + 86_400_000)).toThrow(ValidationError);
  });

  it('fetch: one GET per station with no redirects; a failed station is absent, all failing rethrows', async () => {
    const body = JSON.parse(live) as Record<string, unknown>;
    const seen: FetchOpts[] = [];
    const raw = await nwsObs.fetch(
      ctxWith(async (url, opts) => {
        seen.push(opts ?? {});
        const id = OBS_STATIONS.find((s) => url === obsUrl(s)) ?? '';
        if (id === 'HDP') throw new Error('HTTP 503');
        return ok(url, JSON.stringify(body[id]));
      }),
    );
    expect(seen).toHaveLength(13);
    expect(seen.every((o) => o.follow === false)).toBe(true);
    expect(Object.keys(raw)).toHaveLength(12);
    expect(raw.HDP).toBeUndefined();
    const down = ctxWith(async () => {
      throw new Error('HTTP 500');
    });
    await expect(nwsObs.fetch(down)).rejects.toThrow('HTTP 500');
  });
});
