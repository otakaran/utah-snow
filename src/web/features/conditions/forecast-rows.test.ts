import { describe, expect, it } from 'vitest';
import type { NwsDay, PointForecast } from '../../../shared/types.ts';
import type { OmSeries } from '../../data/open-meteo.ts';
import { afdBullets, forecastRow, modelSpread, range, snowLevelNote, tempNote, windText } from './forecast-rows.ts';

const DATES = { today: '2026-12-28', tomorrow: '2026-12-29' };

function day(over: Partial<NwsDay>): NwsDay {
  return {
    date: DATES.today,
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
  };
}

function point(today: number, tonight: number, tomorrow: number, d: Partial<NwsDay>): PointForecast {
  return {
    days: [day(d)],
    todayDaytimeSnowIn: today,
    tonightSnowIn: tonight,
    tomorrowDaytimeSnowIn: tomorrow,
  } as unknown as PointForecast;
}

describe('range', () => {
  it('formats min–max in the chosen units and collapses equal ends', () => {
    expect(range('snow', [2.9, 1.1], 'imperial')).toBe('1.1–2.9″');
    expect(range('snow', [1.1, 2.9], 'metric')).toBe('3–7 cm');
    expect(range('snow', [2, 2.04], 'imperial')).toBe('2″');
    expect(range('snow', [0, 10.4], 'imperial')).toBe('0–10″');
    expect(range('snow', [null, undefined], 'imperial')).toBe('—');
    expect(range('snow', [0.4, 1.6], 'metric', true)).toBe('1–4');
  });
});

describe('windText', () => {
  it('prints sustained wind and gust', () => {
    expect(windText(day({ windMaxMph: 13, gustMaxMph: 25 }), 'imperial')).toBe('13 G25');
    expect(windText(day({ windMaxMph: 10, gustMaxMph: null }), 'metric')).toBe('16');
    expect(windText(undefined, 'imperial')).toBe('—');
  });
});

describe('modelSpread', () => {
  const daily = {
    time: ['2026-12-28', '2026-12-29', '2026-12-30'],
    snowfall_sum_ncep_hrrr_conus: [4, 3, null],
    snowfall_sum_ecmwf_ifs: [1, 1.5, 0],
    snowfall_sum_ncep_gfs_global: [null, 2, 0],
  } as OmSeries;

  it('sums each model over the dates and drops models missing a day', () => {
    expect(modelSpread(daily, ['2026-12-28', '2026-12-29'])).toEqual({ min: 2.5, max: 7, n: 2 });
    expect(modelSpread(daily, ['2026-12-31'])).toBeNull();
    expect(modelSpread(null, ['2026-12-28'])).toBeNull();
  });
});

describe('forecastRow and notes', () => {
  const alta = forecastRow(
    'alta',
    point(1, 2, 0, { snowLevelMaxFt: 9000, windMaxMph: 10, gustMaxMph: 20, tMinF: 20, tMaxF: 28 }),
    point(3, 5, 1, {
      snowLevelMinFt: 7000,
      snowLevelMaxFt: 8000,
      windMaxMph: 25,
      gustMaxMph: 45,
      tMinF: 12,
      tMaxF: 22,
    }),
    DATES,
    'imperial',
  );
  const basin = forecastRow('snowbasin', null, point(0, 0, 0, { snowLevelMaxFt: 6000 }), DATES, 'imperial');

  it('builds base–summit ranges and summit wind', () => {
    expect([alta.today, alta.tonight, alta.tomorrow, alta.models, alta.wind]).toEqual([
      '1–3',
      '2–5',
      '0–1',
      '—',
      '25 G45',
    ]);
    expect(alta.level).toEqual({ minFt: 7000, maxFt: 9000, baseFt: 8530, summitFt: 10556 });
  });

  it('shows dashes for placeholder rows (the e2e seed stores {})', () => {
    const empty = {} as PointForecast;
    const row = forecastRow('brighton', empty, empty, DATES, 'imperial');
    expect([row.today, row.wind, snowLevelNote([row], 'imperial')]).toEqual(['—', '—', null]);
    expect(snowLevelNote([row, basin], 'imperial')).toBe('Snow level today 6,000 ft: below the base at Snowbasin.');
  });

  it('compares the snow level with the true base elevations', () => {
    expect(snowLevelNote([alta, basin], 'imperial')).toBe('Snow level today 6,000–9,000 ft: above the base at Alta.');
    expect(snowLevelNote([basin], 'metric')).toBe('Snow level today 1,830 m: below the base.');
    expect(tempNote([alta], 'imperial')).toBe('Summit today: high 22°F, low 12°F.');
  });
});

describe('afdBullets', () => {
  it('splits KEY MESSAGES on leading dashes and joins wrapped lines', () => {
    expect(afdBullets('- One low.\n- Two\n  continues.\n')).toEqual(['One low.', 'Two continues.']);
    expect(afdBullets(null)).toEqual([]);
  });
});
