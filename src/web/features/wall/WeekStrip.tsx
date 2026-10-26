// The wall's 7-day week strip (spec §8.4) across the band under the cam grid: one column per resort with its name
// (★ for the crew pick), the NWS week total base–summit, 7 summit bars on one scale for the whole strip (6″ floor)
// and the day initials. The week's storm day (the biggest summit day of any resort) is marked in every column: its
// bar in --snow, its initial lit and capped. The full table lives on the weather page (WallWeather).
import { formatLocalDate } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { barFractions, range, type WeekRow } from '../conditions/index.ts';
import { dayInitial } from './weather-view.ts';

interface Props {
  rows: readonly WeekRow[];
  /** The storm day (stormDay) or null on a dry week. */
  storm: string | null;
  pick: ResortId | null;
  units: Units;
}

/** The column's spoken value: name, week total and every day's base–summit range. */
function label(r: WeekRow, pick: boolean, units: Units): string {
  const days = r.days.map(
    (d) => `${formatLocalDate(d.date, 'weekday')} ${range('snow', [d.baseIn, d.summitIn], units)}`,
  );
  return `${pick ? "Today's pick: " : ''}${r.name}, week ${r.total.text}: ${days.join(', ')}`;
}

export function WeekStrip({ rows, storm, pick, units }: Props) {
  const top = Math.max(6, ...rows.flatMap((r) => r.days.map((d) => d.summitIn ?? 0)));
  return (
    <section class="wall-week" data-testid="wall-snow" aria-labelledby="wall-week-title">
      <h2 id="wall-week-title" class="sr-only">
        Snow this week · NWS base–summit
      </h2>
      <div class="wall-week-cols">
        {rows.map((r) => {
          const isPick = r.id === pick;
          const bars = barFractions(
            r.days.map((d) => d.summitIn),
            top,
          );
          return (
            <div
              key={r.id}
              class="wall-week-col"
              role="img"
              aria-label={label(r, isPick, units)}
              data-testid="wall-week-col"
              data-resort={r.id}
              data-pick={isPick ? 'true' : undefined}
            >
              <p class="wall-week-name">
                {isPick ? <span aria-hidden="true">★ </span> : null}
                {r.name}
              </p>
              <p class="wall-week-total num">{r.total.text}</p>
              <svg class="wall-week-bars" viewBox="0 0 7 1" preserveAspectRatio="none" aria-hidden="true">
                {bars.map((f, i) => (
                  <rect
                    key={r.days[i]?.date ?? i}
                    class={r.days[i]?.date === storm ? 'wall-week-storm' : undefined}
                    x={i + 0.15}
                    y={1 - f}
                    width={0.7}
                    height={f}
                  />
                ))}
              </svg>
              <p class="wall-week-days" aria-hidden="true">
                {r.days.map((d) => (
                  <span key={d.date} data-date={d.date} data-storm={d.date === storm ? 'true' : undefined}>
                    {dayInitial(d.date)}
                  </span>
                ))}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
