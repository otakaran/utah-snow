// "Days left" (spec §9.5): remaining Ikon days per cap group for each person and the crew minimum; red at 0.
// Each cell is a shape + word + color (glyph, "3 left", tone) with the skied/planned split underneath.
import { useMemo } from 'preact/hooks';
import { people, skiDays } from '../../data/tracker.ts';
import { Glyph } from '../../ui/StatusChip.tsx';
import { type CapCell, capTable } from './summary-model.ts';

function Left({ c, split }: { c: CapCell; split: boolean }) {
  return (
    <td class={`trk-left trk-tone-${c.tone}`} data-group={c.group} data-left={c.remaining ?? 'unlimited'}>
      <span class="trk-left-main">
        <Glyph tone={c.tone} />
        <span>{c.word}</span>
      </span>
      {split && c.cap !== null ? (
        <span class="trk-left-split">
          {c.skied} skied · {c.planned} planned
        </span>
      ) : null}
    </td>
  );
}

export function Summary() {
  const list = people.value;
  const days = skiDays.value;
  const t = useMemo(() => capTable(list, days), [list, days]);
  return (
    <div class="trk-table-wrap">
      <table class="trk-table" data-testid="tracker-caps">
        <thead>
          <tr>
            <th scope="col">Who</th>
            {t.groups.map((g) => (
              <th scope="col" key={g.id}>
                {g.label}
                <span class="trk-cap">{g.cap === null ? 'no cap' : `cap ${g.cap}`}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.name}</th>
              {r.cells.map((c) => (
                <Left key={c.group} c={c} split />
              ))}
            </tr>
          ))}
          {t.crew ? (
            <tr class="trk-crew-row" data-testid="tracker-crew-min">
              <th scope="row">Crew minimum</th>
              {t.crew.map((c) => (
                <Left key={c.group} c={c} split={false} />
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
