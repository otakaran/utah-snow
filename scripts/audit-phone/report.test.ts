import { describe, expect, it } from 'vitest';
import { aboveFold, foldImages, type Req, shiftSum, sumBytes, tasks, usedChars } from './report.ts';

const O = 'https://utah.otakar.dev';
const req = (url: string, type: string, bytes: number, phase: Req['phase'] = 'load'): Req => ({
  url,
  type,
  phase,
  bytes,
  status: 200,
});

describe('audit-phone report', () => {
  it('counts only fold images and load-phase requests above the fold', () => {
    const reqs = [
      req(`${O}/assets/index.js`, 'script', 90),
      req(`${O}/api/snapshot`, 'fetch', 12),
      req('https://cams.example/top.jpg', 'image', 100),
      req('https://cams.example/low.jpg', 'image', 500),
      req('https://cdn.example/live/seg1.ts', 'xhr', 300),
      req('https://cams.example/later.jpg', 'image', 40, 'scroll'),
    ];
    const fold = foldImages(
      [
        { src: 'https://cams.example/top.jpg', top: 200, loading: 'lazy', loaded: true, card: '' },
        { src: 'https://cams.example/low.jpg', top: 1100, loading: 'lazy', loaded: true, card: '' },
      ],
      659,
    );
    const above = sumBytes(aboveFold(reqs, fold, O), O);
    expect(above).toEqual({ total: 202, n: 3, byKind: { script: 90, api: 12, image: 100 } });
    expect(sumBytes(reqs, O).byKind).toEqual({ script: 90, api: 12, image: 640, media: 300 });
  });

  it('splits long tasks and layout shifts by window', () => {
    const long = [
      { start: 100, dur: 393.4 },
      { start: 900, dur: 60 },
      { start: 9000, dur: 80 },
    ];
    expect(tasks(long, 0, 5000)).toEqual({ count: 2, totalMs: 453, maxMs: 393 });
    expect(tasks(long, 8000, 9500)).toEqual({ count: 1, totalMs: 80, maxMs: 80 });
    expect(
      shiftSum(
        [
          { start: 1900, value: 0.1234 },
          { start: 400, value: 0.05 },
          { start: 9000, value: 0.3 },
        ],
        5000,
      ),
    ).toBe(0.173);
  });

  it('lets inner V8 block ranges override their function', () => {
    const fns = [
      { ranges: [{ startOffset: 0, endOffset: 100, count: 1 }] },
      {
        ranges: [
          { startOffset: 10, endOffset: 50, count: 0 },
          { startOffset: 20, endOffset: 30, count: 2 },
        ],
      },
    ];
    expect(usedChars(fns, 100)).toBe(70);
  });
});
