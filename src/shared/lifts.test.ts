import { describe, expect, it } from 'vitest';
import { RESORTS } from '../../config/resorts.ts';
import { dayWindow, liftHours, liftId, liftsRunning } from './lifts.ts';
import { HOUR, zonedToUtc } from './time.ts';

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

describe('dayWindow', () => {
  const day = [
    { lifts: ['a'], open: '09:00', close: '16:00' },
    { lifts: ['b'], open: '08:45', close: '15:30' },
  ];

  it('spans the earliest opening to the latest closing, the early-season window included', () => {
    expect(dayWindow({ day, source: 'test' })).toEqual({ open: '08:45', close: '16:00' });
    const early = { lifts: 'all', open: '09:30', close: '16:30' } as const;
    expect(dayWindow({ day, early, source: 'test' })).toEqual({ open: '08:45', close: '16:30' });
  });
});

describe('liftsRunning (closed is red only in season, during C.8 lift hours)', () => {
  const { open, close } = dayWindow(RESORTS.alta.liftHours);
  const at = (hm: string, offset: number) => (zonedToUtc(`2026-12-28 ${hm}`) ?? Number.NaN) + offset;

  it('is off pre-season and without a report, even inside lift hours', () => {
    expect(liftsRunning('alta', 'preseason', at(open, HOUR))).toBe(false);
    expect(liftsRunning('alta', 'unknown', at(open, HOUR))).toBe(false);
    expect(liftsRunning('alta', undefined, at(open, HOUR))).toBe(false);
  });

  it('is on in season inside lift hours and off outside them', () => {
    expect(liftsRunning('alta', 'open', at(open, HOUR))).toBe(true);
    expect(liftsRunning('alta', 'closed-for-day', at(open, HOUR))).toBe(true);
    expect(liftsRunning('alta', 'open', at(close, HOUR))).toBe(false);
    expect(liftsRunning('alta', 'open', at(open, -HOUR / 2))).toBe(false);
  });
});
