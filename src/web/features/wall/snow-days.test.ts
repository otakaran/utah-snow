import { describe, expect, it } from 'vitest';
import type { Block, PointForecast } from '../../../shared/types.ts';
import { snowDays } from './snow-days.ts';

const DATES = ['2027-01-05', '2027-01-06', '2027-01-07'];
const grid = (snow: Record<string, number>) =>
  ({
    data: { days: Object.entries(snow).map(([date, snowIn]) => ({ date, snowIn })) },
  }) as unknown as Block<PointForecast>;

describe('snowDays', () => {
  it('gives every resort a base–summit range per date, a dash where NWS has no value', () => {
    const forecast = {
      'alta:base': grid({ '2027-01-05': 2.1, '2027-01-06': 0 }),
      'alta:summit': grid({ '2027-01-05': 5.04, '2027-01-06': 0 }),
      'snowbird:base': { data: {} } as unknown as Block<PointForecast>, // placeholder payload ('{}')
    };
    const rows = snowDays(forecast, DATES, 'imperial');
    expect(rows.map((r) => r.id)).toEqual(['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley', 'snowbasin']);
    expect(rows[0]?.cells).toEqual(['2.1–5', '0', '—']);
    expect(rows[1]?.cells).toEqual(['—', '—', '—']);
    expect(snowDays(forecast, DATES, 'metric')[0]?.cells[0]).toBe('5–13');
  });
});
