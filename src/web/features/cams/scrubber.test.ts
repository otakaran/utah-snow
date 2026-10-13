import { describe, expect, it } from 'vitest';
import { framesUrl, isFramesBody, keyMove, lookahead, markerSpot, scrubStep, stepIndex } from './scrubber.ts';

const none: ReadonlySet<number> = new Set();

describe('scrubber helpers', () => {
  it('step 15 on phones and in data saver, else 5; the list URL carries hours and step', () => {
    expect(scrubStep(false, false)).toBe(5);
    expect(scrubStep(true, false)).toBe(15);
    expect(scrubStep(false, true)).toBe(15);
    expect(framesUrl('snowbird-snowstake', 15)).toBe('/api/stake/snowbird-snowstake/frames?hours=24&step=15');
  });

  it('keys: ← → move one frame, Home/End jump to the ends, broken frames are skipped, ends stop', () => {
    expect(keyMove('ArrowLeft', 5, 10, none)).toEqual({ i: 4, dir: -1 });
    expect(keyMove('ArrowRight', 5, 10, none)).toEqual({ i: 6, dir: 1 });
    expect(keyMove('Home', 5, 10, none)).toEqual({ i: 0, dir: 1 });
    expect(keyMove('End', 5, 10, none)).toEqual({ i: 9, dir: -1 });
    expect(keyMove('ArrowLeft', 5, 10, new Set([4, 3]))).toEqual({ i: 2, dir: -1 });
    expect(keyMove('Home', 5, 10, new Set([0]))).toEqual({ i: 1, dir: 1 });
    expect(keyMove('ArrowLeft', 0, 10, none)).toBeNull();
    expect(keyMove('End', 9, 10, none)).toBeNull();
    expect(keyMove('a', 5, 10, none)).toBeNull();
    expect(stepIndex(2, -1, 10, new Set([0, 1]))).toBeNull();
  });

  it('preloads only the next 3 frames in the travel direction', () => {
    expect(lookahead(9, -1, 10, none)).toEqual([8, 7, 6]);
    expect(lookahead(1, -1, 10, none)).toEqual([0]);
    expect(lookahead(2, 1, 10, new Set([3]))).toEqual([4, 5, 6]);
    expect(lookahead(9, 1, 10, none)).toEqual([]);
  });

  it('markers sit on their nearest frame, by index; outside the list they are dropped', () => {
    const frames = [0, 5, 10, 60].map((m) => ({ t: m * 60_000 }));
    expect(markerSpot(frames, 9 * 60_000)).toEqual({ i: 2, pct: (2 / 3) * 100 });
    expect(markerSpot(frames, 60 * 60_000)).toEqual({ i: 3, pct: 100 });
    expect(markerSpot(frames, 61 * 60_000)).toBeNull();
    expect(markerSpot([], 0)).toBeNull();
  });

  it('isFramesBody accepts the wire shape and rejects anything else', () => {
    const frame = { t: 1, thumb: 'a', full: 'b' };
    expect(isFramesBody({ camId: 'x', provider: 'prism', frames: [frame], markers: [] })).toBe(true);
    expect(isFramesBody({ frames: [{ t: '1', thumb: 'a', full: 'b' }], markers: [] })).toBe(false);
    expect(isFramesBody({ error: 'not-found' })).toBe(false);
    expect(isFramesBody(null)).toBe(false);
  });
});
