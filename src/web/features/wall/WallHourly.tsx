// The weather page's hourly block (spec §8.4): per resort its name, an hourly snowfall lane over the 48 h from the
// current hour (hourlyWindow: night shading and midnight rules come from the window, never fixed positions; a
// --text-dim now marker; one scale for every lane, 0.5″/h at least) and the 48 h total, then HTML hour ticks and the
// status line. Without an hourly model (no or stale cache, rate-limited) it shows 4 NWS day/night halves instead.
import { useMemo } from 'preact/hooks';
import { localDate, localParts } from '../../../shared/time.ts';
import type { Block, PointForecast, ResortId } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { openMeteo, openMeteoRetryAt, openMeteoStatus } from '../../data/open-meteo.ts';
import { barRects } from '../../ui/chart.ts';
import { range } from '../conditions/index.ts';
import {
  type HourlyView,
  hourlyNote,
  hourStart,
  hourTicks,
  nwsBuckets,
  nwsHalves,
  pickHourly,
} from './weather-view.ts';

interface Props {
  now: number;
  units: Units;
  pick: ResortId | null;
  forecast: Record<string, Block<PointForecast>> | undefined;
}

const Star = ({ on }: { on: boolean }) => (on ? <span aria-hidden="true">★ </span> : null);

function Lanes({ view, now, units, pick }: { view: HourlyView } & Omit<Props, 'forecast'>) {
  const w = view.window;
  const n = w.time.length;
  const nowX = (w.nowIndex ?? 0) + (localParts(now)?.minute ?? 0) / 60;
  return (
    <>
      <ul class="wall-hr-lanes">
        {view.lanes.map((l) => {
          const total = l.totalIn === null ? '—' : range('snow', [l.totalIn], units);
          return (
            <li key={l.id} class="wall-hr-lane" data-pick={l.id === pick ? 'true' : undefined}>
              <p class="wall-hr-name">
                <Star on={l.id === pick} />
                {l.name}
              </p>
              <svg
                class="wall-hr-svg"
                viewBox={`0 0 ${n} 100`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${l.name}: ${total} of snow in the next ${n} hours`}
              >
                {w.night.map(([a, b]) => (
                  <rect key={a} class="wall-hr-night" x={a} y={0} width={b - a} height={100} />
                ))}
                {w.midnights.map((p) => (
                  <line key={p} class="wall-hr-rule" x1={p} x2={p} y1={0} y2={100} />
                ))}
                {barRects(l.values, n, 100, view.max, 0.2).map((r, i) => (
                  <rect key={i} class="wall-hr-bar" x={r.x} y={r.y} width={r.width} height={r.height} />
                ))}
                <line class="wall-hr-now" x1={nowX} x2={nowX} y1={0} y2={100} />
              </svg>
              <p class="wall-hr-total num">{total}</p>
            </li>
          );
        })}
      </ul>
      <p class="wall-hr-ticks" aria-hidden="true">
        {hourTicks(w).map((t) => (
          <span key={t.left} style={{ left: `${t.left}%` }}>
            {t.label}
          </span>
        ))}
      </p>
    </>
  );
}

function Halves({ now, units, pick, forecast }: Props) {
  const halves = nwsHalves(localDate(now), localParts(now)?.hour ?? Number.NaN);
  return (
    <table class="wall-hr-nws" data-testid="wall-hourly-nws">
      <caption class="sr-only">Snow for the next 48 hours, NWS day and night halves, base–summit</caption>
      <thead>
        <tr>
          <th scope="col">
            <span class="sr-only">Resort</span>
          </th>
          {halves.map((h) => (
            <th key={`${h.date}:${h.half}`} scope="col">
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {nwsBuckets(forecast, halves, units).map((r) => (
          <tr key={r.id} data-pick={r.id === pick ? 'true' : undefined}>
            <th scope="row">
              <Star on={r.id === pick} />
              {r.name}
            </th>
            {r.cells.map((c, i) => (
              <td key={halves[i]?.label ?? i} class="num">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WallHourly(props: Props) {
  const om = openMeteo.value;
  const from = hourStart(props.now);
  // Re-sliced when the cache changes or the hour turns (a kiosk keeps this page for hours), not every 15 s render.
  const view = useMemo(() => pickHourly(om?.data, from), [om, from]);
  const note = hourlyNote(
    view,
    { at: om?.at ?? 0, status: openMeteoStatus.value, retryAt: openMeteoRetryAt.value },
    range('snow', [view?.max], props.units),
    props.now,
  );
  return (
    <div class="wall-hr" data-testid="wall-hourly" data-mode={view ? 'models' : 'nws'}>
      {view ? <Lanes view={view} now={props.now} units={props.units} pick={props.pick} /> : <Halves {...props} />}
      <p class="wall-hr-note">{note}</p>
    </div>
  );
}
