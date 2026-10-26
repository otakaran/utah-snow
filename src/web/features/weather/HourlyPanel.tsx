// §03 "{Resort} · next 48 hours": the Open-Meteo lanes (HourlyLanes) from the current Denver hour, a legend, the
// every-3-hours table in a <details>, and the source line. Plain-text states while the shared cache loads, is
// empty or unavailable (with the 429 next-try clock, as ModelTable), or predates the current hour.
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate, localParts } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { type Units, unitOf } from '../../../shared/units.ts';
import { type OmData, type OmStatus, omFor, omMeta } from '../../data/open-meteo.ts';
import { ageText, clock } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { hourlySummary, hourlyTable, hourlyWindow, MODEL_LABEL, SourceLine, worstMeta } from '../conditions/index.ts';
import { HourlyLanes } from './HourlyLanes.tsx';
import { type HourlyView, hourlyView, tableRows } from './hourly-view.ts';

interface Props {
  id: ResortId;
  now: number;
  units: Units;
  om: OmData | null;
  status: OmStatus;
  /** Server-time ms until which a 429 holds Open-Meteo back (0 = none). */
  retryAt: number;
}

const HOURS = 48;

function Legend({ v }: { v: HourlyView }) {
  const model = v.snow ? MODEL_LABEL[v.snow.model] : null;
  return (
    <ul class="chart-key">
      {model ? (
        <li>
          <i class="k-snow" />
          {model} snow per hour
        </li>
      ) : null}
      {v.snow ? (
        <li>
          <i class="k-band" />
          model spread
        </li>
      ) : null}
      {v.temp ? (
        <li>
          <i class="k-line" />
          temperature
        </li>
      ) : null}
      {v.frz ? (
        <li>
          <i class="k-alt" />
          freezing level
        </li>
      ) : null}
      {v.wind ? (
        <>
          <li>
            <i class="k-dim" />
            wind
          </li>
          <li>
            <i class="k-gust" />
            gusts
          </li>
        </>
      ) : null}
      <li>
        <i class="k-night" />
        night
      </li>
      <li>
        <i class="k-now" />
        now
      </li>
    </ul>
  );
}

function Table({ rows, units, name }: { rows: ReturnType<typeof tableRows>; units: Units; name: string }) {
  return (
    <details class="wx-more">
      <summary class="disclosure">Every 3 hours</summary>
      <div class="wx-wrap">
        <table class="wx-table" aria-label={`${name}, every 3 hours`}>
          <thead>
            <tr>
              <th scope="col">Hour</th>
              <th scope="col">Snow {unitOf('snow', units)}</th>
              <th scope="col">Temp</th>
              <th scope="col">Wind {unitOf('wind', units)}</th>
              <th scope="col">Freezing level</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.time} data-testid="hourly-row">
                <th scope="row">{r.time}</th>
                <td class="wx-snow">{r.snow}</td>
                <td>{r.temp}</td>
                <td>{r.wind}</td>
                <td>{r.frz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function HourlyPanel({ id, now, units, om, status, retryAt }: Props) {
  const name = RESORTS[id].name;
  const loc = omFor(om?.data, id);
  const p = localParts(now);
  const win = p ? hourlyWindow(loc, `${p.date}T${p.hm.slice(0, 2)}:00`, HOURS) : null;
  const v = win ? hourlyView(loc, win, id, units) : null;
  const held = retryAt > now ? ` Open-Meteo is rate-limited, next try ${clock(retryAt)}.` : '';
  const failed = status === 'error' || status === 'rate-limited';
  let state: string | null = null;
  if (!om) state = failed ? `Hourly models unavailable.${held}` : 'Loading hourly models…';
  else if (!loc?.hourly?.time?.length) state = `Hourly models unavailable.${held}`;
  else if (!win) state = `Hourly data is from ${formatLocalDate(om.at, 'short')}; refreshing.`;
  else if (!v?.snow && !v?.temp && !v?.wind) state = `Hourly models unavailable.${held}`;
  const sub = <SourceLine source="Open-Meteo" fresh={worstMeta([omMeta(om, status, now)], now)} />;
  return (
    <Section testid="hourly" title={`${name} · next ${win?.idx.length || HOURS} hours`} index="03" sub={sub}>
      {state || !v || !win || !om ? (
        <p class="wx-empty">{state}</p>
      ) : (
        <div class="wx-card">
          <HourlyLanes v={v} label={hourlySummary(loc, win.idx, id, units)} />
          <Legend v={v} />
          <Table rows={tableRows(hourlyTable(loc, win.idx, 3), units)} units={units} name={name} />
          <p class="wx-note">
            {v.snow ? `Bars: ${MODEL_LABEL[v.snow.model]}; the band spans the models that report each hour. ` : ''}
            Freezing level: HRRR, then GFS past the dashed seam. Open-Meteo, updated {ageText((now - om.at) / 60_000)}.
            {held}
          </p>
        </div>
      )}
    </Section>
  );
}
