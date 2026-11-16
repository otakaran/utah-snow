import { describe, expect, it } from 'vitest';
import { pairAlias } from './udot.ts';

const cams = [
  { id: 'udot-171387', name: 'SR-210 @ SR-209 (canyon mouth)', corridor: 'lcc' },
  { id: 'udot-171450', name: 'Seven Turns MP 7.4', corridor: 'lcc' },
  { id: 'udot-171613', name: 'SR-209 @ Wasatch Blvd/3400 E', corridor: 'lcc' },
  { id: 'udot-171185', name: 'SR-209 @ Old Wasatch/9710 S', corridor: 'lcc' },
  { id: 'udot-170563', name: 'Dogwood MP 4.1', corridor: 'bcc' },
] as const;

describe('pairAlias', () => {
  it('pairs by road and milepost', () => {
    const alt = 'Little Cottonwood Rd / SR-210 EB @ Seven Turns / MP 7.4, SL';
    expect(pairAlias(alt, cams)?.id).toBe('udot-171450');
  });

  it('never pairs a milepost across canyons', () => {
    expect(pairAlias('Big Cottonwood Canyon Rd / SR-190 @ Somewhere / MP 7.4, SL', cams)).toBeNull();
  });

  it('pairs a name without a milepost by its place words', () => {
    const mouth =
      'North Little Cottonwood Rd / Little Cottonwood Canyon Rd / SR-210 @ Little Cottonwood Rd / SR-209, SL';
    expect(pairAlias(mouth, cams)?.id).toBe('udot-171387');
    const old = 'Little Cottonwood Rd / 3335 E / SR-209 @ Old Wasatch Blvd / 9710 S, GNT';
    expect(pairAlias(old, cams)?.id).toBe('udot-171185');
  });

  it('returns null for an unknown location', () => {
    expect(pairAlias('Little Cottonwood Rd / SR-210 @ Snowbird Center / MP 11.3, SL', cams)).toBeNull();
    expect(pairAlias('I-215 @ 6200 S, HOL', cams)).toBeNull();
  });
});
