// A seeded storm for the weather page (weather.spec.ts): `weatherAt` fixes the page clock AND rewrites every /api
// response in ONE `**/api/**` handler (it replaces pinTime; the last handler wins), giving /api/snapshot 8 NWS days
// for the chosen resorts, one Winter Storm Warning and AFD key messages; then it answers Open-Meteo with 7 days of
// hourly data from local midnight (HRRR stops after 48 h, NBM has no freezing level, GFS has it all).
import type { Page } from '@playwright/test';
import type { NwsDay, PointForecast } from '../src/shared/types.ts';

/** Tue Jan 5 2027, 1:00 PM MST. */
export const WX_NOW = '2027-01-05T20:00:00Z';
const DATES = Array.from({ length: 8 }, (_, i) => `2027-01-${String(5 + i).padStart(2, '0')}`);
const SUMMIT = [0.5, 8, 14, 3, 0, 0, 1, 0];

function days(scale: number): NwsDay[] {
  return DATES.map((date, i) => {
    const snowIn = Math.round((SUMMIT[i] ?? 0) * scale * 10) / 10;
    const wet = snowIn > 0;
    return {
      date,
      snowIn,
      snowDayIn: Math.round(snowIn * 4) / 10,
      snowNightIn: Math.round(snowIn * 6) / 10,
      qpfIn: wet ? Math.round(snowIn * 8) / 100 : 0,
      snowLevelMinFt: wet ? (i === 0 ? 8000 : 5000) : null,
      snowLevelMaxFt: wet ? (i === 0 ? 9200 : 6500) : null,
      gustMaxMph: 20 + 4 * i,
      windMaxMph: 10 + 2 * i,
      tMinF: 12 + i,
      tMaxF: 24 + i,
      popMax: wet ? 90 : 10,
    };
  });
}

// Per resort, so the week lanes differ; Alta leads.
const FACTOR: Record<string, number> = { alta: 1, snowbird: 0.9, brighton: 0.7, solitude: 0.6, snowbasin: 0.5 };

function point(id: string, p: 'base' | 'summit'): PointForecast {
  const d = days((FACTOR[id] ?? 0.4) * (p === 'base' ? 0.65 : 1));
  return {
    resortId: id,
    point: p,
    grid: 'SLC/108,166',
    gridElevFt: 9436,
    trueElevFt: 10556,
    days: d,
    updateTime: '2027-01-05T19:31:00Z',
    overnight: { from: '', to: '', snowIn: 0, coverage: 'full', issuedAt: '2027-01-05T19:31:00Z' },
    todayDaytimeSnowIn: d[0]?.snowDayIn ?? 0,
    tonightSnowIn: d[0]?.snowNightIn ?? 0,
    tomorrowDaytimeSnowIn: d[1]?.snowDayIn ?? 0,
    frozen: {},
  } as PointForecast;
}

const ALERT = {
  event: 'Winter Storm Warning',
  severity: 'Severe',
  headline: 'Winter Storm Warning from Tue 6 PM until Thu 5 AM: 1 to 2 feet in the Cottonwoods, gusts to 50 mph.',
  onset: '2027-01-06T01:00:00Z',
  ends: '2027-01-07T12:00:00Z',
  zones: ['UTZ111'],
};
const AFD = {
  id: 'e2e-afd',
  issuedAt: '2027-01-05T18:05:00Z',
  keyMessages: '- A strong Pacific trough brings heavy mountain snow Wednesday.\n- Ridging returns for the weekend.',
  url: 'https://forecast.weather.gov/product.php?site=SLC&issuedby=SLC&product=AFD',
};

type Snap = { forecast: Record<string, { data: unknown }>; alerts: { data: unknown }; afd: { data: unknown } };

function patch(snap: Snap, ids: readonly string[]): void {
  for (const id of ids) {
    for (const p of ['base', 'summit'] as const) {
      const block = snap.forecast[`${id}:${p}`];
      if (block) block.data = point(id, p);
    }
  }
  snap.alerts.data = [ALERT];
  snap.afd.data = AFD;
}

// Open-Meteo: 168 hours from local midnight; the window opens at 13:00 (index 13).
const HOURS = 168;
const TIMES = Array.from({ length: HOURS }, (_, i) => {
  const d = Math.floor(i / 24);
  return `2027-01-${String(5 + d).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`;
});
const storm = (i: number, at: number, peak: number) =>
  Math.max(0, Math.round(peak * (1 - Math.abs(i - at) / 9) * 100) / 100);
const series = (f: (i: number) => number | null) => TIMES.map((_, i) => f(i));
const hrrr = (f: (i: number) => number) => series((i) => (i < 48 ? f(i) : null));
const temp = (i: number) => Math.round(26 + 5 * Math.sin(((i % 24) - 9) / 3.8) - (i > 40 ? 10 : 0));
const level = (i: number) => (i < 30 ? 9400 - i * 40 : i < 50 ? 8200 - (i - 30) * 110 : 6000);

const hourly = {
  time: TIMES,
  snowfall_ncep_nbm_conus: series((i) => storm(i, 44, 1.3)),
  snowfall_ncep_hrrr_conus: hrrr((i) => storm(i, 42, 1.6)),
  snowfall_ecmwf_ifs: series((i) => storm(i, 47, 0.9)),
  snowfall_ncep_gfs_global: series((i) => storm(i, 45, 1.1)),
  temperature_2m_ncep_nbm_conus: series(temp),
  temperature_2m_ncep_gfs_global: series((i) => temp(i) - 1),
  wind_speed_10m_ncep_nbm_conus: series((i) => Math.round(12 + 10 * Math.max(0, 1 - Math.abs(i - 42) / 14))),
  wind_gusts_10m_ncep_nbm_conus: series((i) => Math.round(22 + 26 * Math.max(0, 1 - Math.abs(i - 40) / 12))),
  freezing_level_height_ncep_hrrr_conus: hrrr(level),
  freezing_level_height_ncep_gfs_global: series((i) => level(i) + 150),
};
const daily = {
  time: DATES.slice(0, 7),
  snowfall_sum_ncep_nbm_conus: [0.4, 7, 12, 2, 0, 0, 0.8],
  snowfall_sum_ecmwf_ifs: [0.6, 9.5, 15, 3.5, 0, 0.2, 1.4],
  snowfall_sum_ncep_hrrr_conus: [0.5, 8.4, null, null, null, null, null],
  snowfall_sum_ncep_gfs_global: [0.3, 6, 11, 2.5, 0, 0, 0.5],
};
export const OM_BODY = JSON.stringify(Array.from({ length: 6 }, () => ({ hourly, daily })));

/** Fixes the clock at `iso` and serves the seeded storm (NWS rows for `ids`, alert, AFD, Open-Meteo unless `om` is false). */
export async function weatherAt(
  page: Page,
  { iso = WX_NOW, ids = ['alta'], om = true }: { iso?: string; ids?: readonly string[]; om?: boolean } = {},
): Promise<void> {
  const ms = Date.parse(iso);
  await page.clock.setFixedTime(ms);
  await page.route('**/api/**', async (route) => {
    const res = await route.fetch();
    const headers: Record<string, string> = { ...res.headers(), date: new Date(ms).toUTCString() };
    if (new URL(route.request().url()).pathname !== '/api/snapshot' || res.status() !== 200) {
      return route.fulfill({ response: res, headers });
    }
    const snap = (await res.json()) as Snap;
    patch(snap, ids);
    delete headers['content-length'];
    delete headers['content-encoding'];
    return route.fulfill({ response: res, headers, body: JSON.stringify(snap) });
  });
  if (om) {
    await page.route('https://api.open-meteo.com/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: OM_BODY }),
    );
  }
}
