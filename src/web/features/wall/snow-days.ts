// Pure rows for the wall's 3-day snow mini-table (spec §8.4 sidebar): per resort, NWS snow for each local date as a
// base–summit range in display units ('2–5', '0', '—' when unknown). Values arrive imperial (src/shared/units.ts).
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import type { Block, NwsDay, PointForecast, ResortId } from '../../../shared/types.ts';
import { fmt, type Units } from '../../../shared/units.ts';

export interface SnowDaysRow {
  id: ResortId;
  name: string;
  /** One cell per requested date. */
  cells: string[];
}

type Forecasts = Record<string, Block<PointForecast>> | undefined;

const DASH = '—';

/** The NWS day for `date` in a grid row; undefined for a missing or placeholder payload ('{}' in the e2e seed). */
function dayOf(block: Block<PointForecast> | undefined, date: string): NwsDay | undefined {
  const days = block?.data?.days;
  return Array.isArray(days) ? days.find((d) => d.date === date) : undefined;
}

/** Base–summit range without the unit (it sits in the table caption); one value when both ends print the same. */
function snowRange(values: readonly (number | undefined)[], units: Units): string {
  const ok = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (ok.length === 0) return DASH;
  const show = (v: number) => fmt('snow', v, units).value.replace(/\.0$/, '');
  const lo = show(Math.min(...ok));
  const hi = show(Math.max(...ok));
  return lo === hi ? hi : `${lo}–${hi}`;
}

/** Every resort in canonical order with its snow for each of `dates` (local 'YYYY-MM-DD'). */
export function snowDays(forecast: Forecasts, dates: readonly string[], units: Units): SnowDaysRow[] {
  return RESORT_IDS.map((id) => ({
    id,
    name: RESORTS[id].name,
    cells: dates.map((date) =>
      snowRange(
        [dayOf(forecast?.[`${id}:base`], date)?.snowIn, dayOf(forecast?.[`${id}:summit`], date)?.snowIn],
        units,
      ),
    ),
  }));
}
