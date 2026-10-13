// ModelTable (spec §8.7.5, C.5): HRRR, NBM, ECMWF and GFS side by side for one resort, from the shared Open-Meteo
// cache at the resort's array index. Rows are today, tomorrow and the day after; each cell is the model's daily
// snowfall with its high / low under it. Blank cells ('—') are days or fields a model does not cover.
import { useEffect } from 'preact/hooks';
import { RESORTS } from '../../../../config/resorts.ts';
import type { ResortId } from '../../../shared/types.ts';
import { mToFt, type Units, unitOf } from '../../../shared/units.ts';
import {
  OM_MODELS,
  omFor,
  openMeteo,
  openMeteoRetryAt,
  openMeteoStatus,
  startOpenMeteo,
} from '../../data/open-meteo.ts';
import { ageText, clock, qty } from '../../lib/format.ts';
import { MODEL_LABEL, modelRows } from './model-rows.ts';

export interface ModelTableProps {
  id: ResortId;
  /** Denver date 'YYYY-MM-DD' of the first row. */
  today: string;
  /** Server-time ms (ages, the rate-limit notice). */
  now: number;
  /** Display units (settings); stored values are imperial. Default 'imperial'. */
  units?: Units;
}

const external = { target: '_blank', rel: 'noreferrer' } as const;

function Status({ at, now }: { at: number; now: number }) {
  const retry = openMeteoRetryAt.value;
  const held = retry > now ? `; Open-Meteo is rate-limited, next try ${clock(retry)}` : '';
  return (
    <p class="cond-note">
      Updated {ageText((now - at) / 60_000)}
      {held}. Weather data by{' '}
      <a href="https://open-meteo.com/" {...external}>
        Open-Meteo.com
      </a>{' '}
      (CC BY 4.0).
    </p>
  );
}

export function ModelTable({ id, today, now, units = 'imperial' }: ModelTableProps) {
  useEffect(() => startOpenMeteo(), []);
  const om = openMeteo.value;
  const status = openMeteoStatus.value;
  const point = qty('elevation', mToFt(RESORTS[id].openMeteo.elevM), units);
  const rows = om ? modelRows(omFor(om.data, id), today, units) : [];
  return (
    <div class="cond-card cond-mt" data-testid="model-table">
      <h3 class="cond-mt-h">
        Models <span class="cond-dim">· Open-Meteo point at {point}</span>
      </h3>
      {rows.length === 0 ? (
        <p class="cond-empty">
          {status === 'error' || status === 'rate-limited' ? 'Model forecast unavailable.' : 'Loading models…'}
        </p>
      ) : (
        <div class="cond-mt-wrap">
          <table
            class="cond-mt-table"
            aria-label={`Model snowfall in ${unitOf('snow', units)} with high / low in ${unitOf('temp', units)}`}
          >
            <thead>
              <tr>
                <th scope="col">Day</th>
                {OM_MODELS.map((m) => (
                  <th key={m} scope="col" data-model={m}>
                    {MODEL_LABEL[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} data-date={r.date}>
                  <th scope="row">{r.label}</th>
                  {r.cells.map((c) => (
                    <td key={c.model} class="cond-num" data-model={c.model}>
                      <span class={c.dry || c.snow === '—' ? 'cond-mt-snow is-dry' : 'cond-mt-snow'}>{c.snow}</span>
                      <span class="cond-mt-t">{c.temps}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p class="cond-note">
        Daily snowfall, then the high / low in {unitOf('temp', units)}. HRRR reaches about 48 h, so its later days stay
        blank.
      </p>
      {om ? <Status at={om.at} now={now} /> : null}
    </div>
  );
}
