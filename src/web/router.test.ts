import { describe, expect, it } from 'vitest';
import { parseHash, WALL_DEFAULTS, wallHref, wallParams } from './router.ts';

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
    const stored = { rotate: 30, yt: 120, set: 'lcc', hls: 1 } as const;
    expect(parseHash('#/wall', stored)).toEqual({ name: 'wall', params: stored });
    expect(parseHash('#/wall?rotate=45&set=stakes&hls=0&yt=x', stored)).toEqual({
      name: 'wall',
      params: { rotate: 45, yt: 120, set: 'stakes', hls: 0 },
    });
    expect(parseHash('#/wall?rotate=2.5&set=nope')).toEqual({ name: 'wall', params: WALL_DEFAULTS });
  });
});

describe('wall params', () => {
  it('clamps numbers to WALL_LIMITS (the Settings ranges and the player cap)', () => {
    expect(parseHash('#/wall?rotate=1&yt=-5&hls=9')).toEqual({
      name: 'wall',
      params: { ...WALL_DEFAULTS, rotate: 5, yt: 30, hls: 3 },
    });
  });

  it('round-trips through wallHref and accepts stored numbers', () => {
    const p = { rotate: 25, yt: 90, set: 'bcc', hls: 3 } as const;
    expect(parseHash(wallHref(p))).toEqual({ name: 'wall', params: p });
    expect(wallParams((k) => ({ rotate: 10, yt: '60', set: 'pc', hls: 'x' })[k])).toEqual({
      rotate: 10,
      yt: 60,
      set: 'pc',
      hls: WALL_DEFAULTS.hls,
    });
  });
});
