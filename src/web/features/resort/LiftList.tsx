// Resort page `lifts` section (spec §8.7.4): LiftList grouped by area with hours and the raw label, GateList,
// trails open/total/groomed. Every state is a StatusChip (shape + word + color); stale data shows "Last known".
// Closed is red only while lifts run (shared/lifts.ts liftsRunning), else grey. Old raw labels are dropped and the
// list's age shows once, in the "Lifts" heading.
import type { Gate, LiftStatus, ResortSnapshot } from '../../../shared/types.ts';
import { Section } from '../../ui/Section.tsx';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { Tile } from './Amount.tsx';
import { asOf, liftWord, newestUpdate, sharedState, updatedToday } from './lift-view.ts';
import { groupByArea, ofTotal, span12 } from './resort-model.ts';

interface Props {
  r: ResortSnapshot | null;
  today: string; // Denver date
  stale: boolean;
  /** In season and inside C.8 lift hours: a closed lift or gate is the red plate. */
  running: boolean;
}

type RowProps = { stale: boolean; running: boolean };

function LiftRow({ l, today, stale, running }: RowProps & { l: LiftStatus; today: string }) {
  const s = liftWord(l.state, running);
  const fresh = updatedToday(l.updatedAt, today);
  const raw = fresh && l.raw && l.raw.toLowerCase() !== l.state ? `resort says “${l.raw}”` : '';
  const meta = [span12(l.opensAt, l.closesAt), raw, fresh ? (l.note ?? '') : ''].filter(Boolean).join(' · ');
  return (
    <li>
      <span class="rs-strong">{l.name}</span>
      <StatusChip tone={s.tone} word={s.word} stale={stale} />
      {meta ? <span class="rs-wide rs-dim rs-small">{meta}</span> : null}
    </li>
  );
}

function GateRows({ gates, stale, running }: RowProps & { gates: readonly Gate[] }) {
  return (
    <ul class="rs-rows rs-grid">
      {gates.map((g) => {
        const s = liftWord(g.state, running);
        return (
          <li key={g.name}>
            <span class="rs-strong">{g.name}</span>
            <StatusChip tone={s.tone} word={s.word} stale={stale} />
            {g.note ? <span class="rs-wide rs-dim rs-small">{g.note}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Gates in one card; when they all share a state, one summary row and the per-gate list folded away. */
export function GateList({ gates, stale, running }: RowProps & { gates: readonly Gate[] }) {
  if (gates.length === 0) return null;
  const one = sharedState(gates);
  const s = one ? liftWord(one, running) : null;
  return (
    <>
      <h3 class="rs-h3">Gates</h3>
      <div class="rs-card">
        {s ? (
          <>
            <ul class="rs-rows">
              <li>
                <span class="rs-strong">All {gates.length} gates</span>
                <StatusChip tone={s.tone} word={s.word} stale={stale} />
              </li>
            </ul>
            <details class="rs-details">
              <summary class="rs-label">Each gate</summary>
              <GateRows gates={gates} stale={stale} running={running} />
            </details>
          </>
        ) : (
          <GateRows gates={gates} stale={stale} running={running} />
        )}
      </div>
    </>
  );
}

export function LiftList({ r, today, stale, running }: Props) {
  const lifts = r?.lifts;
  const trails = r?.trails;
  const list = lifts?.list ?? [];
  const groups = groupByArea(list);
  const age = asOf(newestUpdate(list), today, r?.season);
  const tiles = [
    { label: 'Lifts open', v: ofTotal(lifts?.open, lifts?.total) },
    { label: 'On hold', v: lifts ? String(lifts.hold) : '—' },
    { label: 'Trails open', v: ofTotal(trails?.open, trails?.total) },
    { label: 'Groomed', v: typeof trails?.groomed === 'number' ? String(trails.groomed) : '—' },
  ].filter((t) => t.v !== '—');
  return (
    <Section testid="lifts" title="Lifts & trails" index="04">
      {tiles.length > 0 ? (
        <dl class="rs-tiles rs-tiles-wide">
          {tiles.map((t) => (
            <Tile key={t.label} label={t.label} card>
              <span class="rs-num">{t.v}</span>
            </Tile>
          ))}
        </dl>
      ) : null}
      <h3 class="rs-h3">Lifts {age ? <span class="rs-dim">· {age}</span> : null}</h3>
      {groups.length === 0 ? <p class="rs-dim">The resort has not posted its lift list yet.</p> : null}
      {groups.map((g) => (
        <div key={g.area} class="rs-card">
          {groups.length > 1 || g.area !== 'Lifts' ? <h4 class="rs-label rs-dim rs-area">{g.area}</h4> : null}
          <ul class="rs-rows rs-grid">
            {g.lifts.map((l) => (
              <LiftRow key={l.id} l={l} today={today} stale={stale} running={running} />
            ))}
          </ul>
        </div>
      ))}
      <GateList gates={r?.gates ?? []} stale={stale} running={running} />
    </Section>
  );
}
