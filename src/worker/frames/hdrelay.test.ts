import { describe, expect, it } from 'vitest';
import { HOUR, MIN } from '../../shared/time.ts';
import next from './fixtures/hdrelay/20261013-next.json?raw';
import { buildHdrelay, type HdrelayInput, nextUrl } from './hdrelay.ts';

const NOW = 1_791_927_600_000; // 2026-10-13 15:40 MDT, just after the capture (3 h of Snowbird's stake, n=36)
const CAMERA = '8611e276-7ee5-42c0-b8cd-d9e1890e1cd4';
const body: unknown = JSON.parse(next);
const inp = (over: Partial<HdrelayInput> = {}): HdrelayInput => ({
  cameraId: CAMERA,
  archive: { position: 'default', gated: false },
  hotlink: null,
  first: 1_782_323_700_577, // frames/info.first (2026-06-24)
  ...over,
});

describe('HDRelay frame lists', () => {
  it('frames/next fixture -> ascending frames with h:270 thumbs and the original as full', () => {
    const { frames, markers } = buildHdrelay(body, inp(), { hours: 3, step: 5 }, NOW);
    expect(frames).toHaveLength(36);
    expect(frames[0]).toEqual({
      t: 1_791_916_800_572,
      thumb: `https://img.hdrelay.com/frames/${CAMERA}/default/1791916800572/:/rs=h:270`,
      full: `https://img.hdrelay.com/frames/${CAMERA}/default/1791916800572`,
    });
    expect(frames.at(-1)?.t).toBe(1_791_927_300_829);
    expect(markers).toEqual([]);

    const patio = inp({ archive: { position: 'panorama', gated: true, fullRs: 'h:720' } });
    const strawberry = buildHdrelay(body, patio, { hours: 3, step: 5 }, NOW).frames[0];
    expect(strawberry?.full).toBe(`https://img.hdrelay.com/frames/${CAMERA}/panorama/1791916800572/:/rs=h:720`);
  });

  it('step=15 keeps every third 5-min frame despite ms jitter, newest kept; a shorter window drops older frames', () => {
    const got = buildHdrelay(body, inp(), { hours: 3, step: 15 }, NOW).frames.map((f) => f.t);
    expect(got.at(-1)).toBe(1_791_927_300_829);
    expect(got).toHaveLength(12); // 36 frames: no 20/30-min holes where a gap lands a few ms under 15 min
    for (let i = 1; i < got.length; i++) expect(Math.round(((got[i] ?? 0) - (got[i - 1] ?? 0)) / MIN)).toBe(15);
    const hour = buildHdrelay(body, inp(), { hours: 1, step: 5 }, NOW).frames;
    expect(hour.every((f) => f.t >= NOW - HOUR)).toBe(true);
    expect(hour).toHaveLength(12);
  });

  it('last-snow marks hotlink.time only when enabled, inside the window and not before frames/info.first', () => {
    const t = NOW - 2 * HOUR;
    const mark = (hotlink: HdrelayInput['hotlink'], first = inp().first) =>
      buildHdrelay(body, inp({ hotlink, first }), { hours: 3, step: 5 }, NOW).markers;
    expect(mark({ enabled: true, time: t })).toEqual([{ t, kind: 'last-snow', label: 'Last snow · 1:40 PM' }]);
    expect(mark({ enabled: false, time: t })).toEqual([]);
    expect(mark({ enabled: true, time: NOW - 5 * HOUR })).toEqual([]); // outside the window
    expect(mark({ enabled: true, time: t }, t + MIN)).toEqual([]); // an old bookmark from before the archive
    expect(mark({ enabled: true, time: t }, null)).toEqual([]);
  });

  it('gate: a body that is not an array throws (no list is cached)', () => {
    expect(() => buildHdrelay({ error: 'nope' }, inp(), { hours: 3, step: 5 }, NOW)).toThrow(/not an array/);
  });

  it('nextUrl asks from now − hours with one spare frame, bounded by interval=300 (900 for step 15)', () => {
    expect(nextUrl(CAMERA, 'default', { hours: 3, step: 5 }, NOW)).toBe(
      `https://img.hdrelay.com/api/frames/next?camera=${CAMERA}&position=default&time=${NOW - 3 * HOUR}&n=37&interval=300`,
    );
    expect(nextUrl(CAMERA, 'panorama', { hours: 24, step: 15 }, NOW)).toMatch(
      /position=panorama&.*&n=289&interval=900$/,
    );
  });
});
