// Snowbird /dor/sensors -> WeatherNow (spec §5.4, §5.5 weather resolution). Pure.
// Base = snowbirdBase, Mid = snowbirdGad2, Summit = snowbirdHiddenPeak15min (15-min wind; `wind.high` is the gust).
import { num, range } from '../../../shared/num.ts';
import { localDate, zonedToUtc } from '../../../shared/time.ts';
import type { WeatherNow } from '../../../shared/types.ts';
import { asObj, asStr, iso, type Obj } from './lifts.ts';

export const WEATHER_SRC = 'snowbird-sensors';
const DAY_MS = 86_400_000;
const temp = (s: Obj | null) => range(num(s?.temperature), -60, 110);
const mph = (v: unknown) => range(num(v), 0, 250);

export const emptyWeather = (): WeatherNow => ({
  baseTempF: null,
  midTempF: null,
  summitTempF: null,
  summitWindMph: null,
  summitGustMph: null,
  windDir: null,
  sky: null,
  obsAt: null,
  src: WEATHER_SRC,
});

/**
 * Sensor stamp: `nonstandardizedDataPoints.date` 'M DD' plus `time` or `time_hr` 'HHMM', Denver wall time with
 * no year. Uses the current Denver year, minus one when that lands more than a day in the future.
 */
export function sensorAt(s: Obj | null, now: number): number | null {
  const d = asObj(s?.nonstandardizedDataPoints);
  const md = /^(\d{1,2})\s+(\d{1,2})$/.exec(asStr(d?.date) ?? '');
  const hm = /^(\d{1,2})(\d{2})$/.exec(asStr(d?.time) ?? asStr(d?.time_hr) ?? '');
  if (!md || !hm) return null;
  const at = (year: number) =>
    zonedToUtc(`${year}-${md[1]?.padStart(2, '0')}-${md[2]?.padStart(2, '0')} ${hm[1]?.padStart(2, '0')}:${hm[2]}`);
  const year = Number(localDate(now).slice(0, 4));
  const ms = at(year);
  return ms !== null && ms > now + DAY_MS ? at(year - 1) : ms;
}

/** null when the payload has none of the three sensors (the caller keeps the last-good weather). */
export function weatherNow(raw: unknown, now: number): WeatherNow | null {
  const all = asObj(raw);
  const base = asObj(all?.snowbirdBase);
  const mid = asObj(all?.snowbirdGad2);
  const peak = asObj(all?.snowbirdHiddenPeak15min);
  if (!base && !mid && !peak) return null;
  const wind = asObj(peak?.wind);
  const dir = asStr(wind?.direction)?.toUpperCase() ?? null;
  const obsMs = sensorAt(peak, now) ?? sensorAt(base, now) ?? sensorAt(mid, now);
  return {
    ...emptyWeather(),
    baseTempF: temp(base),
    midTempF: temp(mid),
    summitTempF: temp(peak),
    summitWindMph: mph(wind?.current),
    summitGustMph: mph(wind?.high),
    windDir: dir && /^[NSEW]{1,3}$/.test(dir) ? dir : null,
    obsAt: obsMs === null ? null : iso(obsMs),
  };
}
