import { describe, expect, it } from 'vitest';
import type { Block, NwsDay, PointForecast } from '../../../shared/types.ts';
import type { OmLocation } from '../../data/open-meteo.ts';
import { barFractions, stormDay, weekDates, weekLeader, weekRows } from './week-rows.ts';

const DATES = weekDates('2027-01-04', 3); // Mon, Tue, Wed

const day = (date: string, snowIn: number, night = 0): NwsDay =>
  ({ date, snowIn, snowDayIn: snowIn - night, snowNightIn: night }) as NwsDay;
const grid = (days: NwsDay[]) => ({ data: { days } }) as unknown as Block<PointForecast>;
const placeholder = { data: {} } as unknown as Block<PointForecast>; // the e2e seed stores '{}'

const FORECAST = {
  'alta:base': grid([day('2027-01-04', 1), day('2027-01-05', 2)]),
  'alta:summit': grid([day('2027-01-04', 3), day('2027-01-05', 6, 4), day('2027-01-06', 1)]),
  'snowbird:summit': grid([day('2027-01-04', 6, 1), day('2027-01-05', 2)]),
  'brighton:base': placeholder,
  'brighton:summit': placeholder,
};

/** Open-Meteo locations in RESORT_IDS order; only Alta carries daily sums. */
const OM = [
  {
    daily: {
      time: DATES,
      snowfall_sum_ncep_nbm_conus: [2, 5, 1],
      snowfall_sum_ecmwf_ifs: [1, 3, 0.5],
      snowfall_sum_ncep_hrrr_conus: [2, null, null],
    },
  },
  ...Array.from({ length: 5 }, () => ({ daily: { time: [] } })),
] as unknown as OmLocation[];

describe('weekDates', () => {
  it('lists today and the following local dates, nothing without a date', () => {
    expect(DATES).toEqual(['2027-01-04', '2027-01-05', '2027-01-06']);
    expect(weekDates('2026-12-30', 4)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(weekDates('')).toEqual([]);
  });
});

describe('weekRows', () => {
  const rows = weekRows(FORECAST, DATES, 'imperial', OM);
  const alta = rows[0];
  const bird = rows[1];

  it('builds every resort in canonical order with per-day base and summit cells', () => {
    expect(rows.map((r) => r.id)).toEqual(['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley', 'snowbasin']);
    expect(alta?.days).toEqual([
      { date: '2027-01-04', baseIn: 1, summitIn: 3 },
      { date: '2027-01-05', baseIn: 2, summitIn: 6 },
      { date: '2027-01-06', baseIn: null, summitIn: 1 },
    ]);
    expect(bird?.days[0]).toEqual({ date: '2027-01-04', baseIn: null, summitIn: 6 });
  });

  it('totals the days that have values and prints the base–summit range and model spread', () => {
    expect(alta?.total).toEqual({ baseIn: 3, summitIn: 10, text: '3–10″' });
    expect(alta?.models).toBe('4.5–8″');
    expect(bird?.total).toEqual({ baseIn: null, summitIn: 8, text: '8″' });
    expect(bird?.models).toBe('—');
  });

  it('gives placeholder and missing rows nulls and dashes', () => {
    const brighton = rows[2];
    expect(brighton?.days.every((d) => d.baseIn === null && d.summitIn === null)).toBe(true);
    expect(brighton?.total).toEqual({ baseIn: null, summitIn: null, text: '—' });
    expect([brighton?.models, brighton?.peakDate, brighton?.peakHalf, brighton?.frac]).toEqual(['—', null, null, 0]);
    expect(weekRows(undefined, DATES, 'imperial')[5]?.total.text).toBe('—');
  });

  it('finds the peak day and its half, and scales bars to the biggest week with a 6″ floor', () => {
    expect([alta?.peakDate, alta?.peakHalf]).toEqual(['2027-01-05', 'night']);
    expect([bird?.peakDate, bird?.peakHalf]).toEqual(['2027-01-04', 'day']);
    expect(rows.map((r) => r.frac)).toEqual([1, 0.8, 0, 0, 0, 0]);
    const small = weekRows({ 'alta:summit': grid([day('2027-01-04', 1.5)]) }, DATES, 'imperial');
    expect(small[0]?.frac).toBe(0.25); // 1.5 of the 6″ floor
  });

  it('formats in metric', () => {
    const metric = weekRows(FORECAST, DATES, 'metric', OM);
    expect(metric[0]?.total.text).toBe('8–25 cm');
    expect(metric[0]?.models).toBe('11–20 cm');
  });
});

describe('weekLeader and stormDay', () => {
  const rows = weekRows(FORECAST, DATES, 'imperial', OM);

  it('names the biggest summit week with its peak', () => {
    expect(weekLeader(rows)).toEqual({
      id: 'alta',
      name: 'Alta',
      text: '3–10″',
      peakDate: '2027-01-05',
      peakHalf: 'night',
    });
    expect(weekLeader(weekRows(undefined, DATES, 'imperial'))).toBeNull();
    expect(weekLeader(weekRows({ 'alta:summit': grid([day('2027-01-04', 0)]) }, DATES, 'imperial'))).toBeNull();
  });

  it('picks the single biggest summit day, earliest date on a tie', () => {
    expect(stormDay(rows)).toEqual({ date: '2027-01-04', id: 'snowbird', summitIn: 6 });
    expect(stormDay(weekRows(undefined, DATES, 'imperial'))).toBeNull();
  });
});

describe('barFractions', () => {
  it('scales to the tallest value with a 6″ floor and a visible minimum', () => {
    expect(barFractions([12, 6, 0, null])).toEqual([1, 0.5, 0.08, 0]);
    expect(barFractions([3, 1.5])).toEqual([0.5, 0.25]);
    expect(barFractions([3, 1.5], 3)).toEqual([1, 0.5]);
  });
});
