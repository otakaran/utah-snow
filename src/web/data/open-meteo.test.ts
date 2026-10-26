import { describe, expect, it } from 'vitest';
import { OM_URL, type OmData, type OmLocation, omFor, omMeta, omSeries, parseOm } from './open-meteo.ts';

// Spec C.5, verbatim: the config-built URL must not drift from it.
const C5 =
  'https://api.open-meteo.com/v1/forecast?latitude=40.5672,40.5611,40.5926,40.5989,40.6124,41.2048&longitude=-111.6284,-111.6452,-111.5616,-111.6064,-111.5275,-111.8843&elevation=3217,3342,3185,3051,2911,2855&hourly=snowfall,snow_depth,temperature_2m,freezing_level_height,wind_speed_10m,wind_gusts_10m,precipitation&daily=snowfall_sum&models=ncep_hrrr_conus,ncep_nbm_conus,ecmwf_ifs,ncep_gfs_global&timezone=America%2FDenver&forecast_days=7&precipitation_unit=inch&temperature_unit=fahrenheit&wind_speed_unit=mph&cell_selection=nearest';

describe('open-meteo', () => {
  it('requests the C.5 URL', () => {
    expect(OM_URL).toBe(C5);
  });

  it('accepts only six locations with daily and hourly blocks, indexed in RESORT_IDS order', () => {
    const loc = (i: number) => ({ elevation: i, daily: { time: [] }, hourly: { time: [] } });
    const data = parseOm([0, 1, 2, 3, 4, 5].map(loc));
    expect(omFor(data, 'brighton')?.elevation).toBe(2);
    expect(omFor(data, 'snowbasin')?.elevation).toBe(5);
    expect(() => parseOm([loc(0)])).toThrow();
    expect(() => parseOm({ error: true, reason: 'x' })).toThrow();
    expect(omFor(null, 'alta')).toBeNull();
  });
});

describe('omSeries', () => {
  const loc = {
    hourly: {
      time: ['2026-12-28T00:00', '2026-12-28T01:00'],
      snowfall_ncep_nbm_conus: [0.2, null],
      freezing_level_height_ncep_nbm_conus: [null, null], // a field NBM does not carry
      temperature_2m_ecmwf_ifs: 'bogus',
    },
    daily: { time: ['2026-12-28'], snowfall_sum_ncep_gfs_global: [3.1] },
  } as unknown as OmLocation;

  it('reads the typed {field}_{model} key from the hourly or daily block', () => {
    expect(omSeries(loc, 'hourly', 'snowfall', 'ncep_nbm_conus')).toEqual([0.2, null]);
    expect(omSeries(loc, 'daily', 'snowfall_sum', 'ncep_gfs_global')).toEqual([3.1]);
  });

  it('is null for a missing key, a non-array, an all-null series or no location', () => {
    expect(omSeries(loc, 'hourly', 'snowfall', 'ncep_hrrr_conus')).toBeNull();
    expect(omSeries(loc, 'hourly', 'temperature_2m', 'ecmwf_ifs')).toBeNull();
    expect(omSeries(loc, 'hourly', 'freezing_level_height', 'ncep_nbm_conus')).toBeNull();
    expect(omSeries(null, 'hourly', 'snowfall', 'ncep_nbm_conus')).toBeNull();
  });
});

describe('omMeta', () => {
  const at = Date.UTC(2026, 11, 28, 13, 0, 0);
  const now = at + 7 * 60_000;
  const om = { at, data: [] } as OmData;

  it('synthesizes an ok browser row stamped at the fetch for ok, loading and idle', () => {
    expect(omMeta(om, 'ok', now)).toEqual({
      source: 'open-meteo',
      fetchedAt: '2026-12-28T13:00:00.000Z',
      okAt: '2026-12-28T13:00:00.000Z',
      asOf: null,
      status: 'ok',
      failCount: 0,
      staleAfterMin: 60,
      via: 'browser',
    });
    expect(omMeta(om, 'loading', now)?.status).toBe('ok');
    expect(omMeta(om, 'idle', now)).toMatchObject({ status: 'ok', failCount: 0 });
  });

  it('marks one failed attempt (now) on error or rate limit and is null without data', () => {
    expect(omMeta(om, 'error', now)).toMatchObject({
      status: 'error',
      failCount: 1,
      fetchedAt: '2026-12-28T13:07:00.000Z',
      okAt: '2026-12-28T13:00:00.000Z',
    });
    expect(omMeta(om, 'rate-limited', now)?.status).toBe('error');
    expect(omMeta(null, 'ok', now)).toBeNull();
  });
});
