import { describe, expect, it } from 'vitest';
import { CAM_CHECK_MAX_MS, CAM_FRESH_MS, camFresh, freshAtCheck } from './cam-fresh.ts';
import { isoUtc, MIN } from './time.ts';

const PROBE = Date.parse('2026-11-15T22:55:35Z'); // 15:55 in Denver: daylight
const ago = (ms: number, min: number) => isoUtc(ms - min * MIN);

describe('camFresh', () => {
  it('a cam that was fresh at its hourly probe stays fresh until the next one, however late that runs', () => {
    const asOf = ago(PROBE, 4);
    for (let min = 0; min <= 65; min++) {
      expect(camFresh('do_still', asOf, isoUtc(PROBE), PROBE + min * MIN), `probe + ${min} min`).toBe(true);
    }
  });

  it('a picture that was already 50 min old at the probe is stale', () => {
    expect(camFresh('prism', ago(PROBE, 50), isoUtc(PROBE), PROBE + MIN)).toBe(false);
    expect(camFresh('prism', ago(PROBE, 45), isoUtc(PROBE), PROBE + MIN)).toBe(true);
  });

  it('one missed probe is tolerated; a check older than two probes proves nothing', () => {
    const asOf = ago(PROBE, 4);
    expect(camFresh('hdrelay', asOf, isoUtc(PROBE), PROBE + 125 * MIN)).toBe(true);
    expect(camFresh('hdrelay', asOf, isoUtc(PROBE), PROBE + 180 * MIN)).toBe(false);
    expect(CAM_CHECK_MAX_MS).toBeGreaterThan(2 * 60 * MIN);
  });

  it('Roundshot: last dusk picture is fine at a night probe, and still fine after 07:10 until the next probe', () => {
    const probe = Date.parse('2026-11-16T13:55:30Z'); // 06:55 in Denver
    const dusk = isoUtc(Date.parse('2026-11-16T00:20:00Z')); // 17:20 the evening before
    expect(camFresh('roundshot', dusk, isoUtc(probe), probe + 35 * MIN)).toBe(true); // 07:30
    expect(camFresh('roundshot360', dusk, isoUtc(probe), probe + 35 * MIN)).toBe(true);
    const day = probe + 60 * MIN; // the 07:55 probe still sees the dusk picture: stale
    expect(camFresh('roundshot', dusk, isoUtc(day), day + MIN)).toBe(false);
    expect(camFresh('do_still', dusk, isoUtc(probe), probe + MIN)).toBe(false); // other kinds have no night
  });

  it('without a check time (archived stakes, old rows) the picture is judged against now', () => {
    expect(camFresh('do_still', ago(PROBE, 44), null, PROBE)).toBe(true);
    expect(camFresh('do_still', ago(PROBE, 46), undefined, PROBE)).toBe(false);
    expect(camFresh('do_still', ago(PROBE, 5), 'not a date', PROBE)).toBe(true);
    expect(camFresh(undefined, null, null, PROBE)).toBe(false);
  });
});

describe('freshAtCheck', () => {
  it('needs both times, and the picture within 45 min of the check', () => {
    expect(freshAtCheck(ago(PROBE, 45), isoUtc(PROBE))).toBe(true);
    expect(freshAtCheck(isoUtc(PROBE - CAM_FRESH_MS - 1000), isoUtc(PROBE))).toBe(false);
    expect(freshAtCheck(ago(PROBE, 5), null)).toBe(false);
    expect(freshAtCheck(null, isoUtc(PROBE))).toBe(false);
  });
});
