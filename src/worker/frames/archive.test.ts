import { describe, expect, it } from 'vitest';
import { MIN, zonedToUtc } from '../../shared/time.ts';
import { altaMarkers, parseQuery, thin } from './archive.ts';

const at = (local: string): number => zonedToUtc(local) ?? Number.NaN;

describe('archive helpers', () => {
  it('Alta markers: clear at 04:00/16:00 local inside the window, pre-clear = last frame in the 30 min before', () => {
    const frames = ['2026-12-28 03:20', '2026-12-28 03:40', '2026-12-28 03:55', '2026-12-28 04:05'].map((l) => ({
      t: at(l),
    }));
    const markers = altaMarkers(frames, at('2026-12-28 02:00'), at('2026-12-28 15:00'));
    expect(markers).toEqual([
      { t: at('2026-12-28 03:55'), kind: 'pre-clear', label: 'Before clear · 3:55 AM' },
      { t: at('2026-12-28 04:00'), kind: 'clear', label: 'Cleared · 4:00 AM' },
    ]);
    const overnight = altaMarkers([], at('2026-12-27 15:00'), at('2026-12-28 05:00'));
    expect(overnight.map((m) => m.t)).toEqual([at('2026-12-27 16:00'), at('2026-12-28 04:00')]);
  });

  it('thin and parseQuery', () => {
    const rows = [0, 5, 10, 15, 20, 31].map((m) => ({ t: m * MIN }));
    expect(thin(rows, 15).map((r) => r.t / MIN)).toEqual([0, 15, 31]); // walks back from the newest
    expect(thin(rows, 5)).toEqual(rows);
    // Real frame times jitter: 15-min frames up to 1 s early/late all stay; 5-min frames thin to exactly every third
    const jitter = (i: number) => (i % 2 ? -1000 : 1000);
    const quarter = Array.from({ length: 8 }, (_, i) => ({ t: i * 15 * MIN + jitter(i) }));
    expect(thin(quarter, 15)).toEqual(quarter);
    const five = Array.from({ length: 13 }, (_, i) => ({ t: i * 5 * MIN - i })); // each a ms earlier
    expect(thin(five, 15).map((r) => Math.round(r.t / MIN))).toEqual([0, 15, 30, 45, 60]);
    expect(parseQuery(new URLSearchParams('hours=99&step=15'))).toEqual({ hours: 26, step: 15 });
    expect(parseQuery(new URLSearchParams('hours=0&step=7'))).toEqual({ hours: 1, step: 5 });
    expect(parseQuery(new URLSearchParams(''))).toEqual({ hours: 24, step: 5 });
  });
});
