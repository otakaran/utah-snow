// Pure view logic for ModelTable (spec §8.7.5, C.5): one resort's Open-Meteo entry -> one row per day (today, +1,
// +2) with a cell per model (HRRR, NBM, ECMWF, GFS). Snow is the daily `snowfall_sum`; the high/low come from hourly
// `temperature_2m`, because the C.5 URL asks for no daily temperatures. A value a model lacks (HRRR past ~48 h, a
// field NBM or ECMWF does not carry, a day the cache no longer holds) stays null and prints '—'.
// Values arrive imperial and are formatted with src/shared/units.ts only.
import { addDays, formatLocalDate } from '../../../shared/time.ts';
import { fmt, type Units } from '../../../shared/units.ts';
import { OM_MODELS, type OmLocation, type OmModel, type OmSeries } from '../../data/open-meteo.ts';

export const MODEL_LABEL: Record<OmModel, string> = {
  ncep_hrrr_conus: 'HRRR',
  ncep_nbm_conus: 'NBM',
  ecmwf_ifs: 'ECMWF',
  ncep_gfs_global: 'GFS',
};

export const MODEL_DAYS = 3;
const DASH = '—';
const MIN_HOURS = 23; // a DST spring-forward day has 23 local hours

export interface ModelCell {
  model: OmModel;
  /** Snowfall in display units with its unit ('1.2″', '3 cm'), '—' when the model has no sum for the day. */
  snow: string;
  /** Snow is known and rounds to zero (dimmed). */
  dry: boolean;
  /** High / low as '28° / 19°' in display units, '—' unless the model covers every hour of the day. */
  temps: string;
}

export interface ModelRow {
  date: string; // 'YYYY-MM-DD', Denver
  label: string; // 'Today', 'Tomorrow', 'Thu'
  cells: ModelCell[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A model's daily `snowfall_sum` for `date` (inches), or null. */
export function daySnow(daily: OmSeries | null | undefined, model: OmModel, date: string): number | null {
  const arr = daily?.[`snowfall_sum_${model}`];
  const i = daily ? daily.time.indexOf(date) : -1;
  return i >= 0 && Array.isArray(arr) ? num(arr[i]) : null;
}

/** High and low (°F) of a model's hourly `temperature_2m` over one local date; null unless every hour is known. */
export function dayTemps(
  hourly: OmSeries | null | undefined,
  model: OmModel,
  date: string,
): { hi: number; lo: number } | null {
  const arr = hourly?.[`temperature_2m_${model}`];
  if (!hourly || !Array.isArray(arr)) return null;
  const vals: number[] = [];
  for (const [i, t] of hourly.time.entries()) {
    if (t.slice(0, 10) !== date) continue;
    const v = num(arr[i]);
    if (v === null) return null; // a partial day (HRRR's horizon) would understate the range
    vals.push(v);
  }
  return vals.length >= MIN_HOURS ? { hi: Math.max(...vals), lo: Math.min(...vals) } : null;
}

function dayLabel(date: string, i: number): string {
  if (i === 0) return 'Today';
  return i === 1 ? 'Tomorrow' : formatLocalDate(date, 'weekday');
}

function cell(loc: OmLocation | null, model: OmModel, date: string, units: Units): ModelCell {
  const snowIn = daySnow(loc?.daily, model, date);
  const t = dayTemps(loc?.hourly, model, date);
  const deg = (f: number) => `${fmt('temp', f, units).value}°`;
  return {
    model,
    snow: fmt('snow', snowIn, units).text,
    dry: snowIn !== null && Number(fmt('snow', snowIn, units).value) === 0,
    temps: t ? `${deg(t.hi)} / ${deg(t.lo)}` : DASH,
  };
}

/** Rows for today and the next two days (Denver dates); [] when today is unknown. */
export function modelRows(loc: OmLocation | null | undefined, today: string, units: Units): ModelRow[] {
  if (!today) return [];
  return Array.from({ length: MODEL_DAYS }, (_, i) => {
    const date = addDays(today, i);
    return { date, label: dayLabel(date, i), cells: OM_MODELS.map((m) => cell(loc ?? null, m, date, units)) };
  });
}
