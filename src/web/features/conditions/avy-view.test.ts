import { describe, expect, it } from 'vitest';
import type { AvalancheZone } from '../../../shared/types.ts';
import { orderZones, zoneResorts, zoneView } from './avy-view.ts';

describe('avy-view', () => {
  it('titles a rated zone and keys its NAC token', () => {
    expect(zoneView({ level: 3, offSeason: false })).toEqual({
      level: 3,
      title: '3 · Considerable',
      key: 'considerable',
    });
  });

  it('shows no rating off-season (level -1)', () => {
    expect(zoneView({ level: -1, offSeason: true })).toEqual({
      level: null,
      title: 'No rating (off-season)',
      key: 'none',
    });
    expect(zoneView({ level: -1, offSeason: false }).title).toBe('No rating');
  });

  it('puts Salt Lake before Ogden and names each zone’s resorts in full', () => {
    const zones = [{ zoneId: 1737 }, { zoneId: 1738 }] as AvalancheZone[];
    expect(orderZones(zones).map((z) => z.zoneId)).toEqual([1738, 1737]);
    expect(orderZones(zones, [1737]).map((z) => z.zoneId)).toEqual([1737]);
    expect(zoneResorts(1738)).toBe('Alta, Snowbird, Brighton, Solitude, Deer Valley');
    expect(zoneResorts(1737)).toBe('Snowbasin');
  });
});
