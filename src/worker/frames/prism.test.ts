import { describe, expect, it } from 'vitest';
import { HOUR, MIN, zonedToUtc } from '../../shared/time.ts';
import camInit from './fixtures/prism/20261013-cam-init.json?raw';
import segments from './fixtures/prism/20261013-segmentlist.txt?raw';
import { buildPrism, camInitUrl, mp4Folders, segmentSpan } from './prism.ts';

const NOW = 1_791_927_600_000; // 2026-10-13 15:40 MDT, minutes after the capture
const BALDY = { n: '88', pad: '00088' };
const GCS = 'https://storage.googleapis.com/prism-cam-00088';
const body: unknown = JSON.parse(camInit);

describe('Prism frame lists', () => {
  it('cam_init fixture -> frames from images[].path inside the window, oldest first', () => {
    const { frames, markers } = buildPrism(body, BALDY, { hours: 24, step: 5 }, NOW);
    expect(frames).toHaveLength(37); // yesterday 15:34 is just outside 24 h; 15:39 is in
    expect(frames[0]).toEqual({
      t: 1_791_841_206_000,
      thumb: `${GCS}/2026/10/12/15-39/360.jpg`,
      full: `${GCS}/2026/10/12/15-39/1080.jpg`,
    });
    expect(frames.at(-1)?.thumb).toBe(`${GCS}/2026/10/13/15-34/360.jpg`);
    expect(markers).toEqual([]);
    const thinned = buildPrism(body, BALDY, { hours: 3, step: 15 }, NOW).frames.map((f) => f.t);
    for (let i = 1; i < thinned.length; i++) {
      expect((thinned[i] ?? 0) - (thinned[i - 1] ?? 0)).toBeGreaterThanOrEqual(15 * MIN);
    }
  });

  it('gate: a body without the cam throws; images without a valid path or time are skipped', () => {
    expect(() => buildPrism({ cams: [] }, BALDY, { hours: 24, step: 5 }, NOW)).toThrow(/missing/);
    expect(() => buildPrism('', BALDY, { hours: 24, step: 5 }, NOW)).toThrow(/missing/);
    const junk = {
      cams: [{ id: '88', images: [{ time: '1791927305', path: '00088/2026/10/13/15-34' }, { path: 'x' }] }],
    };
    expect(buildPrism(junk, BALDY, { hours: 24, step: 5 }, NOW).frames).toEqual([]);
  });

  it('segmentlist fixture -> the Denver-hour span, `to` = last hour + 1 h; junk -> null', () => {
    expect(segmentSpan(segments)).toEqual({
      from: zonedToUtc('2026-10-12 15:00'),
      to: (zonedToUtc('2026-10-13 14:00') ?? 0) + HOUR,
    });
    expect(segmentSpan('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>')).toBeNull();
  });

  it('MP4 folders: today, yesterday (Denver dates), then running/; cam_init carries the mandatory url', () => {
    expect(mp4Folders('00088', NOW)).toEqual([
      `${GCS}/2026/10/13/timelapse/`,
      `${GCS}/2026/10/12/timelapse/`,
      `${GCS}/running/`,
    ]);
    expect(camInitUrl('88')).toBe(
      'https://php.prismcam.com/public/helpers/cam_init.php?cams=88&pages=&url=%2F%2Futah.otakar.dev%2F',
    );
  });
});
