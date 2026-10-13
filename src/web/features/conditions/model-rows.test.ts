import { describe, expect, it } from 'vitest';
import type { OmLocation } from '../../data/open-meteo.ts';
import { dayTemps, modelRows } from './model-rows.ts';

const DAYS = ['2027-01-05', '2027-01-06', '2027-01-07'];
const hours = DAYS.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`));
/** Hourly temps that swing 20..30 °F every day; `upTo` hours known, then null (HRRR's horizon). */
const temps = (upTo = hours.length) => hours.map((_, i) => (i < upTo ? 20 + (i % 24 === 14 ? 10 : 0) : null));

const LOC = {
  daily: {
    time: DAYS,
    snowfall_sum_ncep_hrrr_conus: [1.24, 0.02, null],
    snowfall_sum_ncep_nbm_conus: [1, 3.5, 12.4],
    snowfall_sum_ecmwf_ifs: [0.8, 2, 4],
    // GFS has no snowfall_sum key at all
  },
  hourly: {
    time: hours,
    temperature_2m_ncep_hrrr_conus: temps(36), // today full, tomorrow only until noon
    temperature_2m_ncep_nbm_conus: temps(),
    temperature_2m_ecmwf_ifs: temps(),
    temperature_2m_ncep_gfs_global: temps(),
  },
} as unknown as OmLocation;

describe('modelRows', () => {
  it('builds today, tomorrow and a weekday row with a cell per model in HRRR, NBM, ECMWF, GFS order', () => {
    const rows = modelRows(LOC, '2027-01-05', 'imperial');
    expect(rows.map((r) => r.label)).toEqual(['Today', 'Tomorrow', 'Thu']);
    expect(rows[0]?.cells.map((c) => c.model)).toEqual([
      'ncep_hrrr_conus',
      'ncep_nbm_conus',
      'ecmwf_ifs',
      'ncep_gfs_global',
    ]);
    expect(rows.map((r) => r.cells.map((c) => c.snow))).toEqual([
      ['1.2″', '1.0″', '0.8″', '—'],
      ['0.0″', '3.5″', '2.0″', '—'],
      ['—', '12″', '4.0″', '—'],
    ]);
    expect(rows[1]?.cells[0]?.dry).toBe(true);
    expect(rows[2]?.cells[0]?.dry).toBe(false);
  });

  it('gives the high / low only for days a model fully covers, in display units', () => {
    const rows = modelRows(LOC, '2027-01-05', 'metric');
    expect(rows[0]?.cells[0]?.temps).toBe('-1° / -7°');
    expect(rows[1]?.cells[0]?.temps).toBe('—');
    expect(rows[1]?.cells[1]?.temps).toBe('-1° / -7°');
    expect(rows[2]?.cells[1]?.snow).toBe('31 cm');
  });

  it('prints dashes for a missing location or a stale cache, and nothing without a date', () => {
    expect(modelRows(null, '2027-01-05', 'imperial')[0]?.cells.every((c) => c.snow === '—' && c.temps === '—')).toBe(
      true,
    );
    expect(modelRows(LOC, '2027-01-09', 'imperial')[0]?.cells.map((c) => c.snow)).toEqual(['—', '—', '—', '—']);
    expect(modelRows(LOC, '', 'imperial')).toEqual([]);
  });
});

describe('dayTemps', () => {
  it('needs every hour of the local date', () => {
    expect(dayTemps(LOC.hourly, 'ncep_nbm_conus', '2027-01-06')).toEqual({ hi: 30, lo: 20 });
    expect(dayTemps(LOC.hourly, 'ncep_hrrr_conus', '2027-01-06')).toBeNull();
    expect(
      dayTemps({ time: hours.slice(0, 5), temperature_2m_ecmwf_ifs: [1, 2, 3, 4, 5] }, 'ecmwf_ifs', DAYS[0] ?? ''),
    ).toBeNull();
  });
});
