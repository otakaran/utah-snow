import { describe, expect, it } from 'vitest';
import {
  cmToIn,
  convert,
  cToF,
  fmt,
  fToC,
  ftToM,
  inToCm,
  inToMm,
  kmhToMph,
  mmToIn,
  mphToKmh,
  mToFt,
  unitOf,
} from './units.ts';

describe('conversions', () => {
  it('round-trips every pair', () => {
    for (const v of [-40, 0, 3.5, 32, 9662]) {
      expect(cmToIn(inToCm(v))).toBeCloseTo(v, 9);
      expect(mmToIn(inToMm(v))).toBeCloseTo(v, 9);
      expect(cToF(fToC(v))).toBeCloseTo(v, 9);
      expect(kmhToMph(mphToKmh(v))).toBeCloseTo(v, 9);
      expect(mToFt(ftToM(v))).toBeCloseTo(v, 9);
    }
  });

  it('matches known anchors', () => {
    expect(fToC(32)).toBe(0);
    expect(fToC(-40)).toBe(-40);
    expect(mToFt(3048)).toBeCloseTo(10000, 6);
    expect(convert('snow', 10, 'metric')).toBeCloseTo(25.4, 9);
    expect(unitOf('wind', 'metric')).toBe('km/h');
  });
});

describe('display rounding (§8.8)', () => {
  const t = (...a: Parameters<typeof fmt>) => fmt(...a).text;

  it('snow: 1 dp below 10 in, else 0 dp; cm 0 dp', () => {
    expect(t('snow', 3.46, 'imperial')).toBe('3.5″');
    expect(t('snow', 0, 'imperial')).toBe('0.0″');
    expect(t('snow', 9.96, 'imperial')).toBe('10″');
    expect(t('snow', 12.4, 'imperial')).toBe('12″');
    expect(t('snow', 3.5, 'metric')).toBe('9 cm');
  });

  it('temperature, wind and distance: 0 dp, no negative zero', () => {
    expect(t('temp', 27.6, 'imperial')).toBe('28°F');
    expect(t('temp', 0, 'metric')).toBe('-18°C');
    expect(t('temp', 31.5, 'metric')).toBe('0°C');
    expect(t('wind', 25, 'metric')).toBe('40 km/h');
    expect(t('distance', 12.4, 'imperial')).toBe('12 mi');
  });

  it('elevation and snow level use their steps', () => {
    expect(t('elevation', 9662, 'imperial')).toBe('9,662 ft');
    expect(t('elevation', 9662, 'metric')).toBe('2,940 m');
    expect(t('snowLevel', 7349, 'imperial')).toBe('7,300 ft');
    expect(t('snowLevel', 7349, 'metric')).toBe('2,240 m');
  });

  it('precipitation: in 2 dp, mm 0 dp', () => {
    expect(t('precip', 0.123, 'imperial')).toBe('0.12 in');
    expect(t('precip', 1.005, 'imperial')).toBe('1.01 in');
    expect(t('precip', 0.123, 'metric')).toBe('3 mm');
  });

  it('splits value and unit, and shows a dash for missing values', () => {
    expect(fmt('wind', 15, 'imperial')).toEqual({ value: '15', unit: 'mph', text: '15 mph' });
    expect(fmt('snow', null, 'metric').text).toBe('—');
  });
});
