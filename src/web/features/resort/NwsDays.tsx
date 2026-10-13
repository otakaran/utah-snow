// NWS 3-day point forecast for one resort point (spec §8.7.5): day/night snow split, temperatures, wind and the
// snow level judged against the point's true elevation (the grid cell's elevation differs, so both are shown).
import { addDays, formatLocalDate } from '../../../shared/time.ts';
import type { Block, NwsDay, PointForecast } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { clockRel, qty } from '../../lib/format.ts';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { forecastData, levelStatus } from './resort-model.ts';

interface Props {
  label: string;
  block: Block<PointForecast> | undefined;
  today: string;
  now: number;
  units: Units;
}

function dayName(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return formatLocalDate(date, 'weekday');
}

function range(lo: number | null, hi: number | null, kind: 'temp' | 'snowLevel', units: Units): string {
  if (lo === null && hi === null) return '—';
  if (lo === null || hi === null || lo === hi) return qty(kind, hi ?? lo, units);
  return `${qty(kind, lo, units)}–${qty(kind, hi, units)}`;
}

function DayRow({ d, today, elevFt, units }: { d: NwsDay; today: string; elevFt: number; units: Units }) {
  const lvl = levelStatus(d, elevFt);
  return (
    <tr>
      <th scope="row">{dayName(d.date, today)}</th>
      <td class="rs-num rs-snow">
        {qty('snow', d.snowDayIn, units)} <span class="rs-dim">/</span> {qty('snow', d.snowNightIn, units)}
      </td>
      <td class="rs-num">{range(d.tMinF, d.tMaxF, 'temp', units)}</td>
      <td class="rs-num">
        {qty('wind', d.windMaxMph, units)}
        {d.gustMaxMph !== null ? <span class="rs-dim"> g{qty('wind', d.gustMaxMph, units)}</span> : null}
      </td>
      <td>
        <span class="rs-num">{range(d.snowLevelMinFt, d.snowLevelMaxFt, 'snowLevel', units)}</span>
        {lvl ? <StatusChip tone={lvl.tone} word={lvl.word} /> : null}
      </td>
    </tr>
  );
}

export function NwsDays({ label, block, today, now, units }: Props) {
  const f = forecastData(block?.data);
  const days = (f?.days ?? []).filter((d) => d.date >= today).slice(0, 3);
  return (
    <div class="rs-card">
      <h3 class="rs-h3">
        NWS {label}{' '}
        {f ? (
          <span class="rs-dim">
            · {qty('elevation', f.trueElevFt, units)} (grid cell {qty('elevation', f.gridElevFt, units)}) · issued{' '}
            {clockRel(f.updateTime, now)}
          </span>
        ) : null}
      </h3>
      {days.length === 0 ? (
        <p class="rs-dim">No NWS forecast for this point yet.</p>
      ) : (
        <div class="rs-table-wrap">
          <table class="rs-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Snow day / night</th>
                <th scope="col">Lo–Hi</th>
                <th scope="col">Wind</th>
                <th scope="col">Snow level</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <DayRow key={d.date} d={d} today={today} elevFt={f?.trueElevFt ?? 0} units={units} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {f ? (
        <p class="rs-dim rs-small">
          Tonight {qty('snow', f.tonightSnowIn, units)} (16:00–08:00) · tomorrow daytime{' '}
          {qty('snow', f.tomorrowDaytimeSnowIn, units)}
        </p>
      ) : null}
    </div>
  );
}
