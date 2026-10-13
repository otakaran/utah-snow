import { describe, expect, it } from 'vitest';
import { baseInfo, checkCustomBase, crewIdsFor, units } from './settings.ts';

describe('settings', () => {
  it('falls back to defaults when storage is unavailable', () => {
    expect(units.value).toBe('imperial');
    expect(baseInfo.value).toMatchObject({ id: 'cottonwood-heights', label: 'Cottonwood Heights' });
    expect(crewIdsFor('2027-01-05')).toBeNull();
  });

  it('accepts a custom base only inside the Wasatch bounds, rounded to 3 dp', () => {
    expect(checkCustomBase(40.76084, -111.89104, ' Hotel ')).toEqual({ lat: 40.761, lon: -111.891, label: 'Hotel' });
    expect(checkCustomBase(40.29, -111.9, 'South')).toBeNull();
    expect(checkCustomBase(40.7, -112.21, 'West')).toBeNull();
    expect(checkCustomBase(41.4, -111.2, 'Corner')).not.toBeNull();
    expect(checkCustomBase(40.7, -111.9, '')).toBeNull();
    expect(checkCustomBase(40.7, -111.9, 'x'.repeat(31))).toBeNull();
  });
});
