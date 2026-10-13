import { describe, expect, it } from 'vitest';
import { liftHours, liftId } from './lifts.ts';

describe('liftId', () => {
  it('slugs display names and trims edge dashes', () => {
    expect(liftId('Aerial Tram')).toBe('aerial-tram');
    expect(liftId(' Gad 2 (Lower) ')).toBe('gad-2-lower');
    expect(liftId("Catherine's Pass")).toBe('catherine-s-pass');
  });
});

describe('liftHours', () => {
  it('reads the resort hour formats', () => {
    expect(liftHours('9 am - 3:45 pm')).toEqual({ opensAt: '09:00', closesAt: '15:45' });
    expect(liftHours('9:00 AM – 4:00 PM')).toEqual({ opensAt: '09:00', closesAt: '16:00' });
    expect(liftHours('8:30 a.m. to 4 p.m.')).toEqual({ opensAt: '08:30', closesAt: '16:00' });
  });

  it('returns nulls without a range', () => {
    expect(liftHours('TBD')).toEqual({ opensAt: null, closesAt: null });
    expect(liftHours(null)).toEqual({ opensAt: null, closesAt: null });
  });
});
