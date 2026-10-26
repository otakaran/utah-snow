// ForecastPanel (spec §8.2 `forecast`): per resort, NWS snow for today (08-16), tonight (16-08) and tomorrow
// (08-16) as base–summit ranges, the Open-Meteo model spread for today + tomorrow, summit wind, then snow level and
// summit temperatures as notes, and the AFD KEY MESSAGES (AfdNotes) in a collapsible block. Units follow the toggle.
// `compact` (the briefing teaser) drops the wind column, the level/temperature notes and the AFD for the week's
// leader line and a "Full weather →" link to #/weather. From 900 px the notes sit beside the table (conditions.css).
import { useEffect } from 'preact/hooks';
import { RESORT_IDS } from '../../../../config/resorts.ts';
import { addDays, formatLocalDate, localDate } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { type Units, unitOf } from '../../../shared/units.ts';
import { omFor, openMeteo, openMeteoRetryAt, openMeteoStatus, startOpenMeteo } from '../../data/open-meteo.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { ageText, clock } from '../../lib/format.ts';
import { weatherHref } from '../../router.ts';
import { Section } from '../../ui/Section.tsx';
import { AfdNotes } from './AfdNotes.tsx';
import { forecastRow, snowLevelNote, tempNote } from './forecast-rows.ts';
import { worstMeta } from './panel-meta.ts';
import { SourceLine } from './SourceLine.tsx';
import { leaderText, weekDates, weekLeader, weekRows } from './week-rows.ts';

export interface ForecastPanelProps {
  /** Display units (settings); stored values are imperial. Default 'imperial'. */
  units?: Units;
  /** Resorts to show, in this order. Default: all six. */
  resorts?: readonly ResortId[];
  /** Show the AFD KEY MESSAGES block. Default true. */
  afd?: boolean;
  /** Channel number in the heading ('06' on the briefing). */
  no?: string;
  /** Section data-testid (also its heading id). Default 'forecast'. */
  testId?: string;
  /** The briefing teaser: no wind column, level/temperature notes or AFD; the week's leader and a link instead. */
  compact?: boolean;
}

const rangesNote = (units: Units, wd: string): string =>
  `Snow in ${units === 'metric' ? 'cm' : 'inches'}, base to summit: today 8 AM–4 PM, tonight 4 PM–8 AM, ${wd} 8 AM–4 PM.`;
const BLANK_NOTE = '— = NWS grid not reported.';

function ModelsNote({ now, wd }: { now: number; wd: string }) {
  const om = openMeteo.value;
  const status = openMeteoStatus.value;
  const retry = openMeteoRetryAt.value;
  if (!om) return status === 'loading' ? <p class="cond-note">Models: loading Open-Meteo…</p> : null;
  const age = ageText((now - om.at) / 60_000);
  const held = retry > now ? `; Open-Meteo is rate-limited, next try ${clock(retry)}` : '';
  return (
    <p class="cond-note">
      Models: range of 4 Open-Meteo models (HRRR, NBM, ECMWF, GFS) for today + {wd}, updated {age}
      {held}.
    </p>
  );
}

export function ForecastPanel({
  units = 'imperial',
  resorts = RESORT_IDS,
  afd = true,
  no,
  testId = 'forecast',
  compact = false,
}: ForecastPanelProps) {
  useEffect(() => startOpenMeteo(), []);
  const snap = snapshot.value;
  const now = serverNow.value;
  const today = localDate(now);
  const dates = { today, tomorrow: today ? addDays(today, 1) : '' };
  const om = openMeteo.value;
  const rows = resorts.map((id) =>
    forecastRow(
      id,
      snap?.forecast[`${id}:base`]?.data,
      snap?.forecast[`${id}:summit`]?.data,
      dates,
      units,
      omFor(om?.data, id)?.daily,
    ),
  );
  const fresh = worstMeta(
    resorts.flatMap((id) => [snap?.forecast[`${id}:base`]?.meta, snap?.forecast[`${id}:summit`]?.meta]),
    now,
  );
  const wd = dates.tomorrow ? formatLocalDate(dates.tomorrow, 'weekday') : 'tomorrow';
  const blank = rows.some((r) => [r.today, r.tonight, r.tomorrow].every((v) => v === '—'));
  const notes = [
    rangesNote(units, wd),
    blank ? BLANK_NOTE : '',
    compact ? '' : snowLevelNote(rows, units),
    compact ? '' : tempNote(rows, units),
  ].filter(Boolean);
  const lead = compact
    ? leaderText(weekLeader(weekRows(snap?.forecast, weekDates(today), units, om?.data)), today)
    : null;
  const snowUnit = unitOf('snow', units);
  return (
    <Section
      testid={testId}
      title="Forecast"
      index={no}
      class="cond-fc"
      sub={<SourceLine source="NWS" fresh={fresh} />}
    >
      {snap ? (
        <div class="cond-card cond-fc-card">
          <table class="cond-fc-table" aria-label={`Snow forecast per resort, base to summit, in ${snowUnit}`}>
            <thead>
              <tr>
                <th scope="col">Resort</th>
                <th scope="col">Today</th>
                <th scope="col">Tonight</th>
                <th scope="col">{wd}</th>
                <th scope="col">Models</th>
                {compact ? null : <th scope="col">Wind {unitOf('wind', units)}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="forecast-row" data-resort={r.id}>
                  <th scope="row">{r.name}</th>
                  <td class="cond-fc-snow">{r.today}</td>
                  <td class="cond-fc-snow">{r.tonight}</td>
                  <td class="cond-fc-snow">{r.tomorrow}</td>
                  <td>{r.models}</td>
                  {compact ? null : <td>{r.wind}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div class="cond-fc-notes">
            {lead ? (
              <p class="cond-fc-lead">
                <span class="cond-dim">This week · </span>
                {lead}
              </p>
            ) : null}
            {notes.map((n) => (
              <p key={n} class="cond-note">
                {n}
              </p>
            ))}
            <ModelsNote now={now} wd={wd} />
            {afd && !compact ? <AfdNotes now={now} /> : null}
            {compact ? (
              <a class="cond-link" href={weatherHref()}>
                Full weather →
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <p class="cond-empty">Loading forecast…</p>
      )}
    </Section>
  );
}
