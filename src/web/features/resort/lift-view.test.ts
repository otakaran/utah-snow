import { describe, expect, it } from 'vitest';
import type { Gate, LiftStatus } from '../../../shared/types.ts';
import { asOf, liftWord, newestUpdate, sharedState, updatedToday } from './lift-view.ts';

const lift = (updatedAt: string | null): LiftStatus => ({ id: 'x', name: 'X', state: 'closed', raw: '', updatedAt });
const gate = (state: Gate['state']): Gate => ({ name: 'G', state });

describe('liftWord', () => {
  it('shows Closed red only while lifts run, grey otherwise; other states keep their plate', () => {
    expect(liftWord('closed', true)).toEqual({ tone: 'bad', word: 'Closed' });
    expect(liftWord('closed', false)).toEqual({ tone: 'off', word: 'Closed' });
    expect(liftWord('open', false)).toEqual({ tone: 'ok', word: 'Open' });
  });
});

describe('gate and age helpers', () => {
  it('finds the one shared gate state', () => {
    expect(sharedState([gate('closed'), gate('closed')])).toBe('closed');
    expect(sharedState([gate('closed'), gate('open')])).toBeNull();
    expect(sharedState([])).toBeNull();
  });

  it('dates the list by its newest update, as a clock today and a date before', () => {
    const newest = newestUpdate([lift('2026-04-26T16:34:00-06:00'), lift('2026-04-27T10:28:00-06:00'), lift(null)]);
    expect(newest).toBe('2026-04-27T10:28:00-06:00');
    expect(asOf(newest, '2026-10-13')).toBe('as of Apr 27');
    expect(asOf(newest, '2026-04-27')).toBe('as of 10:28 AM');
    expect(asOf(newest, '2026-10-13', 'preseason')).toBe("last season's hours");
    expect(asOf('2026-11-05T10:00:00-07:00', '2026-11-06', 'preseason')).toBe('as of Nov 5');
    expect(updatedToday(newest, '2026-10-13')).toBe(false);
    expect(updatedToday(null, '2026-10-13')).toBe(true);
  });
});
