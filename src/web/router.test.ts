import { describe, expect, it } from 'vitest';
import { parseHash, WALL_DEFAULTS, wallHref, wallParams, weatherHref } from './router.ts';

describe('parseHash', () => {
  it('maps every route and redirects unknown paths', () => {
    expect(parseHash('')).toEqual({ name: 'briefing' });
    expect(parseHash('#/')).toEqual({ name: 'briefing' });
    expect(parseHash('#/cams')).toEqual({ name: 'cams' });
    expect(parseHash('#/settings/')).toEqual({ name: 'settings' });
    expect(parseHash('#/tracker')).toEqual({ name: 'tracker' });
    expect(parseHash('#/resort/deer-valley')).toEqual({ name: 'resort', id: 'deer-valley' });
    expect(parseHash('#/resort/vail')).toBeNull();
    expect(parseHash('#/resort/%E0%A4%A')).toBeNull(); // malformed escape
    expect(parseHash('#/main')).toBeNull();
    expect(parseHash('#/cams/extra')).toBeNull();
  });

  it('fills wall params from the stored defaults; valid URL params win', () => {
    const stored = { rotate: 30, yt: 120, set: 'lcc', hls: 1, wx: 2 } as const;
    expect(parseHash('#/wall', stored)).toEqual({ name: 'wall', params: stored });
    expect(parseHash('#/wall?rotate=45&set=stakes&hls=0&yt=x&wx=0', stored)).toEqual({
      name: 'wall',
      params: { rotate: 45, yt: 120, set: 'stakes', hls: 0, wx: 0 },
    });
    expect(parseHash('#/wall?rotate=2.5&set=nope')).toEqual({ name: 'wall', params: WALL_DEFAULTS });
  });
});

describe('wall params', () => {
  it('clamps numbers to WALL_LIMITS (the Settings ranges and the player cap)', () => {
    expect(parseHash('#/wall?rotate=1&yt=-5&hls=9&wx=99')).toEqual({
      name: 'wall',
      params: { ...WALL_DEFAULTS, rotate: 5, yt: 30, hls: 3, wx: 24 },
    });
    expect(parseHash('#/wall?wx=-1')).toEqual({ name: 'wall', params: { ...WALL_DEFAULTS, wx: 0 } });
  });

  it('round-trips through wallHref and accepts stored numbers', () => {
    const p = { rotate: 25, yt: 90, set: 'bcc', hls: 3, wx: 1 } as const;
    expect(parseHash(wallHref(p))).toEqual({ name: 'wall', params: p });
    expect(wallParams((k) => ({ rotate: 10, yt: '60', set: 'pc', hls: 'x', wx: '0' })[k])).toEqual({
      rotate: 10,
      yt: 60,
      set: 'pc',
      hls: WALL_DEFAULTS.hls,
      wx: 0,
    });
  });

  it('decodes a stored object saved before `wx` existed with the default weather cadence', () => {
    const old: Record<string, unknown> = { rotate: 30, yt: 120, set: 'lcc', hls: 1 };
    expect(WALL_DEFAULTS.wx).toBe(4);
    expect(wallParams((k) => old[k])).toEqual({ rotate: 30, yt: 120, set: 'lcc', hls: 1, wx: 4 });
  });
});

describe('weather route', () => {
  it('bare #/weather leaves the resort to the page (the crew pick)', () => {
    expect(parseHash('#/weather')).toEqual({ name: 'weather', resort: null });
    expect(parseHash('#/weather/')).toEqual({ name: 'weather', resort: null });
  });

  it('?r= selects a resort', () => {
    expect(parseHash('#/weather?r=snowbird')).toEqual({ name: 'weather', resort: 'snowbird' });
    expect(parseHash('#/weather?x=1&r=deer-valley')).toEqual({ name: 'weather', resort: 'deer-valley' });
  });

  it('an unknown or empty ?r= falls back to the default without a redirect', () => {
    expect(parseHash('#/weather?r=vail')).toEqual({ name: 'weather', resort: null });
    expect(parseHash('#/weather?r=')).toEqual({ name: 'weather', resort: null });
  });

  it('extra path segments redirect', () => {
    expect(parseHash('#/weather/alta')).toBeNull();
  });

  it('round-trips through weatherHref', () => {
    expect(weatherHref()).toBe('#/weather');
    expect(weatherHref(null)).toBe('#/weather');
    expect(parseHash(weatherHref('alta'))).toEqual({ name: 'weather', resort: 'alta' });
  });
});
