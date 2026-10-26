// Rich forecast data for the wall's week strip and weather page (wall.spec.ts): the e2e seed stores '{}' NWS
// payloads and fixtures.ts answers Open-Meteo with empty series, so these fill a snapshot body with 8 NWS days per
// resort point (a storm peaking Thursday 2027-01-07 at Alta, 8–14″) and an Open-Meteo body with hourly NBM
// snowfall for the week from Tuesday 2027-01-05. Data only: no Playwright here.
import { RESORT_IDS } from '../config/resorts.ts';

const DATES = Array.from({ length: 8 }, (_, i) => `2027-01-${String(5 + i).padStart(2, '0')}`);
const AT = '2027-01-05T18:00:00Z';

/** Summit snow per date (inches); the base gets 60 % of it, rounded. */
const SUMMIT: Record<string, number[]> = {
  alta: [0, 2, 14, 6, 0, 0, 1, 0],
  snowbird: [0, 2, 12, 5, 0, 0, 1, 0],
  brighton: [0, 1, 10, 4, 0, 0, 0, 0],
  solitude: [0, 1, 9, 4, 0, 0, 0, 0],
  'deer-valley': [0, 0, 6, 2, 0, 0, 0, 0],
  snowbasin: [0, 1, 7, 3, 0, 0, 0, 0],
};

function pointForecast(id: string, point: 'base' | 'summit') {
  const days = DATES.map((date, i) => {
    const top = SUMMIT[id]?.[i] ?? 0;
    const s = point === 'summit' ? top : Math.round(top * 0.6);
    return {
      ...{ date, snowIn: s, snowDayIn: s / 2, snowNightIn: s / 2, qpfIn: s / 10 },
      ...{ snowLevelMinFt: 5000, snowLevelMaxFt: 6500, gustMaxMph: 35, windMaxMph: 15 },
      ...{ tMinF: 8, tMaxF: 24, popMax: s > 0 ? 80 : 10 },
    };
  });
  return {
    ...{ resortId: id, point, grid: 'SLC/100,170', gridElevFt: 9000, trueElevFt: 9000, days, updateTime: AT },
    overnight: { from: AT, to: AT, snowIn: 0, coverage: 'full', issuedAt: AT },
    ...{ todayDaytimeSnowIn: 0, tonightSnowIn: 0, tomorrowDaytimeSnowIn: 0, frozen: {} },
  };
}

/** Replaces every NWS point's data in a /api/snapshot body (its meta stays). */
export function richSnapshot(body: { forecast: Record<string, { data: unknown }> }): void {
  for (const id of RESORT_IDS) {
    for (const point of ['base', 'summit'] as const) {
      const block = body.forecast[`${id}:${point}`];
      if (block) block.data = pointForecast(id, point);
    }
  }
}

const TIMES = DATES.slice(0, 7).flatMap((d) =>
  Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`),
);

/** A 6-location Open-Meteo body: NBM hourly snowfall, a storm from Wednesday 18:00 to Thursday 18:00, heavier at Alta. */
export function richOpenMeteo(): string {
  const locs = RESORT_IDS.map((_, k) => {
    const snow = TIMES.map((t) => {
      const h = TIMES.indexOf(t) - 42; // hours after Wednesday 18:00
      return h < 0 || h >= 24 ? 0 : Math.round((0.15 + 0.6 * Math.sin((Math.PI * h) / 24)) * (1 - k * 0.1) * 100) / 100;
    });
    return {
      ...{ latitude: 40.6, longitude: -111.6, elevation: 3000, utc_offset_seconds: -25200 },
      hourly: { time: TIMES, snowfall_ncep_nbm_conus: snow },
      daily: { time: DATES.slice(0, 7), snowfall_sum_ncep_nbm_conus: DATES.slice(0, 7).map(() => 1) },
    };
  });
  return JSON.stringify(locs);
}
