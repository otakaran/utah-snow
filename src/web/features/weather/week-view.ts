// Pure view of the §01 lanes (concept B): one 7-day axis for all six resorts. The day labels (every other one is
// `thin`, hidden on phones, phased so the storm day keeps its label; the storm day is underlined), per lane the
// summit snow per day plus its day (6 AM–6 PM) / night (6 PM–6 AM) halves for the 600 px split, the week total,
// the ★ pick and the leader, all on one shared scale.
import { formatLocalDate } from '../../../shared/time.ts';
import type { Block, PointForecast, ResortId } from '../../../shared/types.ts';
import { niceMax } from '../../ui/chart.ts';
import { dayOf, gridRow, peakWhen, stormDay, type WeekRow, weekLeader } from '../conditions/index.ts';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown): number | null => (finite(v) ? v : null);

export interface DayLabel {
  date: string;
  text: string;
  storm: boolean;
  /** Hidden on phones (every other day). */
  thin: boolean;
}

export interface Lane {
  id: ResortId;
  name: string;
  pick: boolean;
  lead: boolean;
  summit: (number | null)[];
  day: (number | null)[];
  night: (number | null)[];
  /** Week total, base–summit with the unit ('3–10″', '—'). */
  total: string;
  /** For screen readers: when this resort's snow peaks ('Thu night'), null without snow. */
  peak: string | null;
}

export interface WeekView {
  labels: DayLabel[];
  /** Index of the storm day (the biggest summit day of any resort), null without snow. */
  storm: number | null;
  /** Shared scale top for the whole-day bars (inches, at least 6). */
  max: number;
  /** Shared scale top for the day/night halves (inches, at least 6). */
  pairMax: number;
  lanes: Lane[];
  /** Some resort has a forecast value (false: every row is a placeholder). */
  known: boolean;
}

type Forecasts = Record<string, Block<PointForecast>> | undefined;

export function weekView(
  rows: readonly WeekRow[],
  forecast: Forecasts,
  today: string,
  pick: ResortId | null,
): WeekView {
  const dates = rows[0]?.days.map((d) => d.date) ?? [];
  const storm = stormDay(rows);
  const si = storm ? dates.indexOf(storm.date) : -1;
  const phase = si > 0 ? si % 2 : 0;
  const labels = dates.map((date, i) => ({
    date,
    text: date === today ? 'Today' : formatLocalDate(date, 'weekday'),
    storm: i === si,
    thin: i % 2 !== phase,
  }));
  const leader = weekLeader(rows)?.id ?? null;
  const lanes = rows.map((r): Lane => {
    const summit = gridRow(forecast?.[`${r.id}:summit`]?.data);
    return {
      id: r.id,
      name: r.name,
      pick: r.id === pick,
      lead: r.id === leader,
      summit: r.days.map((d) => d.summitIn),
      day: r.days.map((d) => num(dayOf(summit, d.date)?.snowDayIn)),
      night: r.days.map((d) => num(dayOf(summit, d.date)?.snowNightIn)),
      total: r.total.text,
      peak: peakWhen(r.peakDate, r.peakHalf, today),
    };
  });
  return {
    labels,
    storm: si >= 0 ? si : null,
    max: niceMax(
      lanes.flatMap((l) => l.summit),
      6,
    ),
    pairMax: niceMax(
      lanes.flatMap((l) => [...l.day, ...l.night]),
      6,
    ),
    lanes,
    known: rows.some((r) => r.days.some((d) => d.summitIn !== null || d.baseIn !== null)),
  };
}
