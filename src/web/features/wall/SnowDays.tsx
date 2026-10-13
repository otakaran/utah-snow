// The wall's 3-day snow mini-table (spec §8.4): NWS snow per resort for today and the next two local dates, as
// base–summit ranges. It runs across the band under the cam grid (resorts as columns), since the 1fr sidebar has no
// room left at the wall's type scale.
import { addDays, formatLocalDate, localDate } from '../../../shared/time.ts';
import { units } from '../../data/settings.ts';
import { snapshot } from '../../data/snapshot.ts';
import { snowDays } from './snow-days.ts';

export function SnowDays({ now }: { now: number }) {
  const u = units.value;
  const today = localDate(now);
  if (!today) return null;
  const dates = [today, addDays(today, 1), addDays(today, 2)];
  const rows = snowDays(snapshot.value?.forecast, dates, u);
  return (
    <section class="wall-snow" data-testid="wall-snow" aria-labelledby="wall-snow-title">
      <table class="wall-snow-table">
        <caption id="wall-snow-title">Snow forecast · NWS base–summit, {u === 'metric' ? 'cm' : 'in'}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span class="sr-only">Day</span>
            </th>
            {rows.map((r) => (
              <th key={r.id} scope="col">
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((d, i) => (
            <tr key={d}>
              <th scope="row">{i === 0 ? 'Today' : formatLocalDate(d, 'weekday')}</th>
              {rows.map((r) => (
                <td key={r.id} class="num">
                  {r.cells[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
