// ResortCard (spec §8.2 `resorts`): hero still, overnight / 24 h / base, days left, drive with live delay, lifts and
// trails, summit wind, parking chip, freshness and a link to #/resort/:id. Pre-season hides the snow numbers, lifts
// and trails, and counts the days to the projected opening. The picked resort gets the "Today's pick" outline and
// flag. The hero still comes in as a slot (the cams feature). A flex column, so every card's foot lines up.
import type { ComponentChildren } from 'preact';
import { RESORTS } from '../../../../config/resorts.ts';
import { ageMin, badge } from '../../../shared/freshness.ts';
import { parkingCal } from '../../../shared/parking.ts';
import { localDate } from '../../../shared/time.ts';
import type { Block, ResortId, ResortSnapshot } from '../../../shared/types.ts';
import { fmt, type Units } from '../../../shared/units.ts';
import { clockRel } from '../../lib/format.ts';
import { Countdown } from '../../ui/Countdown.tsx';
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { type DaysPart, liftsText, preseasonLine, resortStatus, trailsText, windText } from './resort-facts.ts';

export interface ResortCardProps {
  id: ResortId;
  block: Block<ResortSnapshot> | undefined;
  now: number;
  units: Units;
  isPick: boolean;
  /** Local date the parking rules apply to (the pick's target date). */
  date: string;
  drive: string;
  daysLeft: DaysPart[];
  hero: ComponentChildren;
}

/** '6 me · 4 crew min', each number first. */
function DaysLeft({ parts }: { parts: DaysPart[] }) {
  return (
    <>
      {parts.map((x, i) => (
        <span key={x.label}>
          {i > 0 ? ' · ' : ''}
          {x.n === null ? null : <span class="num">{x.n} </span>}
          {x.label}
        </span>
      ))}
    </>
  );
}

function PreSeason({ id, now }: { id: ResortId; now: number }) {
  const open = RESORTS[id].projectedOpen;
  return (
    <div class="rc-pre">
      {open ? <Countdown today={localDate(now)} to={open} word="to opening" /> : null}
      <p>{preseasonLine(id)}</p>
    </div>
  );
}

function Snow({ data, units, now }: { data: Partial<ResortSnapshot> | null; units: Units; now: number }) {
  const s = data?.snow;
  const old = s?.reportIsToday === false; // yesterday's overnight is not this morning's
  const big = fmt('snow', old ? null : s?.overnightIn, units);
  return (
    <dl class="rc-snow">
      {old ? (
        <div class="rc-old">
          <dt>Last report</dt>
          <dd>{clockRel(s?.reportAt, now)}</dd>
        </div>
      ) : null}
      <div class="rc-snow-main">
        <dt>Overnight</dt>
        <dd class="num rc-big">
          {big.value}
          {big.unit ? <span class="rc-unit">{big.unit}</span> : null}
        </dd>
      </div>
      <div>
        <dt>24 h</dt>
        <dd class="num">{fmt('snow', s?.new24hIn, units).text}</dd>
      </div>
      <div>
        <dt>Base</dt>
        <dd class="num">{fmt('snow', s?.baseDepthIn, units).text}</dd>
      </div>
    </dl>
  );
}

export function ResortCard(p: ResortCardProps) {
  const def = RESORTS[p.id];
  const data: Partial<ResortSnapshot> | null = p.block?.data ?? null;
  const meta = p.block?.meta;
  const b = meta ? badge(meta, p.now) : 'red';
  const st = resortStatus(data);
  const pre = data?.season === 'preseason';
  const park = p.date ? parkingCal(p.id, p.date) : null;
  const tags = [
    park?.required ? 'P · Parking reservation' : null,
    park?.liftReservation ? 'Ikon lift reservation' : null,
    def.skiersOnly ? 'Skiers only' : null,
  ].filter((t) => t !== null);
  return (
    <article
      class={`rc${p.isPick ? ' is-pick' : ''}`}
      aria-label={p.isPick ? `${def.name}, today's pick` : def.name}
      data-testid="resort-card"
      data-resort={p.id}
    >
      {p.isPick ? (
        <span class="rc-flag">
          <span aria-hidden="true">★</span> Today's pick
        </span>
      ) : null}
      <div class="rc-top">
        <h3 class="rc-name">{def.name}</h3>
        <StatusChip tone={st.tone} word={st.word} stale={b === 'red' && st.tone !== 'off'} />
      </div>
      <div class="rc-mid">
        <div class="rc-hero">{p.hero}</div>
        {pre ? <PreSeason id={p.id} now={p.now} /> : <Snow data={data} units={p.units} now={p.now} />}
      </div>
      <dl class="rc-facts">
        {pre ? null : (
          <>
            <div>
              <dt>Lifts</dt>
              <dd>{liftsText(data?.lifts)}</dd>
            </div>
            <div>
              <dt>Trails</dt>
              <dd>{trailsText(data?.trails)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Drive</dt>
          <dd>{p.drive}</dd>
        </div>
        <div>
          <dt>Summit wind</dt>
          <dd>{windText(data?.weather, p.units)}</dd>
        </div>
        <div class="rc-wide">
          <dt>Days left</dt>
          <dd>
            <DaysLeft parts={p.daysLeft} />
          </dd>
        </div>
      </dl>
      {tags.length > 0 ? (
        <p class="rc-tags">
          {tags.map((t) => (
            <span key={t} class="rc-tag">
              {t}
            </span>
          ))}
        </p>
      ) : null}
      <div class="rc-foot">
        {meta ? <FreshnessBadge badge={b} age={ageMin(meta, p.now)} /> : null}
        <a class="rc-link" href={`#/resort/${p.id}`}>
          Details →
        </a>
      </div>
    </article>
  );
}
