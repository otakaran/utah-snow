import { describe, expect, it } from 'vitest';
import type { OmLocation } from '../../data/open-meteo.ts';
import { hourlyTable, hourlyWindow } from '../conditions/index.ts';
import { hourlyTicks, hourlyView, tableRows } from './hourly-view.ts';

const hh = (h: number) => String(h).padStart(2, '0');
const DAYS = ['2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'];
const TIMES = DAYS.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${hh(h)}:00`));
const NOW = '2027-01-05T13:00'; // Tue 1 PM
const START = TIMES.indexOf(NOW);
const HRRR_END = START + 30; // HRRR stops 30 h into the window
const fill = (f: (i: number) => number | null) => TIMES.map((_, i) => f(i));

const LOC = {
  hourly: {
    time: TIMES,
    snowfall_ncep_nbm_conus: fill((i) => (i === START + 10 ? 1.2 : 0.1)),
    snowfall_ncep_hrrr_conus: fill((i) => (i < HRRR_END ? 0.3 : null)),
    snowfall_ecmwf_ifs: fill(() => 0),
    temperature_2m_ncep_nbm_conus: fill((i) => 20 + (i % 24 === 15 ? 8 : 0)),
    wind_speed_10m_ncep_nbm_conus: fill(() => 12),
    wind_gusts_10m_ncep_nbm_conus: fill((i) => (i === START + 2 ? 48 : 25)),
    freezing_level_height_ncep_hrrr_conus: fill((i) => (i < HRRR_END ? 7000 : null)),
    freezing_level_height_ncep_gfs_global: fill(() => 9800),
  },
  daily: { time: DAYS },
} as unknown as OmLocation;

const WIN = hourlyWindow(LOC, NOW);
if (!WIN) throw new Error('fixture window');
const view = hourlyView(LOC, WIN, 'alta', 'imperial');

describe('hourlyTicks', () => {
  it('marks 00/06/12/18 with the weekday at midnight, the left edge anchored inward, the right edge dropped', () => {
    const ticks = hourlyTicks(WIN.time);
    expect(ticks.map((t) => t.text)).toEqual(['6 PM', 'Wed', '6 AM', 'Noon', '6 PM', 'Thu', '6 AM']); // Thu noon: 99 %
    expect(ticks[0]).toMatchObject({ pct: 11.5, anchor: 'middle', day: false });
    expect(ticks[1]?.day).toBe(true);
    expect(hourlyTicks(TIMES.slice(0, 30))[0]).toMatchObject({ text: 'Tue', anchor: 'start' });
  });
});

describe('hourlyView', () => {
  it('draws the NBM snow with a band only where two or more models report', () => {
    expect(view.n).toBe(48);
    expect(view.snow?.model).toBe('ncep_nbm_conus');
    expect(view.snow?.values[10]).toBe(1.2);
    expect(view.snow?.lo[0]).toBe(0); // NBM, HRRR and ECMWF
    expect(view.snow?.hi[0]).toBe(0.3);
    expect(view.snow?.max).toBe(1.5);
    expect(view.snow?.text).toBe('Snow per hour · 5.9″ in 48 h');
  });

  it('puts the freezing level on its own scale with the base and summit rules and the seam', () => {
    expect(view.frz?.seam).toBe(30);
    expect(view.frz?.text).toBe('freezing level 7,000–9,800 ft');
    expect(view.frz?.min).toBe(6400);
    expect(view.frz?.max).toBe(11156);
    expect(view.frz?.summitY).toBe(12.6);
    expect(view.frz?.baseY).toBe(55.2);
    expect(view.frz).toMatchObject({ base: 'Base 8,530 ft', summit: 'Summit 10,556 ft' });
  });

  it('gives temperature and wind their ranges and texts', () => {
    expect(view.temp).toMatchObject({ min: 17, max: 31, text: 'Temperature 20–28°F' });
    expect(view.wind).toMatchObject({ max: 50, text: 'Wind 12 mph · gusts to 48 mph' });
    expect(view.midnights).toEqual([11, 35]);
    expect(view.now).toBe(0);
  });

  it('copes with a location that has no series', () => {
    const bare = { hourly: { time: TIMES }, daily: { time: [] } } as unknown as OmLocation;
    const v = hourlyView(bare, WIN, 'alta', 'metric');
    expect([v.snow, v.temp, v.frz, v.wind]).toEqual([null, null, null, null]);
  });
});

describe('tableRows', () => {
  it('formats every third hour in the chosen units', () => {
    const rows = tableRows(hourlyTable(LOC, WIN.idx, 3), 'imperial');
    expect(rows).toHaveLength(16);
    expect(rows[0]).toEqual({ time: 'Tue 1 PM', snow: '0.3', temp: '20°F', wind: '12 G25', frz: '7,000 ft' });
    expect(tableRows(hourlyTable(LOC, WIN.idx, 3), 'metric')[0]).toMatchObject({ snow: '1', wind: '19 G40' });
  });
});
