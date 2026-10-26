import { describe, expect, it } from 'vitest';
import type { OmLocation } from '../../data/open-meteo.ts';
import {
  band,
  freezingLevel,
  headline,
  hourLabel,
  hourlySummary,
  hourlyTable,
  hourlyWindow,
  omHourly,
} from './hourly-series.ts';

const hh = (h: number) => String(h).padStart(2, '0');
const hoursOf = (date: string, hours: number[]) => hours.map((h) => `${date}T${hh(h)}:00`);
const FULL = Array.from({ length: 24 }, (_, h) => h);

// A cache fetched yesterday: four full days from 2026-10-24; "now" is Sunday 2026-10-25 13:00.
const DAYS = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'];
const TIMES = DAYS.flatMap((d) => hoursOf(d, FULL));
const NOW = '2026-10-25T13:00';
const START = TIMES.indexOf(NOW); // 37
const HRRR_END = START + 20; // HRRR's horizon falls 20 h into the window
const fill = (f: (i: number) => number | null) => TIMES.map((_, i) => f(i));

const LOC = {
  hourly: {
    time: TIMES,
    snowfall_ncep_nbm_conus: fill((i) => (i === START + 7 ? 0.5 : 0.1)),
    snowfall_ncep_hrrr_conus: fill((i) => (i < HRRR_END ? 0.2 : null)),
    snowfall_ecmwf_ifs: fill(() => 0.05),
    snowfall_ncep_gfs_global: fill(() => 0.3),
    snow_depth_ncep_hrrr_conus: fill((i) => (i < HRRR_END ? 10 : null)),
    snow_depth_ecmwf_ifs: fill(() => 12),
    temperature_2m_ncep_nbm_conus: fill((i) => 20 + (i % 24 === 14 ? 10 : 0)),
    wind_speed_10m_ncep_nbm_conus: fill(() => 10),
    wind_gusts_10m_ncep_nbm_conus: fill((i) => (i === START + 3 ? 45 : 20)),
    freezing_level_height_ncep_hrrr_conus: fill((i) => (i < HRRR_END ? 7000 : null)),
    freezing_level_height_ncep_gfs_global: fill(() => 9500),
  },
  daily: { time: DAYS },
} as unknown as OmLocation;

const win = hourlyWindow(LOC, NOW);
const IDX = win?.idx ?? [];

describe('hourlyWindow', () => {
  it('finds the current hour by its string even when the cache starts yesterday', () => {
    expect(win?.idx[0]).toBe(37);
    expect(win?.idx).toHaveLength(48);
    expect(win?.time[0]).toBe(NOW);
    expect(win?.nowIndex).toBe(0);
    expect(hourlyWindow(LOC, '2026-10-28T13:00')).toBeNull(); // past the cache
    expect(hourlyWindow(null, NOW)).toBeNull();
  });

  it('marks midnights and night spans by position', () => {
    expect(win?.midnights).toEqual([11, 35]);
    expect(win?.night).toEqual([
      [5, 17],
      [29, 41],
    ]);
    expect(hourlyWindow(LOC, '2026-10-27T20:00')?.idx).toHaveLength(4); // the cache ends
  });

  it('walks a 25-hour fall-back day by index, never by hour arithmetic', () => {
    const dst = [
      ...hoursOf('2026-10-31', FULL),
      ...hoursOf('2026-11-01', [0, 1, ...FULL.slice(1)]),
      ...hoursOf('2026-11-02', FULL),
    ];
    const w = hourlyWindow({ hourly: { time: dst }, daily: { time: [] } } as unknown as OmLocation, '2026-10-31T20:00');
    expect(w?.time[5]).toBe('2026-11-01T01:00');
    expect(w?.time[6]).toBe('2026-11-01T01:00');
    expect(w?.midnights).toEqual([4, 29]);
    expect(w?.night).toEqual([
      [0, 11],
      [23, 35],
      [47, 48],
    ]);
  });
});

describe('headline and band', () => {
  it('draws NBM when it covers the window', () => {
    const h = headline(LOC, 'snowfall', IDX);
    expect(h?.model).toBe('ncep_nbm_conus');
    expect(h?.values[7]).toBe(0.5);
    expect(omHourly(LOC, 'snowfall', 'ncep_hrrr_conus', IDX)[20]).toBeNull();
  });

  it('falls back to the first of HRRR, ECMWF, GFS with 90 % of the window when NBM has none', () => {
    expect(headline(LOC, 'snow_depth', IDX)?.model).toBe('ecmwf_ifs'); // HRRR stops 20 h in
    expect(headline(LOC, 'freezing_level_height', IDX)?.model).toBe('ncep_gfs_global');
    expect(headline(LOC, 'precipitation', IDX)).toBeNull();
    expect(headline(LOC, 'snow_depth', IDX.slice(0, 18))?.model).toBe('ncep_hrrr_conus');
  });

  it('spans the models that have a value per hour: n drops from 4 to 3 past HRRR', () => {
    const b = band(LOC, 'snowfall', IDX);
    expect(b?.[0]).toEqual({ min: 0.05, max: 0.3, n: 4 });
    expect(b?.[7]).toEqual({ min: 0.05, max: 0.5, n: 4 });
    expect(b?.[20]).toEqual({ min: 0.05, max: 0.3, n: 3 });
    expect(band(LOC, 'precipitation', IDX)).toBeNull();
    expect(band(LOC, 'snow_depth', [TIMES.length - 1])?.[0]).toEqual({ min: 12, max: 12, n: 1 });
  });
});

describe('freezingLevel', () => {
  it('uses HRRR until its horizon, then GFS, and marks the seam', () => {
    const f = freezingLevel(LOC, IDX);
    expect(f.seam).toBe(20);
    expect([f.values[19], f.values[20], f.values[47]]).toEqual([7000, 9500, 9500]);
  });

  it('has no seam when HRRR covers the window or nothing has data', () => {
    expect(freezingLevel(LOC, IDX.slice(0, 10))).toEqual({ values: Array(10).fill(7000), seam: null });
    const bare = { hourly: { time: TIMES }, daily: { time: [] } } as unknown as OmLocation;
    expect(freezingLevel(bare, IDX.slice(0, 3))).toEqual({ values: [null, null, null], seam: null });
    expect(freezingLevel(LOC, [])).toEqual({ values: [], seam: null });
  });
});

describe('hourlySummary and hourlyTable', () => {
  it('writes one sentence in the chosen units', () => {
    expect(hourLabel('2026-10-25T00:00')).toBe('12 AM');
    expect(hourLabel('2026-10-25T15:00')).toBe('3 PM');
    expect(hourlySummary(LOC, IDX, 'alta', 'imperial')).toBe(
      'Alta, next 48 hours: 5.2″ of snow, heaviest around 8 PM Sun; temperatures 20–30°F; gusts to 45 mph; ' +
        'freezing level 7,000–9,500 ft, between the base (8,530 ft) and the summit (10,556 ft).',
    );
    const metric = hourlySummary(LOC, IDX, 'snowbasin', 'metric');
    expect(metric).toContain('13 cm of snow');
    expect(metric).toContain('gusts to 72 km/h');
    expect(metric).toContain('freezing level 2,130–2,900 m, above the summit (2,850 m) at times');
    expect(hourlySummary(null, [], 'alta', 'imperial')).toBe('Alta: no hourly model data for the next 0 hours.');
  });

  it('tabulates every third hour, summing snow over the step', () => {
    const rows = hourlyTable(LOC, IDX);
    expect(rows).toHaveLength(16);
    expect(rows[0]).toMatchObject({ time: NOW, tempF: 20, windMph: 10, gustMph: 20, freezingFt: 7000 });
    expect(rows[0]?.snowIn).toBeCloseTo(0.3);
    expect(rows[2]?.snowIn).toBeCloseTo(0.7); // 0.1 + 0.5 + 0.1
    expect(rows[7]).toMatchObject({ time: '2026-10-26T10:00', freezingFt: 9500 });
    expect(hourlyTable(LOC, IDX, 24).map((r) => r.time)).toEqual([NOW, '2026-10-26T13:00']);
    expect(hourlyTable(null, [])).toEqual([]);
  });
});
