import { describe, expect, it } from 'vitest';
import { BASES } from '../../../../config/bases.ts';
import type { Meta, RoadStatus, Snapshot } from '../../../shared/types.ts';
import { destMatches, driveMatrix, liveDelayMin, nearestPreset, signFor } from './drive.ts';

const NOW = Date.parse('2026-12-27T13:00:00Z');
const CH = BASES['cottonwood-heights'];

function snapWithSign(okAt: string, travel: { dest: string; min: number }[]): Snapshot {
  const meta: Meta = {
    source: 'roads:lcc',
    fetchedAt: okAt,
    okAt,
    asOf: null,
    status: 'ok',
    failCount: 0,
    staleAfterMin: 15,
  };
  const sign = { id: '6019', name: 'Wasatch Blvd', lines: [], travel, advisory: null, at: okAt };
  const data = { corridor: 'lcc', signs: [sign] } as unknown as RoadStatus;
  return { roads: { lcc: { data, meta } } } as unknown as Snapshot;
}

describe('signFor', () => {
  it('picks the Cottonwood sign by latitude and skips Wasatch Back bases and Snowbasin', () => {
    expect(signFor('alta', CH)).toBe('6019');
    expect(signFor('brighton', BASES.sandy)).toBe('6040');
    expect(signFor('deer-valley', CH)).toBe('6014');
    expect(signFor('snowbasin', CH)).toBeNull();
    expect(signFor('alta', BASES['park-city-old-town'])).toBeNull();
  });
});

describe('destMatches', () => {
  it('matches the live sign wording to the config baselines', () => {
    expect(destMatches('LITTLE COTTONWOOD CANYON TOP', 'LCC top')).toBe(true);
    expect(destMatches('BIG COTTONWOOD CANYON TOP', 'LCC top')).toBe(false);
    expect(destMatches('BIG COTTONWOOD CANYON TOP', 'BCC top')).toBe(true);
    expect(destMatches('TIME TO PARK CITY', 'Park City')).toBe(true);
    expect(destMatches('TIME TO I-84', 'Park City')).toBe(false);
  });
});

describe('liveDelayMin', () => {
  it('is the sign minutes over the baseline, never negative', () => {
    const snap = snapWithSign('2026-12-27T12:58:00Z', [{ dest: 'LITTLE COTTONWOOD CANYON TOP', min: 32 }]);
    expect(liveDelayMin(snap, 'alta', CH, NOW)).toBe(8);
    const quiet = snapWithSign('2026-12-27T12:58:00Z', [{ dest: 'LCC Top', min: 20 }]);
    expect(liveDelayMin(quiet, 'snowbird', CH, NOW)).toBe(0);
  });

  it('is null for a stale road row or a missing line', () => {
    const stale = snapWithSign('2026-12-27T11:00:00Z', [{ dest: 'LCC Top', min: 40 }]);
    expect(liveDelayMin(stale, 'alta', CH, NOW)).toBeNull();
    const other = snapWithSign('2026-12-27T12:58:00Z', [{ dest: 'BCC Top', min: 40 }]);
    expect(liveDelayMin(other, 'alta', CH, NOW)).toBeNull();
    expect(liveDelayMin(null, 'alta', CH, NOW)).toBeNull();
  });
});

describe('driveMatrix', () => {
  it('uses the preset row, or the nearest preset for a custom point (approx)', () => {
    expect(driveMatrix({ id: 'sandy', ...BASES.sandy })).toMatchObject({ approx: false, min: { alta: 27 } });
    const custom = { id: 'custom', lat: 40.64, lon: -111.5 };
    expect(nearestPreset(custom)).toBe('park-city-old-town');
    expect(driveMatrix(custom)).toMatchObject({ approx: true, min: { 'deer-valley': 4 } });
  });
});
