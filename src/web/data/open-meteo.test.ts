import { describe, expect, it } from 'vitest';
import { OM_URL, omFor, parseOm } from './open-meteo.ts';

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
