import { describe, expect, it } from 'vitest';
import { toMs } from '../../shared/time.ts';
import { createFetchx } from '../lib/fetchx.ts';
import { ALTA_WEATHER_URL, type AltaWeather, altaWeather } from './alta-weather.ts';
import liftPage from './fixtures/alta/20261012-live.html?raw';
import feb from './fixtures/alta-weather/20260218-inseason.html?raw';
import live from './fixtures/alta-weather/20261012-live.html?raw';
import { type FetchCtx, ValidationError } from './types.ts';

const run = (html: string, iso: string) =>
  altaWeather.parse(html, { now: toMs(iso), prev: {} }).rows['alta:weather'] as AltaWeather;

describe('alta-weather parse: live off-season page (2026-10-12 19:55 MDT)', () => {
  const r = run(live, '2026-10-13T01:55:00Z');

  it('is preseason with last season’s history dropped by recency', () => {
    expect(r).toMatchObject({ season: 20252026, preseason: true, days: [] });
  });

  it('keeps the hourly station readings sorted by time', () => {
    expect(r.obs).toHaveLength(60);
    expect(r.obs[0]).toEqual({
      at: '2026-10-11T19:00:00-06:00',
      loc: 'mid',
      tempF: 33,
      snowIn: 0,
      windMph: 0,
      windDir: 'NNE',
    });
    expect(r.obs.at(-1)).toMatchObject({ at: '2026-10-12T19:00:00-06:00', loc: 'summit', tempF: 31.1, windMph: 8.7 });
    const keys = r.obs.map((o) => o.at);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('alta-weather parse: 2026-02-17 23:46 MST', () => {
  const r = run(feb, '2026-02-18T06:46:04Z');

  it('keeps the last 14 days of the current season, ascending', () => {
    expect(r.preseason).toBe(false);
    expect(r.days.map((d) => d.date)).toEqual(
      Array.from({ length: 14 }, (_, i) => `2026-02-${String(i + 3).padStart(2, '0')}`),
    );
    expect(r.days.find((d) => d.date === '2026-02-11')).toEqual({
      date: '2026-02-11',
      newSnowIn: 7.5,
      stormTotalIn: 10,
      ytdIn: 154,
    });
    expect(r.days.reduce((s, d) => s + d.newSnowIn, 0)).toBe(11.5);
  });

  it('maps Base, Mid Mountain and Top of Collins readings', () => {
    expect(r.obs).toHaveLength(75);
    expect(r.obs.at(-1)).toEqual({
      at: '2026-02-17T23:00:00-07:00',
      loc: 'summit',
      tempF: 14.3,
      snowIn: 0,
      windMph: 15.3,
      windDir: 'SW',
    });
    expect(new Set(r.obs.map((o) => o.loc))).toEqual(new Set(['base', 'mid', 'summit']));
  });

  it('filters history by seasons[0].value', () => {
    const json = JSON.stringify({
      seasonal: { is_winter: true },
      weather: {
        observation: { weather: [] },
        snowfall: {
          seasons: [{ value: 20262027 }],
          history: [
            { season: 20252026, reported_at: '2026-12-20', new_snow: 5 },
            { season: 20262027, reported_at: '2026-12-21', new_snow: '3.0', storm_total: 3, ytd_snow: 40 },
          ],
        },
      },
    });
    const days = run(`<script>window.Alta = ${json};</script>`, '2026-12-22T15:00:00Z').days;
    expect(days).toEqual([{ date: '2026-12-21', newSnowIn: 3, stormTotalIn: 3, ytdIn: 40 }]);
  });
});

describe('alta-weather validation gate and fetch', () => {
  it('throws ValidationError on garbage and on a page without window.Alta.weather', () => {
    const ctx = { now: toMs('2026-10-13T01:55:00Z'), prev: {} };
    expect(() => altaWeather.parse('<html>502 Bad Gateway</html>', ctx)).toThrow(ValidationError);
    expect(() => altaWeather.parse(liftPage, ctx)).toThrow(ValidationError);
  });

  it('uses exactly maxSubrequests() = 1 and rejects redirects', async () => {
    const ctxWith = (res: () => Response): { ctx: FetchCtx; used: () => number } => {
      const fx = createFetchx({ fetchImpl: async () => res() });
      const keyed = { yt: false, udot: false };
      return { ctx: { fetch: fx, now: 0, slot: 5, morning: false, keyed, secrets: {}, prev: {} }, used: fx.used };
    };
    const ok = ctxWith(() => new Response(live, { status: 200 }));
    expect(altaWeather.maxSubrequests(ok.ctx)).toBe(1);
    expect(await altaWeather.fetch(ok.ctx)).toBe(live);
    expect(ok.used()).toBe(1);
    const moved = ctxWith(() => new Response('', { status: 302, headers: { location: `${ALTA_WEATHER_URL}/` } }));
    await expect(altaWeather.fetch(moved.ctx)).rejects.toThrow(/HTTP 302/);
    expect(moved.used()).toBe(1);
  });
});
