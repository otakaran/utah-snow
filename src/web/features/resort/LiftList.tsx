// Resort page `lifts` section (spec §8.7.4): LiftList grouped by area with hours and the raw label, GateList,
// trails open/total/groomed. Every state is a StatusChip (shape + word + color); stale data shows "Last known".
import type { Gate, LiftStatus, ResortSnapshot } from '../../../shared/types.ts';
import { clockRel } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { LIFT_STATUS } from '../../ui/status.ts';
import { Tile } from './Amount.tsx';
import { groupByArea, ofTotal, span12 } from './resort-model.ts';

interface Props {
  r: ResortSnapshot | null;
  now: number;
  stale: boolean;
}

function LiftRow({ l, now, stale }: { l: LiftStatus; now: number; stale: boolean }) {
  const s = LIFT_STATUS[l.state] ?? LIFT_STATUS.unknown;
  const raw = l.raw && l.raw.toLowerCase() !== l.state ? `“${l.raw}”` : '';
  const updated = l.updatedAt ? `updated ${clockRel(l.updatedAt, now)}` : '';
  const meta = [span12(l.opensAt, l.closesAt), raw, l.note ?? '', updated].filter(Boolean).join(' · ');
  return (
    <li>
      <span class="rs-strong">{l.name}</span>
      <StatusChip tone={s.tone} word={s.word} stale={stale} />
      {meta ? <span class="rs-wide rs-dim rs-small">{meta}</span> : null}
    </li>
  );
}

export function GateList({ gates, stale }: { gates: readonly Gate[]; stale: boolean }) {
  if (gates.length === 0) return null;
  return (
    <>
      <h3 class="rs-h3">Gates</h3>
      <ul class="rs-rows">
        {gates.map((g) => {
          const s = LIFT_STATUS[g.state] ?? LIFT_STATUS.unknown;
          return (
            <li key={g.name}>
              <span class="rs-strong">{g.name}</span>
              <StatusChip tone={s.tone} word={s.word} stale={stale} />
              {g.note ? <span class="rs-wide rs-dim rs-small">{g.note}</span> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function LiftList({ r, now, stale }: Props) {
  const lifts = r?.lifts;
  const trails = r?.trails;
  const groups = groupByArea(lifts?.list ?? []);
  return (
    <Section testid="lifts" title="Lifts & trails" index="04">
      <dl class="rs-tiles rs-cols-4">
        <Tile label="Lifts open" card>
          <span class="rs-num">{ofTotal(lifts?.open, lifts?.total)}</span>
        </Tile>
        <Tile label="On hold" card>
          <span class="rs-num">{lifts ? lifts.hold : '—'}</span>
        </Tile>
        <Tile label="Trails open" card>
          <span class="rs-num">{ofTotal(trails?.open, trails?.total)}</span>
        </Tile>
        <Tile label="Groomed" card>
          <span class="rs-num">{trails?.groomed ?? '—'}</span>
        </Tile>
      </dl>
      {groups.length === 0 ? <p class="rs-dim">No lift list in the report yet.</p> : null}
      {groups.map((g) => (
        <div key={g.area}>
          {groups.length > 1 || g.area !== 'Lifts' ? <h3 class="rs-h3">{g.area}</h3> : null}
          <ul class="rs-rows">
            {g.lifts.map((l) => (
              <LiftRow key={l.id} l={l} now={now} stale={stale} />
            ))}
          </ul>
        </div>
      ))}
      <GateList gates={r?.gates ?? []} stale={stale} />
    </Section>
  );
}
