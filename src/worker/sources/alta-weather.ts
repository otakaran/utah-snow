// Alta snow history and hourly station readings (spec §5.4 'alta-weather' -> row 'alta:weather', Appendix B):
// window.Alta.weather on https://www.alta.com/weather (no liftStatus there). Hourly job; resort:alta reads `days`
// from this row for its 48h/72h/7d fallback (§5.5).
// History rows for day D appear at 00:10 on D+1 and are edited later; off-season seasons[0] still names the last
// season, so rows are filtered by season AND by recency (the last HISTORY_DAYS local days), which empties them.
import { num, range } from '../../shared/num.ts';
import { addDays, localDate } from '../../shared/time.ts';
import { altaJson, arr, obj, stampIso, str } from './alta-weather/page.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const ALTA_WEATHER_URL = 'https://www.alta.com/weather';
const ROW = 'alta:weather';
const HISTORY_DAYS = 14; // 7d needs 7 rows; the rest is slack for a late or stale run
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOC = { 1: 'base', 2: 'mid', 3: 'summit' } as const; // observation.locations: Base, Mid Mountain, Top of Collins

export interface AltaSnowDay {
  date: string; // reported_at, local
  newSnowIn: number;
  stormTotalIn: number | null;
  ytdIn: number | null;
}
export interface AltaObs {
  at: string; // ISO with Denver offset
  loc: (typeof LOC)[keyof typeof LOC];
  tempF: number | null;
  snowIn: number | null;
  windMph: number | null;
  windDir: string | null;
}
export interface AltaWeather {
  season: number; // weather.snowfall.seasons[0].value, e.g. 20252026
  preseason: boolean; // !seasonal.is_winter
  days: AltaSnowDay[]; // ascending by date, current season, last HISTORY_DAYS days only
  obs: AltaObs[]; // ascending by time, about the last 24 h
}

function snowDays(history: unknown[], season: number, today: string): AltaSnowDay[] {
  const from = addDays(today, -HISTORY_DAYS);
  const byDate = new Map<string, AltaSnowDay>();
  for (const v of history) {
    const r = obj(v);
    const date = typeof r?.reported_at === 'string' ? r.reported_at.slice(0, 10) : '';
    const newSnowIn = range(num(r?.new_snow), 0, 120);
    if (!r || num(r.season) !== season || !DATE_RE.test(date) || date < from || date > today) continue;
    if (newSnowIn === null) continue;
    const stormTotalIn = range(num(r.storm_total), 0, 600);
    byDate.set(date, { date, newSnowIn, stormTotalIn, ytdIn: range(num(r.ytd_snow), 0, 1500) });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function readings(rows: unknown[]): AltaObs[] {
  const out: { key: string; o: AltaObs }[] = [];
  for (const v of rows) {
    const r = obj(v);
    const loc = LOC[num(r?.location_id) as keyof typeof LOC];
    const at = stampIso(r?.dated_at);
    if (!r || !loc || !at) continue;
    const o: AltaObs = {
      at,
      loc,
      tempF: range(num(r.temperature), -60, 110),
      snowIn: range(num(r.snow), 0, 30),
      windMph: range(num(r.wind_speed), 0, 200),
      windDir: str(r.wind_direction_text),
    };
    out.push({ key: `${String(r.dated_at)}|${num(r.location_id)}`, o }); // local stamps sort as text
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((x) => x.o);
}

export function parseAltaWeather(html: string, ctx: ParseCtx): Output {
  const root = altaJson(String(html ?? ''));
  const w = obj(root.weather);
  const sf = obj(w?.snowfall);
  const season = num(obj(arr(sf?.seasons)[0])?.value);
  const obsRows = obj(w?.observation)?.weather;
  if (!sf || !Array.isArray(sf.history) || season === null || !Array.isArray(obsRows)) {
    throw new ValidationError('alta-weather: weather.snowfall or weather.observation missing');
  }
  const row: AltaWeather = {
    season,
    preseason: obj(root.seasonal)?.is_winter !== true,
    days: snowDays(sf.history, season, localDate(ctx.now)),
    obs: readings(obsRows),
  };
  return { rows: { [ROW]: row } };
}

export const altaWeather: Source<string> = {
  id: 'alta-weather',
  staleAfterMin: 120,
  rows: [ROW],
  // One GET; redirects are not followed (follow: false), so the worst case is exactly 1.
  maxSubrequests: () => 1,
  probes: [{ hostId: 'alta-weather', url: ALTA_WEATHER_URL }],
  async fetch(ctx: FetchCtx): Promise<string> {
    const res = await ctx.fetch<string>(ALTA_WEATHER_URL, {
      headers: { Accept: 'text/html' },
      follow: false,
      timeoutMs: 10_000,
    });
    if (res.status !== 200) throw new Error(`alta-weather: HTTP ${res.status} (redirects are not followed)`);
    return res.data;
  },
  parse: parseAltaWeather,
};
