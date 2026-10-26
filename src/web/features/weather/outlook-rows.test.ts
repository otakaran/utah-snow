import { describe, expect, it } from 'vitest';
import type { NwsDay, PointForecast } from '../../../shared/types.ts';
import type { OmSeries } from '../../data/open-meteo.ts';
import { outlookDays } from './outlook-rows.ts';

const TODAY = '2027-01-05'; // a Tuesday

const day = (date: string, over: Partial<NwsDay> = {}): NwsDay => ({
  date,
  snowIn: 0,
  snowDayIn: 0,
  snowNightIn: 0,
  qpfIn: 0,
  snowLevelMinFt: null,
  snowLevelMaxFt: null,
  gustMaxMph: null,
  windMaxMph: null,
  tMinF: null,
  tMaxF: null,
  popMax: null,
  ...over,
});
const grid = (days: NwsDay[]) => ({ days }) as PointForecast;

const BASE = grid([
  day('2027-01-04', { snowIn: 9 }), // yesterday: dropped
  day('2027-01-05', { snowIn: 0.3, qpfIn: 0.2, snowLevelMinFt: 8000, snowLevelMaxFt: 9200, tMinF: 25, tMaxF: 34 }),
  day('2027-01-06', { snowIn: 5.2, qpfIn: 0.6, snowLevelMinFt: 5000, snowLevelMaxFt: 6000 }),
  day('2027-01-07', { snowIn: 2 }),
]);
const SUMMIT = grid([
  day('2027-01-05', { snowIn: 0.5, tMinF: 20, tMaxF: 31, windMaxMph: 12, gustMaxMph: 22 }),
  day('2027-01-06', { snowIn: 8, qpfIn: 0.7, snowLevelMinFt: 5200, snowLevelMaxFt: 6100 }),
  day('2027-01-07', { snowIn: 3 }),
  day('2027-01-08', { snowIn: 8 }), // ties the 6th: the earlier day stays the peak
]);
const OM: OmSeries = {
  time: ['2027-01-05', '2027-01-06'],
  snowfall_sum_ncep_nbm_conus: [0.3, 6],
  snowfall_sum_ecmwf_ifs: [0.6, 9.2],
};

describe('outlookDays', () => {
  const days = outlookDays('alta', BASE, SUMMIT, TODAY, 'imperial', OM) ?? [];

  it('lists the dates from today that a grid row covers, labelled', () => {
    expect(days.map((d) => [d.date, d.label, d.dayNum])).toEqual([
      ['2027-01-05', 'Today', '5'],
      ['2027-01-06', 'Wed', '6'],
      ['2027-01-07', 'Thu', '7'],
      ['2027-01-08', 'Fri', '8'],
    ]);
  });

  it('prints base–summit snow, summit temps and wind, and the model spread', () => {
    expect(days[0]).toMatchObject({
      snow: '0.3–0.5',
      unit: '″',
      long: true,
      temps: '20–31°F',
      wind: '12 G22 mph',
      models: '0.3–0.6',
    });
    expect(days[1]).toMatchObject({ snow: '5.2–8', long: false, temps: '—', wind: '—', models: '6–9.2' });
    expect(days[3]).toMatchObject({ snow: '8', models: '—' }); // base has no Fri; the models stop at Wed here
  });

  it('chips the snow level against the true base (8,530 ft) and marks the peak day', () => {
    expect(days[0]?.level).toEqual({ tone: 'warn', word: 'Mix' }); // 8,000–9,200 ft straddles the base
    expect(days[0]?.levelText).toBe('8,000–9,200 ft');
    expect(days[1]?.level).toEqual({ tone: 'ok', word: 'Snow' });
    expect(days[2]).toMatchObject({ level: null, levelText: 'Dry' });
    expect(days.map((d) => d.peak)).toEqual([false, true, false, false]);
  });

  it('follows the units toggle', () => {
    const metric = outlookDays('alta', BASE, SUMMIT, TODAY, 'metric', OM) ?? [];
    expect(metric[1]).toMatchObject({ snow: '13–20', unit: 'cm' });
    expect(metric[0]?.wind).toBe('19 G35 km/h');
  });

  it('is null for placeholder rows (the e2e seed stores {})', () => {
    const empty = {} as PointForecast;
    expect(outlookDays('alta', empty, undefined, TODAY, 'imperial')).toBeNull();
    expect(outlookDays('alta', null, null, TODAY, 'imperial')).toBeNull();
  });
});
