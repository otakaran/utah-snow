// Days left and save thresholds (spec §9.2, §9.5, §10) in one set: the crew minimum, then one row per person (crew
// mark; "I am" is marked), one chip per cap group. A chip punches the cap as pips (skied, planned, left; Solitude ∞),
// prints the status word only when low (shape + word + color, red at 0) and today's save-threshold big: spend a
// capped day only on at least that much snow, free from the use-it-or-lose-it date. A table from 900 px, one card per
// person below. Thresholds come from the pick engine through the pick-card feature; the crew row covers today's crew,
// as the crew pick does.
import { useMemo } from 'preact/hooks';
import { formatLocalDate } from '../../../shared/time.ts';
import type { GroupThreshold, PickResult } from '../../../shared/types.ts';
import { units } from '../../data/settings.ts';
import { people, skiDays } from '../../data/tracker.ts';
import { qty } from '../../lib/format.ts';
import { Glyph } from '../../ui/StatusChip.tsx';
import { crewIds, crewPick, me, personPicks } from '../pick-card/index.ts';
import { CrewMark } from './CrewMark.tsx';
import { crewClasses } from './crew-color.ts';
import { type CapCell, capTable, chipSave } from './summary-model.ts';

function Pips({ c }: { c: CapCell }) {
  if (c.cap === null) {
    return (
      <span class="trk-pips trk-pips-inf" role="img" aria-label="Unlimited">
        ∞
      </span>
    );
  }
  const label = `${c.skied + c.planned} of ${c.cap} used (${c.skied} skied, ${c.planned} planned), ${c.word}`;
  return (
    <span class="trk-pips" role="img" aria-label={label} title={label}>
      {c.pips.map((p, i) => (
        <i key={i} class={`trk-pip trk-pip-${p}`} />
      ))}
    </span>
  );
}

/** The decision number: '≥ 4.2″', 'Free' (use it or lose it), '—' (none left or no conditions yet). */
function saveText(c: CapCell, threshold: number | null): string {
  if (c.cap === null) return '';
  if (threshold === null) return '—';
  return threshold <= 0 ? 'Free' : `≥ ${qty('snow', threshold, units.value)}`;
}

function Chip({ c, t }: { c: CapCell; t: GroupThreshold | undefined }) {
  const s = chipSave(c, t);
  const low = c.cap !== null && c.tone !== 'ok';
  const free = s.threshold !== null && s.threshold <= 0;
  const from = s.from ? formatLocalDate(s.from, 'md') : '';
  return (
    <td class={`trk-cc trk-tone-${c.tone}`} data-group={c.group} data-left={c.remaining ?? 'unlimited'}>
      <span class="trk-cc-label">{c.label}</span>
      <Pips c={c} />
      <span class="trk-cc-save num">{saveText(c, s.threshold)}</span>
      {low || free || from ? (
        <span class="trk-cc-note">
          {low ? (
            <span class="trk-cc-word">
              <Glyph tone={c.tone} />
              {c.word}
            </span>
          ) : null}
          {free ? <span>use it or lose it</span> : null}
          {from ? <span>free from {from}</span> : null}
        </span>
      ) : null}
    </td>
  );
}

interface RowProps {
  id: string;
  name: string;
  crew?: string;
  cells: CapCell[];
  pick: PickResult | null | undefined;
}

function Row({ id, name, crew, cells, pick }: RowProps) {
  return (
    <tr data-person={id} class={crew ?? 'trk-caps-crew'}>
      <th scope="row">
        <CrewMark crew={crew} />
        {name}
      </th>
      {cells.map((c) => (
        <Chip key={c.group} c={c} t={pick?.thresholds[c.group]} />
      ))}
    </tr>
  );
}

export function Summary() {
  const list = people.value;
  const days = skiDays.value;
  const ids = crewIds.value;
  const t = useMemo(() => capTable(list, days), [list, days]);
  const going = useMemo(() => list.filter((p) => ids.includes(p.id)), [list, ids]);
  const crewCells = useMemo(() => capTable(going, days).crew, [going, days]);
  const crewOf = useMemo(() => crewClasses(list), [list]);
  const crew = crewPick.value;
  const picks = new Map(personPicks.value.map((p) => [p.id, p.pick]));
  const selfId = me.value?.id;
  return (
    <div class="trk-caps-wrap">
      <table class="trk-caps" data-testid="tracker-threshold-table">
        <thead>
          <tr>
            <th scope="col">
              <span class="sr-only">Who</span>
            </th>
            {t.groups.map((g) => (
              <th scope="col" key={g.id}>
                {g.label}
                <span class="trk-cap">{g.cap === null ? 'no cap' : `cap ${g.cap}`}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crewCells ? <Row id="crew" name="Crew" cells={crewCells} pick={crew} /> : null}
          {t.rows.map((r) => (
            <Row
              key={r.id}
              id={r.id}
              name={r.id === selfId ? `${r.name} (me)` : r.name}
              crew={crewOf.get(r.id)}
              cells={r.cells}
              pick={picks.get(r.id)}
            />
          ))}
        </tbody>
      </table>
      <p class="field-note trk-caps-key">
        <span>
          <i class="trk-pip trk-pip-skied" /> skied
        </span>
        <span>
          <i class="trk-pip trk-pip-planned" /> planned
        </span>
        <span>
          <i class="trk-pip trk-pip-left" /> left
        </span>
        <span>
          {crew
            ? 'Spend a capped day only on at least its snow number. Solitude is never capped.'
            : "Snow numbers appear once today's conditions have loaded."}
        </span>
      </p>
    </div>
  );
}
