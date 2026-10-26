import { describe, expect, it } from 'vitest';
import type { Block, NwsDay, PointForecast } from '../../../shared/types.ts';
import type { OmLocation } from '../../data/open-meteo.ts';
import { weekDates, weekRows } from '../conditions/index.ts';
import {
  dayInitial,
  dayWash,
  hourlyNote,
  hourlyScale,
  hourStart,
  hourTicks,
  nwsBuckets,
  nwsHalves,
  pickHourly,
  stormHeadline,
} from './weather-view.ts';

const DATES = weekDates('2027-01-05'); // Tuesday
type Day = Partial<NwsDay> & { date: string };
const block = (days: Day[]) => ({ data: { days } }) as unknown as Block<PointForecast>;
const PLACEHOLDER = { data: {} } as unknown as Block<PointForecast>; // the e2e seed's '{}'
const FORECAST = {
  'alta:base': block([
    { date: '2027-01-05', snowIn: 1 },
    { date: '2027-01-07', snowIn: 8 },
  ]),
  'alta:summit': block([
    { date: '2027-01-05', snowIn: 3, snowDayIn: 2, snowNightIn: 1 },
    { date: '2027-01-06', snowIn: 0, snowDayIn: 0, snowNightIn: 0.5 },
    { date: '2027-01-07', snowIn: 14 },
  ]),
  'snowbird:base': PLACEHOLDER,
  'snowbird:summit': block([
    { date: '2027-01-07', snowIn: 14 },
    { date: '2027-01-08', snowIn: 2 },
  ]),
};
const ROWS = weekRows(FORECAST, DATES, 'imperial');

describe('stormHeadline', () => {
  it("names the week's biggest summit day with that resort's base–summit range (ties: canonical order)", () => {
    expect(stormHeadline(ROWS, 'imperial')).toEqual({ date: '2027-01-07', id: 'alta', text: 'Thu 8–14″ · Alta' });
    expect(stormHeadline(weekRows(FORECAST, DATES, 'metric'), 'metric')?.text).toBe('Thu 20–36 cm · Alta');
  });
  it('is null on a dry week and on placeholder payloads (the page then says DRY WEEK)', () => {
    expect(
      stormHeadline(
        weekRows({ 'alta:summit': block([{ date: '2027-01-05', snowIn: 0 }]) }, DATES, 'imperial'),
        'imperial',
      ),
    ).toBeNull();
    expect(stormHeadline(weekRows({ 'alta:base': PLACEHOLDER }, DATES, 'imperial'), 'imperial')).toBeNull();
  });
});

describe('dayWash and dayInitial', () => {
  it('washes each cell by summit snow against the biggest day, with a 6″ floor', () => {
    const wash = dayWash(ROWS);
    expect(wash[0]?.slice(0, 3)).toEqual([3 / 14, 0, 1]);
    expect(wash[2]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(
      dayWash(weekRows({ 'alta:summit': block([{ date: '2027-01-05', snowIn: 3 }]) }, DATES, 'imperial'))[0]?.[0],
    ).toBe(0.5);
  });
  it('gives one initial per local date', () => {
    expect(DATES.map(dayInitial).join('')).toBe('TWTFSSM');
  });
});

// Six Open-Meteo locations, hourly from Tue 2027-01-05 00:00 for 4 days; NBM snows only at Alta.
const TIMES = DATES.slice(0, 4).flatMap((d) =>
  Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`),
);
const loc = (series: Record<string, (number | null)[]>) =>
  ({ hourly: { time: TIMES, ...series }, daily: { time: [] } }) as unknown as OmLocation;
const ALTA_NBM = TIMES.map((_, i) => (i >= 20 && i < 24 ? 0.6 : 0));
const OM = [loc({ snowfall_ncep_nbm_conus: ALTA_NBM }), ...Array.from({ length: 5 }, () => loc({}))];

describe('pickHourly and hourlyScale', () => {
  it('slices 48 h from the current hour, picks the headline model per resort and shares one scale', () => {
    const view = pickHourly(OM, '2027-01-05T12:00');
    expect(view?.window.time[0]).toBe('2027-01-05T12:00');
    expect(view?.window.idx).toHaveLength(48);
    expect(view?.window.midnights).toEqual([12, 36]);
    expect(view?.lanes.map((l) => l.model)).toEqual(['ncep_nbm_conus', null, null, null, null, null]);
    expect(view?.lanes[0]?.totalIn).toBeCloseTo(2.4);
    expect(view?.lanes[1]).toMatchObject({ id: 'snowbird', values: [], totalIn: null });
    expect(view?.max).toBe(0.6);
  });
  it('is null when the cache misses the hour or no resort has a model', () => {
    expect(pickHourly(OM, '2027-02-01T12:00')).toBeNull();
    expect(
      pickHourly(
        Array.from({ length: 6 }, () => loc({})),
        '2027-01-05T12:00',
      ),
    ).toBeNull();
    expect(pickHourly(null, '2027-01-05T12:00')).toBeNull();
  });
  it('never scales under 0.5″/h and rounds the top up to a nice value', () => {
    expect(hourlyScale([[0.1, null], [0.2]])).toBe(0.5);
    expect(hourlyScale([[0.1], [0.7, 0.2]])).toBe(0.8);
    expect(hourlyScale([])).toBe(0.5);
  });
  it('labels every 6 h, the weekday at midnight, none at the edges', () => {
    const view = pickHourly(OM, '2027-01-05T12:00');
    const ticks = view ? hourTicks(view.window) : [];
    expect(ticks.map((t) => t.label)).toEqual(['6 PM', 'Wed', '6 AM', '12 PM', '6 PM', 'Thu', '6 AM']);
    expect(ticks[0]?.left).toBe(12.5);
  });
});

describe('the NWS day/night fallback', () => {
  it('covers the next 48 h in four halves from the current one', () => {
    const labels = (hour: number) => nwsHalves('2027-01-05', hour).map((h) => h.label);
    expect(labels(12)).toEqual(['Today', 'Tonight', 'Wed', 'Wed night']);
    expect(labels(20)).toEqual(['Tonight', 'Wed', 'Wed night', 'Thu']);
    expect(nwsHalves('2027-01-05', 3)[0]).toEqual({ date: '2027-01-04', half: 'night', label: 'Mon night' });
    expect(nwsHalves('', 3)).toEqual([]);
  });
  it("gives each resort's base–summit snow per half, a dash where NWS has none", () => {
    const rows = nwsBuckets(FORECAST, nwsHalves('2027-01-05', 12), 'imperial');
    expect(rows[0]?.cells).toEqual(['2', '1', '0', '0.5']);
    expect(rows[1]?.cells).toEqual(['—', '—', '—', '—']);
  });
  it('says why the lanes are missing and when Open-Meteo is tried again', () => {
    const now = Date.parse('2027-01-05T19:00:00Z');
    const om = { at: 0, status: 'rate-limited' as const, retryAt: Date.parse('2027-01-05T22:05:00Z') };
    expect(hourlyNote(null, om, '—', now)).toBe(
      'Hourly models unavailable · Open-Meteo rate-limited, next try 3:05 PM · showing NWS day/night totals',
    );
    expect(hourlyNote(null, { ...om, status: 'ok', retryAt: 0 }, '—', now)).toBe(
      'Hourly models unavailable · showing NWS day/night totals',
    );
    const view = pickHourly(OM, '2027-01-05T12:00');
    expect(hourlyNote(view, { at: now - 25 * 60_000, status: 'ok', retryAt: 0 }, '0.6″', now)).toBe(
      'Hourly snowfall: NBM via Open-Meteo, updated 25 min ago · bars to 0.6″/h',
    );
  });
  it('starts the window at the current local hour', () => {
    expect(hourStart(Date.parse('2027-01-05T19:20:00Z'))).toBe('2027-01-05T12:00');
    expect(hourStart(Number.NaN)).toBe('');
  });
});
