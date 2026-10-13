import { describe, expect, it } from 'vitest';
import { CAMS } from '../../config/cams/index.ts';
import { DEFAULT_HLS_ORIGIN, expandCamUrl, hasTimeBucket, hlsOrigin, ytHqFallback } from './cam-url.ts';
import { isoToMs } from './time.ts';

const NOW = isoToMs('2026-12-31T06:30:00Z') ?? 0; // 23:30 on Dec 30 in Denver

describe('expandCamUrl', () => {
  it('fills the time buckets from nowMs', () => {
    const url = expandCamUrl('x?m={m}&m5={m5}&h={h}&s={s}', NOW);
    expect(url).toBe(
      `x?m=${Math.floor(NOW / 60_000)}&m5=${Math.floor(NOW / 300_000)}&h=${Math.floor(NOW / 3_600_000)}&s=${NOW / 1000}`,
    );
    expect(expandCamUrl('x?t={m}', NOW + 59_999)).toBe(expandCamUrl('x?t={m}', NOW));
    expect(expandCamUrl('x?t={m}', NOW + 60_000)).not.toBe(expandCamUrl('x?t={m}', NOW));
  });

  it('fills id, hls, path and the Denver date', () => {
    const vars = { id: 'lkEM6EC8NVA', hls: '//b15.hdrelay.com', path: '2026/12/30/23-20' };
    expect(expandCamUrl('https://i.ytimg.com/vi/{id}/hq.jpg', NOW, vars)).toBe(
      'https://i.ytimg.com/vi/lkEM6EC8NVA/hq.jpg',
    );
    expect(expandCamUrl('{hls}/camera/c/snapshot', NOW, vars)).toBe('https://b15.hdrelay.com/camera/c/snapshot');
    expect(expandCamUrl('p/{path}/360.jpg', NOW, vars)).toBe('p/2026/12/30/23-20/360.jpg');
    expect(expandCamUrl('p/{YYYY/MM/DD}/t.mp4', NOW)).toBe('p/2026/12/30/t.mp4');
  });

  it('returns null for a missing or malformed value and for unknown placeholders', () => {
    expect(expandCamUrl('https://i.ytimg.com/vi/{id}/hq.jpg', NOW)).toBeNull();
    expect(expandCamUrl('https://i.ytimg.com/vi/{id}/hq.jpg', NOW, { id: '../evil' })).toBeNull();
    expect(expandCamUrl('{hls}/camera/c', NOW, { hls: 'https://evil.example.com' })).toBeNull();
    expect(expandCamUrl('p/{path}/360.jpg', NOW, { path: '2026-12-30' })).toBeNull();
    expect(expandCamUrl('x?t={videoId}', NOW, { id: 'lkEM6EC8NVA' })).toBeNull();
    expect(expandCamUrl('x?t={m}', Number.NaN)).toBeNull();
  });

  it('expands every registry still and live template', () => {
    const vars = { id: 'lkEM6EC8NVA', hls: DEFAULT_HLS_ORIGIN };
    for (const cam of CAMS) {
      for (const tpl of Object.values(cam.still)) {
        expect(expandCamUrl(tpl, NOW, vars), `${cam.id} ${tpl}`).toMatch(/^https:\/\/[^{}]+$/);
        expect(hasTimeBucket(tpl), `${cam.id} busts caches`).toBe(true);
      }
      const live = 'live' in cam ? cam.live : undefined;
      if (live && 'url' in live) expect(expandCamUrl(live.url, NOW, vars)).toMatch(/^https:\/\/[^{}]+$/);
    }
  });
});

describe('hlsOrigin', () => {
  it('normalizes every host form to an https origin', () => {
    for (const raw of [
      '//b15.hdrelay.com',
      'b15.hdrelay.com',
      'https://b15.hdrelay.com/camera/x/relay/playlist.m3u8',
    ]) {
      expect(hlsOrigin(raw)).toBe('https://b15.hdrelay.com');
    }
  });

  it('rejects other hosts and plain http', () => {
    for (const raw of ['', null, 'http://b15.hdrelay.com', 'https://hdrelay.com.evil.net', 'https://x.example.com']) {
      expect(hlsOrigin(raw)).toBeNull();
    }
  });
});

describe('ytHqFallback', () => {
  it('swaps maxres for hq only on maxres thumbnails', () => {
    expect(ytHqFallback('https://i.ytimg.com/vi/a/maxresdefault_live.jpg?t=1')).toBe(
      'https://i.ytimg.com/vi/a/hqdefault_live.jpg?t=1',
    );
    expect(ytHqFallback('https://i.ytimg.com/vi/a/mqdefault_live.jpg?t=1')).toBeNull();
  });
});
