import { describe, expect, it } from 'vitest';
import { RESORTS } from '../../config/resorts.ts';
import { dayWindow, liftHours, liftId, liftsRunning } from './lifts.ts';
import { zonedToUtc } from './time.ts';

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

describe('liftsRunning (closed is red only in season, during C.8 lift hours)', () => {
  const at = (hm: string) => zonedToUtc(`2026-12-28 ${hm}`) ?? Number.NaN;

  it('spans the earliest opening to the latest closing', () => {
    expect(dayWindow(RESORTS.snowbird.liftHours)).toEqual({ open: '09:00', close: '17:00' });
    expect(dayWindow(RESORTS.solitude.liftHours)).toEqual({ open: '08:00', close: '16:00' });
  });

  it('is off pre-season and without a report, even at 10:00', () => {
    expect(liftsRunning('alta', 'preseason', at('10:00'))).toBe(false);
    expect(liftsRunning('alta', 'unknown', at('10:00'))).toBe(false);
    expect(liftsRunning('alta', undefined, at('10:00'))).toBe(false);
  });

  it('is on in season inside lift hours and off outside them', () => {
    expect(liftsRunning('alta', 'open', at('10:00'))).toBe(true);
    expect(liftsRunning('alta', 'closed-for-day', at('10:00'))).toBe(true);
    expect(liftsRunning('alta', 'open', at('20:00'))).toBe(false);
    expect(liftsRunning('alta', 'open', at('08:30'))).toBe(false);
  });
});
