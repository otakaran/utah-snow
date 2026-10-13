// Resort page `head` (spec §8.7.1): name (outranks the number), season status, the big overnight number with the
// OVERNIGHT caption right under it, 24 h / base / lifts / trails, days left, drive, today's parking, then the source
// links with their freshness. Pre-season hides the (empty) snow numbers; a missing value is a dim dash, never glowing.
import { RESORTS } from '../../../../config/resorts.ts';
import { CORRIDORS } from '../../../../config/roads.ts';
import { ageMin, badge } from '../../../shared/freshness.ts';
import { parkingCal } from '../../../shared/parking.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { Block, ResortId, ResortSnapshot } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { clockRel } from '../../lib/format.ts';
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { Amount, Count, Tile } from './Amount.tsx';
import {
  bookLabel,
  type DaysLeft,
  type DriveInfo,
  isStale,
  ofTotal,
  resortData,
  seasonStatus,
} from './resort-model.ts';

interface Props {
  id: ResortId;
  block: Block<ResortSnapshot> | undefined;
  drive: DriveInfo;
  today: string; // Denver date
  now: number;
  units: Units;
  days: DaysLeft;
}

const external = { target: '_blank', rel: 'noreferrer' } as const;

function DaysLine({ d }: { d: DaysLeft }) {
  if (d.cap === null) return <span>{d.group}: unlimited</span>;
  const parts = [d.me === null ? '' : `me ${d.me}`, d.crew === null ? '' : `crew min ${d.crew}`].filter(Boolean);
  return (
    <span>
      <span class="rs-strong">{parts.length > 0 ? parts.join(' · ') : '—'}</span> of {d.cap} ({d.group})
      {parts.length === 0 ? (
        <>
          {' · '}
          <a class="rs-tap" href="#/tracker">
            set up the crew
          </a>
        </>
      ) : null}
    </span>
  );
}

function DriveLine({ d }: { d: DriveInfo }) {
  return (
    <span>
      <span class="rs-strong">
        {d.approx ? '≈ ' : ''}
        {d.min} min
      </span>{' '}
      {d.mi !== null ? `· ${d.mi} mi ` : ''}from {d.from}
      {d.via ? ` via ${d.via}` : ''}
      {d.warning ? <span class="rs-warn"> · {d.warning}</span> : null}
      {d.delayMin !== null && d.delayMin > 0 ? <span class="rs-warn"> +{d.delayMin} min live</span> : null}
      {d.delayMin === 0 ? <span class="rs-dim"> · no live delay</span> : null}
    </span>
  );
}

function ParkingLine({ id, today }: Pick<Props, 'id' | 'today'>) {
  const p = parkingCal(id, today);
  const need = p.required || p.liftReservation;
  return (
    <span>
      <span class={need ? 'rs-strong' : undefined}>{p.summary}</span>
      {p.book ? (
        <>
          {' · '}
          <a class="rs-tap" href={p.book} {...external}>
            {bookLabel(p)} ↗
          </a>
        </>
      ) : null}
      {p.cancelBy && need ? <span class="rs-dim"> · cancel by {p.cancelBy}</span> : null}
    </span>
  );
}

export function ResortHead({ id, block, drive, today, now, units, days }: Props) {
  const def = RESORTS[id];
  const r = resortData(block?.data);
  const fresh = block ? badge(block.meta, now) : null;
  const season = seasonStatus(r?.season);
  const pre = r?.season === 'preseason'; // every snow field is null until the first report (spec §5.5)
  const links: { conditions: string; lifts?: string } = def.links;
  return (
    <section data-testid="head" class="rs-head" aria-labelledby="rs-name">
      <p class="rs-label rs-dim">
        {CORRIDORS[def.corridor].label} · base <Amount kind="elevation" value={def.base.ft} units={units} />
      </p>
      <h1 id="rs-name" class="rs-name">
        {def.name}
      </h1>
      <div class="rs-flex">
        <StatusChip tone={season.tone} word={season.word} stale={isStale(fresh) && season.tone !== 'off'} size="lg" />
        {pre ? (
          <span class="rs-dim">
            projected open {def.projectedOpen ? formatLocalDate(def.projectedOpen, 'md') : 'TBA'}
          </span>
        ) : null}
      </div>
      <div class="rs-flex rs-hero">
        {pre ? null : (
          <p class="rs-big">
            <Amount kind="snow" value={r?.snow.overnightIn} units={units} class="rs-snow" />
            <span class="rs-label">Overnight</span>
            {r?.snow.reportAt ? <span class="rs-dim rs-small">report {clockRel(r.snow.reportAt, now)}</span> : null}
          </p>
        )}
        <dl class="rs-tiles rs-cols-4">
          {pre ? null : (
            <>
              <Tile label="24 h">
                <Amount kind="snow" value={r?.snow.new24hIn} units={units} class="rs-snow" />
              </Tile>
              <Tile label="Base">
                <Amount kind="snow" value={r?.snow.baseDepthIn} units={units} />
              </Tile>
            </>
          )}
          <Tile label="Lifts open">
            <Count text={ofTotal(r?.lifts.open, r?.lifts.total)} />
          </Tile>
          <Tile label="Trails open">
            <Count text={ofTotal(r?.trails.open, r?.trails.total)} />
          </Tile>
        </dl>
      </div>
      <ul class="rs-facts">
        <li>
          <b class="rs-label rs-dim">Days left</b>
          <DaysLine d={days} />
        </li>
        <li>
          <b class="rs-label rs-dim">Drive</b>
          <DriveLine d={drive} />
        </li>
        <li>
          <b class="rs-label rs-dim">Parking today</b>
          <ParkingLine id={id} today={today} />
        </li>
      </ul>
      <p class="rs-flex">
        <a class="rs-tap rs-btn rs-label" href={links.conditions} {...external}>
          {def.name} report ↗
        </a>
        {links.lifts ? (
          <a class="rs-tap rs-btn rs-label" href={links.lifts} {...external}>
            Lifts &amp; trails ↗
          </a>
        ) : null}
        {block ? <FreshnessBadge badge={fresh ?? 'grey'} age={ageMin(block.meta, now)} /> : null}
      </p>
    </section>
  );
}
