import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../../shared/time.ts';
import structure from './fixtures/roundshot/20261013-structure.json?raw';
import { build360, parseLatest, roundshotSlots } from './roundshot.ts';

const NOW = 1_791_927_600_000; // 2026-10-13 15:40 MDT
const at = (local: string): number => zonedToUtc(local) ?? Number.NaN;
// Location of the 302 from backend.roundshot.com/cams/44cfff4ff2a218a1178dbb105d95846a/default (Hidden Peak)
const LOCATION =
  'https://storage4.roundshot.com/5da7581da7f568.58906703/2026-10-13/15-30-00/2026-10-13-15-30-00_default.jpg';
const BASE = 'https://storage4.roundshot.com/5da7581da7f568.58906703';

describe('Roundshot frame lists', () => {
  it('the backend Location names the storage base and the newest capture in Denver time', () => {
    expect(parseLatest(LOCATION)).toEqual({ base: BASE, t: at('2026-10-13 15:30') });
    expect(parseLatest('https://evil.example.com/x/2026-10-13/15-30-00/a.jpg')).toBeNull();
    expect(parseLatest(null)).toBeNull();
  });

  it('daylight 10-min slots (07:10-17:30) from the newest capture back to now − hours', () => {
    const latest = parseLatest(LOCATION);
    if (!latest) throw new Error('no latest');
    const slots = roundshotSlots(latest, { hours: 24, step: 5 }, NOW);
    expect(slots).toHaveLength(12 + 51); // yesterday 15:40-17:30, today 07:10-15:30
    expect(slots[0]?.t).toBe(at('2026-10-12 15:40'));
    expect(slots[12]).toEqual({
      t: at('2026-10-13 07:10'),
      thumb: `${BASE}/2026-10-13/07-10-00/2026-10-13-07-10-00_optional.jpg`,
      full: `${BASE}/2026-10-13/07-10-00/2026-10-13-07-10-00_default.jpg`,
    });
    expect(slots.at(-1)?.t).toBe(at('2026-10-13 15:30'));
    const step15 = roundshotSlots(latest, { hours: 3, step: 15 }, NOW).map((s) => s.t);
    expect(step15).toEqual([
      at('2026-10-13 12:50'),
      at('2026-10-13 13:10'),
      at('2026-10-13 13:30'),
      at('2026-10-13 13:50'),
      at('2026-10-13 14:10'),
      at('2026-10-13 14:30'),
      at('2026-10-13 14:50'),
      at('2026-10-13 15:10'),
      at('2026-10-13 15:30'),
    ]);
  });

  it('360: structure.json fixture -> finished panoramas, wall-clock datetime read as Denver time, oldest first', () => {
    const { frames } = build360(JSON.parse(structure), { hours: 24, step: 5 }, NOW);
    expect(frames.map((f) => f.t)).toEqual([
      at('2026-10-13 07:10'),
      at('2026-10-13 15:10'),
      at('2026-10-13 15:20'),
      at('2026-10-13 15:30'),
    ]);
    const pano = 'https://storage4.roundshot.com/5d7715f0795180.06920267/2026-10-13/15-30-00/2026-10-13-15-30-00';
    expect(frames.at(-1)).toEqual({
      t: at('2026-10-13 15:30'),
      thumb: `${pano}_thumbnail.jpg`,
      full: `${pano}_quarter.jpg`,
    });
  });

  it('gate: a structure without images throws; unfinished or foreign images are skipped', () => {
    expect(() => build360({ camera: 'Snowbird' }, { hours: 24, step: 5 }, NOW)).toThrow(/no images/);
    const bad = {
      images: [
        { status: 'processing', datetime: 1_791_905_400, structure: {} },
        { status: 'finished', datetime: 1_791_905_400, structure: { thumbnail: { url_full: 'https://x.test/a.jpg' } } },
      ],
    };
    expect(build360(bad, { hours: 24, step: 5 }, NOW).frames).toEqual([]);
  });
});
