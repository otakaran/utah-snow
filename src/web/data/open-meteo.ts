// Open-Meteo store (spec §8.8, C.5). The browser calls api.open-meteo.com directly; the Worker never does.
// One localStorage cache (`utahsnow.om`) is shared by every route and tab. A refresh runs only while the page is
// visible and the cache is >= 30 min old (60 on the wall). On 429 every tab waits 60 min (`retryAfter`, stored in
// the shared cache because the crew shares one NAT); other errors back off 5/15/30 min. Cached data keeps showing
// with its age. Times here are server time (Date.now() + skew), like every other age in the UI.
import { signal } from '@preact/signals';
import { RESORT_IDS, RESORTS } from '../../../config/resorts.ts';
import { isoUtc, MIN } from '../../shared/time.ts';
import type { Meta, ResortId } from '../../shared/types.ts';
import { skewMs } from './snapshot.ts';

/**
 * Model suffixes on every key (`snowfall_sum_ecmwf_ifs`). Coverage measured 2026-10-25: HRRR carries all seven
 * hourly fields but only for the first ~48-60 h; NBM runs the full 168 h for snowfall, temperature_2m,
 * wind_speed_10m, wind_gusts_10m and precipitation but has no snow_depth and no freezing_level_height; ECMWF has
 * everything except freezing_level_height; GFS has everything. A field a model lacks is null (or absent) per hour.
 */
export const OM_MODELS = ['ncep_hrrr_conus', 'ncep_nbm_conus', 'ecmwf_ifs', 'ncep_gfs_global'] as const;
export type OmModel = (typeof OM_MODELS)[number];

/** The hourly fields the C.5 URL asks for, in URL order (`hourly=` is built from this list). */
export const OM_HOURLY_FIELDS = [
  'snowfall',
  'snow_depth',
  'temperature_2m',
  'freezing_level_height',
  'wind_speed_10m',
  'wind_gusts_10m',
  'precipitation',
] as const;
export type OmHourlyField = (typeof OM_HOURLY_FIELDS)[number];

const PTS = RESORT_IDS.map((id) => RESORTS[id].openMeteo);
const HOURLY = OM_HOURLY_FIELDS.join(',');

/** The C.5 request: six resort points in RESORT_IDS order, imperial units, Denver days. */
export const OM_URL = `https://api.open-meteo.com/v1/forecast?${[
  `latitude=${PTS.map((p) => p.lat).join(',')}`,
  `longitude=${PTS.map((p) => p.lon).join(',')}`,
  `elevation=${PTS.map((p) => p.elevM).join(',')}`,
  `hourly=${HOURLY}`,
  'daily=snowfall_sum',
  `models=${OM_MODELS.join(',')}`,
  'timezone=America%2FDenver',
  'forecast_days=7',
  'precipitation_unit=inch',
  'temperature_unit=fahrenheit',
  'wind_speed_unit=mph',
  'cell_selection=nearest',
].join('&')}`;

/** One time series block: `time` plus `{field}_{model}` arrays (inch, °F, mph, ft; null where a model has no value). */
export interface OmSeries {
  time: string[];
  [key: string]: (number | null)[] | string[];
}
export interface OmLocation {
  latitude: number;
  longitude: number;
  elevation: number;
  utc_offset_seconds: number;
  hourly: OmSeries;
  daily: OmSeries;
}
export interface OmData {
  at: number; // server-time ms of the successful fetch
  data: OmLocation[]; // RESORT_IDS order (index by position, C.5)
}
export type OmStatus = 'idle' | 'loading' | 'ok' | 'rate-limited' | 'error';

interface Stored {
  v: 1;
  at: number;
  data: OmLocation[] | null;
  retryAfter: number; // 429: nobody fetches before this
  nextTry: number; // other errors: 5/15/30 min backoff
  fails: number;
  claimAt: number; // a tab is fetching since then; others wait up to CLAIM_MS
}

const KEY = 'utahsnow.om';
const CHECK_MS = 60_000;
const CLAIM_MS = 60_000;
const RATE_LIMIT_MS = 60 * MIN;
const BACKOFF_MS = [5 * MIN, 15 * MIN, 30 * MIN] as const;
const EMPTY: Stored = { v: 1, at: 0, data: null, retryAfter: 0, nextTry: 0, fails: 0, claimAt: 0 };

let mem: Stored = EMPTY; // fallback when localStorage is unavailable (private mode, quota)
let started = false;
let inflight = false;
let period = (): number => (document.querySelector('[data-scale="wall"]') ? 60 : 30) * MIN;

const nowMs = (): number => Date.now() + skewMs.peek();
const isSeries = (s: unknown): s is OmSeries =>
  typeof s === 'object' && s !== null && Array.isArray((s as { time?: unknown }).time);

/** Accepts only the six-location array the C.5 URL returns; anything else is an error. */
export function parseOm(body: unknown): OmLocation[] {
  if (!Array.isArray(body) || body.length !== RESORT_IDS.length) throw new Error('unexpected payload');
  for (const loc of body as Partial<OmLocation>[]) {
    if (!isSeries(loc?.daily) || !isSeries(loc?.hourly)) throw new Error('missing daily/hourly');
  }
  return body as OmLocation[];
}

/** The response entry for one resort (array index = RESORT_IDS position). */
export function omFor(data: OmLocation[] | null | undefined, id: ResortId): OmLocation | null {
  return data?.[RESORT_IDS.indexOf(id)] ?? null;
}

/**
 * One model's series for a field (`hourly` 'snowfall' or `daily` 'snowfall_sum'): the `{field}_{model}` array, or
 * null when the key is missing, is not an array, or holds no number at all (a field the model does not carry).
 */
export function omSeries(
  loc: OmLocation | null | undefined,
  block: 'hourly' | 'daily',
  field: string,
  model: OmModel,
): (number | null)[] | null {
  const arr = loc?.[block]?.[`${field}_${model}`];
  if (!Array.isArray(arr) || !arr.some((v) => typeof v === 'number')) return null;
  return arr as (number | null)[];
}

/**
 * A `Meta` for the browser-fetched Open-Meteo data so `badge()` / `worstMeta` / SourceLine treat it like a source
 * row: ok at the fetch time with a 60 min stale window (the store refreshes every 30). 'idle' counts as ok, since a
 * fresh cache never triggers a refresh and so never changes the status; only 'error' and 'rate-limited' are failures,
 * and then `fetchedAt` is the failed attempt (`nowMs`). Null without cached data.
 */
export function omMeta(om: OmData | null | undefined, status: OmStatus, nowMs: number): Meta | null {
  if (!om) return null;
  const failed = status === 'error' || status === 'rate-limited';
  return {
    source: 'open-meteo',
    fetchedAt: isoUtc(failed ? nowMs : om.at),
    okAt: isoUtc(om.at),
    asOf: null,
    status: failed ? 'error' : 'ok',
    failCount: failed ? 1 : 0,
    staleAfterMin: 60,
    via: 'browser',
  };
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (s?.v === 1) return { ...EMPTY, ...s, data: s.data ? parseOm(s.data) : null };
  } catch {
    // Unreadable or corrupt: fall back to this tab's memory copy.
  }
  return mem;
}

function save(s: Stored): void {
  mem = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Quota or private mode: this tab keeps its memory copy.
  }
}

const initial = (): OmData | null => {
  const s = typeof localStorage === 'undefined' ? EMPTY : load();
  return s.data ? { at: s.at, data: s.data } : null;
};

export const openMeteo = signal<OmData | null>(initial());
export const openMeteoStatus = signal<OmStatus>('idle');
/** Server-time ms until which a 429 holds every tab back (0 = none). */
export const openMeteoRetryAt = signal(0);

function publish(s: Stored): void {
  if (s.data && (openMeteo.peek()?.at ?? -1) !== s.at) openMeteo.value = { at: s.at, data: s.data };
  openMeteoRetryAt.value = s.retryAfter;
}

function due(s: Stored, now: number): boolean {
  if (now < s.retryAfter || now < s.nextTry || now - s.claimAt < CLAIM_MS) return false;
  return !s.data || now - s.at >= period();
}

async function refresh(): Promise<void> {
  if (inflight || document.visibilityState !== 'visible') return;
  const s = load();
  publish(s);
  const now = nowMs();
  if (!due(s, now)) return;
  inflight = true;
  openMeteoStatus.value = 'loading';
  save({ ...s, claimAt: now });
  try {
    const res = await fetch(OM_URL, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (res.status === 429) {
      void res.body?.cancel();
      const next = { ...load(), retryAfter: nowMs() + RATE_LIMIT_MS, claimAt: 0 };
      save(next);
      publish(next);
      openMeteoStatus.value = 'rate-limited';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseOm(await res.json());
    const next: Stored = { ...EMPTY, at: nowMs(), data };
    save(next);
    publish(next);
    openMeteoStatus.value = 'ok';
  } catch {
    const cur = load();
    const fails = cur.fails + 1;
    const wait = BACKOFF_MS[Math.min(fails, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[0];
    save({ ...cur, fails, nextTry: nowMs() + wait, claimAt: 0 });
    openMeteoStatus.value = 'error';
  } finally {
    inflight = false;
  }
}

/**
 * Starts the store once (later calls are no-ops). `periodMs` overrides the refresh age (default 30 min, 60 min when a
 * `[data-scale="wall"]` element is on the page). Only the panels that read `openMeteo` (ForecastPanel, ModelTable)
 * call this; the first caller's `periodMs` sticks.
 */
export function startOpenMeteo(periodMs?: () => number): void {
  if (started) return;
  started = true;
  if (periodMs) period = periodMs;
  setInterval(() => void refresh(), CHECK_MS);
  document.addEventListener('visibilitychange', () => void refresh());
  addEventListener('storage', (e) => {
    if (e.key === KEY) publish(load()); // another tab refreshed the shared cache
  });
  void refresh();
}
