import { describe, expect, it } from 'vitest';
import { BASES, GUARDSMAN } from '../../config/bases.ts';
import {
  destMatches,
  driveKey,
  driveMatrix,
  haversineKm,
  liveDelayMin,
  nearestPreset,
  passesNear,
  routeCorridors,
  signFor,
  wasatchPoint,
} from './geo.ts';
import type { Meta, RoadStatus, Snapshot } from './types.ts';

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
    const sandy = driveMatrix({ id: 'sandy', ...BASES.sandy });
    expect(sandy.min.alta).toBe(27);
    expect(Object.keys(sandy.exact)).toHaveLength(Object.keys(sandy.min).length); // a preset is exact everywhere
    const custom = { id: 'custom', lat: 40.64, lon: -111.5 };
    expect(nearestPreset(custom)).toBe('park-city-old-town');
    expect(driveMatrix(custom)).toMatchObject({ min: { 'deer-valley': 4 }, exact: {} });
  });

  it('uses /api/drive results for a custom base, the nearest preset row for resorts it lacks', () => {
    const custom = { id: 'custom', lat: 40.761, lon: -111.891 };
    const api = { alta: { min: 48, mi: 31.2 }, brighton: { min: 46, mi: 31, via: 'bcc-mouth' as const } };
    const m = driveMatrix(custom, api);
    expect(m.min).toMatchObject({ alta: 48, brighton: 46, snowbird: 43 }); // snowbird: downtown-slc row
    expect(m.exact).toEqual({ alta: { mi: 31.2 }, brighton: { mi: 31, via: 'BCC mouth' } });
    const all = Object.fromEntries(Object.keys(m.min).map((r) => [r, { min: 30, mi: 20 }]));
    expect(Object.keys(driveMatrix(custom, all).exact)).toHaveLength(Object.keys(m.min).length);
    expect(driveMatrix({ id: 'sandy', ...BASES.sandy }, api).min.alta).toBe(27); // presets ignore api results
  });
});

describe('custom points and route scans', () => {
  it('rounds to 3 dp, keys the cache and rejects points outside the Wasatch', () => {
    const p = wasatchPoint(40.76084, -111.89104);
    expect(p).toEqual({ lat: 40.761, lon: -111.891 });
    expect(p && driveKey(p)).toBe('40.761,-111.891');
    expect(wasatchPoint(40.29, -111.9)).toBeNull();
    expect(wasatchPoint(40.7, -111.1)).toBeNull();
    expect(wasatchPoint(Number.NaN, -111.9)).toBeNull();
  });

  it('flags a geometry vertex within the radius of a point', () => {
    const near = [-111.5549 + 0.008, 40.6067]; // ~0.68 km east of Guardsman
    const far = [-111.5549 + 0.015, 40.6067]; // ~1.27 km east
    expect(passesNear([[-111.8, 40.62], near], GUARDSMAN, GUARDSMAN.radiusKm)).toBe(true);
    expect(passesNear([[-111.8, 40.62], far], GUARDSMAN, GUARDSMAN.radiusKm)).toBe(false);
    expect(passesNear([], GUARDSMAN, 1)).toBe(false);
  });
});

describe('haversineKm and routeCorridors', () => {
  it('measures great-circle km', () => {
    expect(haversineKm(BASES['downtown-slc'], BASES['downtown-slc'])).toBe(0);
    expect(haversineKm(CH, BASES['park-city-old-town'])).toBeCloseTo(26.9, 0);
  });

  it('adds Parleys for a Wasatch Back base going to the Cottonwoods', () => {
    expect(routeCorridors(BASES['park-city-old-town'].lon, 'alta')).toEqual(['lcc', 'parleys']);
    expect(routeCorridors(CH.lon, 'alta')).toEqual(['lcc']);
    expect(routeCorridors(CH.lon, 'deer-valley')).toEqual(['parleys']);
  });
});
