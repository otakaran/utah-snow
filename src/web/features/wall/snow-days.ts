// Pure rows for the wall's 3-day snow mini-table (spec §8.4 sidebar): per resort, NWS snow for each local date as a
// base–summit range in display units ('2–5', '0', '—' when unknown). Values arrive imperial (src/shared/units.ts).
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import type { Block, PointForecast, ResortId } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { dayOf, range } from '../conditions/index.ts';

export interface SnowDaysRow {
  id: ResortId;
  name: string;
  /** One cell per requested date. */
  cells: string[];
}

type Forecasts = Record<string, Block<PointForecast>> | undefined;

/**
 * Every resort in canonical order with its snow for each of `dates` (local 'YYYY-MM-DD'): the base–summit range
 * without the unit (it sits in the table caption); a placeholder payload ('{}' in the e2e seed) counts as unknown.
 */
export function snowDays(forecast: Forecasts, dates: readonly string[], units: Units): SnowDaysRow[] {
  const snowIn = (key: string, date: string) => dayOf(forecast?.[key]?.data, date)?.snowIn;
  return RESORT_IDS.map((id) => ({
    id,
    name: RESORTS[id].name,
    cells: dates.map((date) => range('snow', [snowIn(`${id}:base`, date), snowIn(`${id}:summit`, date)], units, true)),
  }));
}
