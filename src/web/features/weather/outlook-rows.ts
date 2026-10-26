// Pure rows for the §02 day columns (concept B): per local date from today, the NWS base–summit snow, summit
// Lo–Hi and wind (base when the summit grid lacks the day), the snow level chip against the true base elevation
// (`levelStatus`), and the Open-Meteo model spread for that day. Values arrive imperial; units.ts formats them.
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { NwsDay, PointForecast, ResortId } from '../../../shared/types.ts';
import { type Units, unitOf } from '../../../shared/units.ts';
import type { OmSeries } from '../../data/open-meteo.ts';
import type { StatusWord } from '../../ui/status.ts';
import { dayOf, gridRow, levelStatus, modelSpread, range, weekDates, windText } from '../conditions/index.ts';

const DASH = '—';

export interface OutlookDay {
  date: string;
  /** 'Today', else the weekday ('Thu'). */
  label: string;
  /** Day of the month ('7'). */
  dayNum: string;
  /** Base–summit snow without the unit ('0.3–0.5', '—'); `unit` is printed small beside it. */
  snow: string;
  unit: string;
  /** Six characters or more: the card sets it smaller so it never overflows. */
  long: boolean;
  /** Summit low–high with the unit ('20–31°F'). */
  temps: string;
  /** Summit wind and gust with the unit ('13 G25 mph'). */
  wind: string;
  /** Snow / Mix / Rain against the base elevation on a day with precipitation. */
  level: StatusWord | null;
  /** The snow level range ('7,600–9,900 ft'), 'Dry' without precipitation, '—' when unknown. */
  levelText: string;
  /** Open-Meteo model spread for the day, no unit ('0.3–0.6'), '—' beyond the models' 7 days. */
  models: string;
  /** The resort's biggest summit day (snow > 0). */
  peak: boolean;
}

function levelText(days: readonly (NwsDay | undefined)[], units: Units): string {
  const known = days.filter((d): d is NwsDay => !!d);
  if (known.length === 0) return DASH;
  if (known.every((d) => !(d.qpfIn > 0))) return 'Dry';
  return range('snowLevel', [...known.map((d) => d.snowLevelMinFt), ...known.map((d) => d.snowLevelMaxFt)], units);
}

/**
 * Up to `n` days from `today` for one resort; dates neither grid row covers drop out. Null when the resort has no
 * grid row at all (a placeholder payload, the e2e seed's '{}'), so the panel can say so.
 */
export function outlookDays(
  id: ResortId,
  baseRow: PointForecast | null | undefined,
  summitRow: PointForecast | null | undefined,
  today: string,
  units: Units,
  om?: OmSeries | null,
  n = 8,
): OutlookDay[] | null {
  const base = gridRow(baseRow);
  const summit = gridRow(summitRow);
  if (!base && !summit) return null;
  const baseFt = RESORTS[id].base.ft;
  const days = weekDates(today, n).flatMap((date) => {
    const b = dayOf(base, date);
    const s = dayOf(summit, date);
    if (!b && !s) return [];
    const top = s ?? b;
    const spread = modelSpread(om, [date]);
    const snow = range('snow', [b?.snowIn, s?.snowIn], units, true);
    const lvlDay = b ?? s;
    const wind = windText(top, units);
    return [
      {
        date,
        label: date === today ? 'Today' : formatLocalDate(date, 'weekday'),
        dayNum: String(Number(date.slice(8, 10))),
        snow,
        unit: snow === DASH ? '' : unitOf('snow', units),
        long: snow.length >= 6,
        temps: range('temp', [top?.tMinF, top?.tMaxF], units),
        wind: wind === DASH ? DASH : `${wind} ${unitOf('wind', units)}`,
        level: lvlDay ? levelStatus(lvlDay, baseFt) : null,
        levelText: levelText([b, s], units),
        models: spread ? range('snow', [spread.min, spread.max], units, true) : DASH,
        peak: false,
        summitIn: s?.snowIn ?? null,
      },
    ];
  });
  let peak = -1;
  for (const [i, d] of days.entries()) {
    if (d.summitIn !== null && d.summitIn > 0 && (peak < 0 || d.summitIn > (days[peak]?.summitIn ?? 0))) peak = i;
  }
  return days.map(({ summitIn: _, ...d }, i) => ({ ...d, peak: i === peak }));
}
