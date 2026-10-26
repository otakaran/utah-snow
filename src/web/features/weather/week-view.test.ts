import { describe, expect, it } from 'vitest';
import type { Block, NwsDay, PointForecast } from '../../../shared/types.ts';
import { weekDates, weekRows } from '../conditions/index.ts';
import { weekView } from './week-view.ts';

const TODAY = '2027-01-05'; // Tue
const DATES = weekDates(TODAY, 7);

const day = (date: string, snowIn: number, night = 0): NwsDay =>
  ({ date, snowIn, snowDayIn: snowIn - night, snowNightIn: night }) as NwsDay;
const grid = (days: NwsDay[]) => ({ data: { days } }) as unknown as Block<PointForecast>;

const FORECAST = {
  'alta:base': grid([day('2027-01-06', 2)]),
  'alta:summit': grid([day('2027-01-05', 1), day('2027-01-06', 9, 6), day('2027-01-07', 2)]),
  'snowbird:summit': grid([day('2027-01-06', 7, 4)]),
  'brighton:summit': { data: {} } as unknown as Block<PointForecast>, // the e2e seed's '{}'
};

describe('weekView', () => {
  const view = weekView(weekRows(FORECAST, DATES, 'imperial'), FORECAST, TODAY, 'snowbird');

  it('labels the axis from today, thins every other day in phase with the storm day', () => {
    expect(view.storm).toBe(1); // Wed, Alta's 9″
    expect(view.labels.map((l) => [l.text, l.storm, l.thin])).toEqual([
      ['Today', false, true],
      ['Wed', true, false],
      ['Thu', false, true],
      ['Fri', false, false],
      ['Sat', false, true],
      ['Sun', false, false],
      ['Mon', false, true],
    ]);
  });

  it('gives each lane its summit days, day/night halves, total and flags on one scale', () => {
    const [alta, bird, brighton] = view.lanes;
    expect(alta).toMatchObject({ id: 'alta', lead: true, pick: false, total: '2–12″', peak: 'tomorrow night' });
    expect(alta?.summit.slice(0, 3)).toEqual([1, 9, 2]);
    expect(alta?.day.slice(0, 3)).toEqual([1, 3, 2]);
    expect(alta?.night.slice(0, 3)).toEqual([0, 6, 0]);
    expect(bird).toMatchObject({ pick: true, lead: false, total: '7″' });
    expect(brighton).toMatchObject({ total: '—', peak: null });
    expect(brighton?.summit.every((v) => v === null)).toBe(true);
    expect([view.max, view.pairMax]).toEqual([10, 6]);
    expect(view.known).toBe(true);
  });

  it('has no storm, a 6″ floor and known = false for placeholder-only rows', () => {
    const empty = weekView(weekRows({}, DATES, 'imperial'), {}, TODAY, null);
    expect(empty.storm).toBeNull();
    expect(empty.labels.map((l) => l.thin)).toEqual([false, true, false, true, false, true, false]);
    expect([empty.max, empty.pairMax]).toEqual([6, 6]);
    expect(empty.known).toBe(false);
  });
});
