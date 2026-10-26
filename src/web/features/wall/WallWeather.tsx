// The wall's full-screen weather page (spec §8.4): after every `wx` cam pages it takes the left 3fr for one `rotate`
// period (Wall.tsx, rotation.ts wxSequence) while the sidebar stays. Read from 3 m, top to bottom: the headline band
// (kicker with the NWS age, then the storm callout, DRY WEEK or NO NWS FORECAST), the 7-day NWS table (base–summit
// per resort and day, washed by summit snow, the storm day underlined, the pick row in --accent), the 48 h hourly
// block (WallHourly) and its status line, and the turn bar (left out while paused). NWS feeds all but the lanes.
import { RESORT_IDS } from '../../../../config/resorts.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { Block, PointForecast, ResortId } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { ageText } from '../../lib/format.ts';
import { range, type WeekRow, worstMeta } from '../conditions/index.ts';
import { Turn } from './Turn.tsx';
import { WallHourly } from './WallHourly.tsx';
import { dayWash, type StormHeadline, weekHeadline } from './weather-view.ts';

interface Props {
  rows: readonly WeekRow[];
  storm: StormHeadline | null;
  pick: ResortId | null;
  units: Units;
  now: number;
  forecast: Record<string, Block<PointForecast>> | undefined;
  /** The turn bar's key (one per rotation step), null while paused; it fills over `rotate` seconds. */
  turn: string | null;
  rotate: number;
}

const Star = ({ on }: { on: boolean }) => (on ? <span aria-hidden="true">★ </span> : null);

function WeekTable({ rows, storm, pick, units }: Pick<Props, 'rows' | 'storm' | 'pick' | 'units'>) {
  const wash = dayWash(rows);
  const dates = rows[0]?.days.map((d) => d.date) ?? [];
  const stormCell = (id: ResortId, date: string) => storm !== null && storm.id === id && storm.date === date;
  return (
    <table class="wall-wx-week" data-testid="wall-wx-week">
      <caption class="sr-only">Snow per day for the next 7 days, NWS base–summit</caption>
      <thead>
        <tr>
          <th scope="col">
            <span class="sr-only">Resort</span>
          </th>
          {dates.map((d, i) => (
            <th key={d} scope="col" data-storm={d === storm?.date ? 'true' : undefined}>
              {i === 0 ? 'Today' : formatLocalDate(d, 'weekday')}
            </th>
          ))}
          <th scope="col" class="wall-wx-sum">
            Week
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={r.id} data-pick={r.id === pick ? 'true' : undefined}>
            <th scope="row">
              <Star on={r.id === pick} />
              {r.name}
            </th>
            {r.days.map((d, di) => (
              <td
                key={d.date}
                class="num"
                style={{ '--h': (wash[ri]?.[di] ?? 0).toFixed(2) }}
                data-storm={stormCell(r.id, d.date) ? 'true' : undefined}
              >
                {range('snow', [d.baseIn, d.summitIn], units, true)}
              </td>
            ))}
            <td class="num wall-wx-sum">{range('snow', [r.total.baseIn, r.total.summitIn], units, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WallWeather(props: Props) {
  const { storm, units, now, forecast, turn, rotate } = props;
  const fresh = worstMeta(
    RESORT_IDS.flatMap((id) => [forecast?.[`${id}:base`]?.meta, forecast?.[`${id}:summit`]?.meta]),
    now,
  );
  const unit = units === 'metric' ? 'cm' : 'in';
  return (
    <section class="wall-wx" data-testid="wall-weather" aria-labelledby="wall-wx-title">
      <header class="wall-wx-head">
        <h2 id="wall-wx-title" class="wall-wx-kicker">
          Week ahead · NWS base–summit, {unit}
          {fresh ? ` · updated ${ageText(fresh.age)}` : null}
        </h2>
        <p class="wall-wx-storm num" data-testid="wall-wx-storm">
          {weekHeadline(props.rows, storm)}
        </p>
      </header>
      <WeekTable {...props} />
      <WallHourly now={now} units={units} pick={props.pick} forecast={forecast} />
      {turn ? <Turn key={turn} s={rotate} /> : null}
    </section>
  );
}
