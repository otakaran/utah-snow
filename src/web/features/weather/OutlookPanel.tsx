// §02 "{Resort} · 8-day outlook" (concept B day columns): one card per day from today with the big base–summit
// snow, summit Lo–Hi and wind, the snow level chip against the true base, and the Open-Meteo model spread. Cards
// scroll-snap sideways on phones and sit in a 4-column grid from 600 px.
import { RESORTS } from '../../../../config/resorts.ts';
import type { ResortId, Snapshot } from '../../../shared/types.ts';
import { fmt, type Units } from '../../../shared/units.ts';
import { type OmData, omFor } from '../../data/open-meteo.ts';
import { clockRel } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { gridRow, SourceLine, worstMeta } from '../conditions/index.ts';
import { type OutlookDay, outlookDays } from './outlook-rows.ts';

interface Props {
  id: ResortId;
  snap: Snapshot | null;
  today: string;
  now: number;
  units: Units;
  om: OmData | null;
}

function Card({ d }: { d: OutlookDay }) {
  return (
    <li class={d.peak ? 'wx-col is-peak' : 'wx-col'} data-date={d.date}>
      <p class="wx-dy">
        <b>{d.label}</b> {d.dayNum}
      </p>
      <p class={d.long ? 'wx-big num snow is-long' : 'wx-big num snow'}>
        {d.snow}
        {d.unit ? <small>{d.unit}</small> : null}
      </p>
      <dl class="wx-rows">
        <div>
          <dt>Lo–Hi</dt>
          <dd class="num">{d.temps}</dd>
        </div>
        <div>
          <dt>Wind</dt>
          <dd class="num">{d.wind}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd title={d.levelText}>
            {d.level ? <StatusChip tone={d.level.tone} word={d.level.word} title={d.levelText} /> : d.levelText}
          </dd>
        </div>
        <div>
          <dt>Models</dt>
          <dd class="num">{d.models}</dd>
        </div>
      </dl>
    </li>
  );
}

export function OutlookPanel({ id, snap, today, now, units, om }: Props) {
  const r = RESORTS[id];
  const base = snap?.forecast[`${id}:base`];
  const summit = snap?.forecast[`${id}:summit`];
  const days = snap ? outlookDays(id, base?.data, summit?.data, today, units, omFor(om?.data, id)?.daily) : null;
  const issued = gridRow(summit?.data)?.updateTime ?? gridRow(base?.data)?.updateTime;
  const sub = (
    <>
      <SourceLine source="NWS" fresh={worstMeta([base?.meta, summit?.meta], now)} />
      {issued ? <span class="wx-issued"> · issued {clockRel(issued, now)}</span> : null}
    </>
  );
  const unit = units === 'metric' ? 'cm' : 'inches';
  return (
    <Section testid="outlook" title={`${r.name} · 8-day outlook`} index="02" sub={sub}>
      {!snap ? (
        <p class="wx-empty">Loading forecast…</p>
      ) : !days?.length ? (
        <p class="wx-empty">No NWS forecast for {r.name} yet.</p>
      ) : (
        <div class="wx-card">
          <ol class="wx-cols" aria-label={`${r.name}: snow per day, base to summit, in ${unit}`}>
            {days.map((d) => (
              <Card key={d.date} d={d} />
            ))}
          </ol>
          <p class="wx-note">
            Snow in {unit}, base ({fmt('elevation', r.base.ft, units).text}) to summit (
            {fmt('elevation', r.summit.ft, units).text}); Lo–Hi and wind at the summit. Level: the snow level against
            the base. Models: the Open-Meteo range for the day.<span class="wx-one-note"> Swipe for later days.</span>
          </p>
        </div>
      )}
    </Section>
  );
}
