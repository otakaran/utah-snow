// §01 "This week" (concept B): the leader sentence, then six resort lanes on one 7-day axis. Summit snow per day
// (the storm day lit in every lane; from 600 px each day splits into its 6 AM–6 PM and 6 PM–6 AM halves), the
// week's base–summit total on the right, ★ on the crew pick, the leader in accent; a name opens its outlook.
import { RESORT_IDS } from '../../../../config/resorts.ts';
import type { ResortId, Snapshot } from '../../../shared/types.ts';
import { weatherHref } from '../../router.ts';
import { Bars, HRule, Plot, VRule } from '../../ui/Chart.tsx';
import { Section } from '../../ui/Section.tsx';
import { peakWhen, SourceLine, type WeekRow, weekLeader, worstMeta } from '../conditions/index.ts';
import { type Lane, type WeekView, weekView } from './week-view.ts';

const H = 40;

interface Props {
  rows: readonly WeekRow[];
  snap: Snapshot | null;
  today: string;
  now: number;
  pick: ResortId | null;
  /** A lane name was tapped (the page scrolls to that resort's outlook). */
  onPick: (id: ResortId) => void;
}

function Headline({ rows, today, known }: { rows: readonly WeekRow[]; today: string; known: boolean }) {
  const leader = weekLeader(rows);
  if (!leader) {
    return <p class="wx-lead">{known ? 'No resort shows measurable snow this week.' : 'No NWS forecast yet.'}</p>;
  }
  const when = peakWhen(leader.peakDate, leader.peakHalf, today);
  return (
    <p class="wx-lead">
      Most snow: <em>{leader.name}</em> <b class="num">{leader.text}</b>
      {when ? `, peaking ${when}` : ''}
    </p>
  );
}

function LaneRow({ l, v, onPick }: { l: Lane; v: WeekView; onPick: (id: ResortId) => void }) {
  const n = v.labels.length;
  const cls = (i: number) => (i === v.storm ? 'chart-bar' : 'chart-bar-dim');
  const name = ['wx-nm', l.lead ? 'is-lead' : ''].filter(Boolean).join(' ');
  return (
    <li class="wx-lane" data-resort={l.id}>
      <a class={name} href={weatherHref(l.id)} onClick={() => onPick(l.id)}>
        {l.pick ? (
          <>
            <span class="wx-star" aria-hidden="true">
              ★
            </span>
            <span class="sr-only">Today's pick: </span>
          </>
        ) : null}
        {l.name}
      </a>
      <Plot h={H} class="wx-week-plot">
        {v.labels.slice(1).map((d, i) => (
          <VRule key={d.date} at={i + 1} n={n} h={H} edge />
        ))}
        <HRule value={0} min={0} max={1} h={H} class="chart-rule" />
        <g class="wx-one">
          <Bars values={l.summit} h={H} max={v.max} gap={0.4} cls={cls} />
        </g>
        <g class="wx-two">
          <Bars values={l.day} pair={l.night} h={H} max={v.pairMax} gap={0.3} cls={cls} />
        </g>
      </Plot>
      <span class="wx-tot num">
        {l.total}
        {l.peak ? <span class="sr-only">, most {l.peak}</span> : null}
      </span>
    </li>
  );
}

export function WeekPanel({ rows, snap, today, now, pick, onPick }: Props) {
  const fresh = worstMeta(
    RESORT_IDS.flatMap((id) => [snap?.forecast[`${id}:base`]?.meta, snap?.forecast[`${id}:summit`]?.meta]),
    now,
  );
  const v = weekView(rows, snap?.forecast, today, pick);
  return (
    <Section testid="week" title="This week" index="01" sub={<SourceLine source="NWS" fresh={fresh} />}>
      {snap ? (
        <div class="wx-card">
          <p class="wx-kicker">Week ahead · six resorts on one axis · summit snow</p>
          <Headline rows={rows} today={today} known={v.known} />
          <div class="wx-lanes">
            <div class="wx-lane wx-axis" aria-hidden="true">
              <span />
              <span class="wx-days">
                {v.labels.map((d) => (
                  <span key={d.date} class={[d.storm ? 'is-storm' : '', d.thin ? 'is-thin' : ''].join(' ').trim()}>
                    {d.text}
                  </span>
                ))}
              </span>
              <span class="wx-tot">Week</span>
            </div>
            <ol class="wx-lane-list" aria-label="Summit snow per day this week, and the week's base to summit total">
              {v.lanes.map((l) => (
                <LaneRow key={l.id} l={l} v={v} onPick={onPick} />
              ))}
            </ol>
          </div>
          <p class="wx-note">
            Bars: summit snow per day
            <span class="wx-two-note">, day (6 AM–6 PM) then night (6 PM–6 AM)</span>; the lit day is the storm peak.
            Right: the 7-day total, base to summit. Tap a name for its outlook.
          </p>
        </div>
      ) : (
        <p class="wx-empty">Loading forecast…</p>
      )}
    </Section>
  );
}
