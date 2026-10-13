// Day grid (spec §9.5, from 900 px; DayList below): one row per trip date, one column per person; the date column
// and the name row stay put while the grid scrolls, and it opens scrolled to today. A cell shows the resort and
// Planned (dashed ring) or Skied (solid dot); tapping it opens the bottom-sheet picker.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { formatLocalDate, localDate } from '../../../shared/time.ts';
import { serverNow } from '../../data/snapshot.ts';
import { type DayRow, type PersonRow, people, skiDays } from '../../data/tracker.ts';
import { Glyph } from '../../ui/StatusChip.tsx';
import { CrewMark } from './CrewMark.tsx';
import { crewClasses } from './crew-color.ts';
import { cellLabel, cellText, focusDate, type GridCell, gridRows } from './grid-model.ts';
import { openPicker } from './picker-state.ts';

function Cell({ cell, person, dateText }: { cell: GridCell<DayRow>; person: PersonRow; dateText: string }) {
  const t = cellText(cell.day);
  const status = cell.day?.status;
  return (
    <button
      type="button"
      class={`trk-cell${status ? ` trk-cell-${status}` : ' trk-cell-empty'}`}
      aria-label={cellLabel(person.name, dateText, cell.day)}
      data-testid="tracker-cell"
      onClick={() => openPicker(cell.personId, cell.date)}
    >
      {t && status ? (
        <>
          <span class="trk-cell-resort">{t.resort}</span>
          <span class="trk-cell-status">
            <Glyph tone={status === 'skied' ? 'ok' : 'off'} />
            {t.status}
          </span>
        </>
      ) : (
        <span class="trk-cell-add" aria-hidden="true">
          +
        </span>
      )}
    </button>
  );
}

function ModeMark({ mode }: { mode: PersonRow['mode'] }) {
  if (mode === 'ski') return <span class="trk-mode">Ski</span>;
  if (mode === 'board') return <span class="trk-mode">Board</span>;
  return (
    <span class="trk-mode trk-mode-unknown" title="Confirm ski/board in Crew">
      ?
    </span>
  );
}

export function Grid() {
  const list = people.value;
  const days = skiDays.value;
  const today = localDate(serverNow.value);
  const rows = useMemo(() => gridRows(list, days, today), [list, days, today]);
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const crewOf = useMemo(() => crewClasses(list), [list]);
  const wrap = useRef<HTMLDivElement>(null);
  const focus = focusDate(today);

  // Bring the focus row (today) to the top of the scroller, under the sticky name row, once per focus date.
  useEffect(() => {
    const box = wrap.current;
    const row = box?.querySelector<HTMLElement>(`tr[data-date="${focus}"]`);
    const head = box?.querySelector<HTMLElement>('thead');
    if (!box || !row) return;
    const offset = row.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += offset - (head?.offsetHeight ?? 0);
  }, [focus]);

  return (
    <div class="trk-grid-wrap" ref={wrap}>
      <table class="trk-grid" data-testid="tracker-grid">
        <thead>
          <tr>
            <th scope="col" class="trk-corner">
              Date
            </th>
            {list.map((p) => (
              <th scope="col" key={p.id} class="trk-person">
                <span class="trk-person-name">
                  <CrewMark crew={crewOf.get(p.id)} />
                  {p.name}
                </span>
                <ModeMark mode={p.mode} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dateText = formatLocalDate(r.date, 'short');
            return (
              <tr key={r.date} data-date={r.date} class={`trk-row trk-row-${r.when}`}>
                <th scope="row" class="trk-date">
                  <span class="trk-date-day">{dateText}</span>
                  <span class="trk-date-no">{r.when === 'today' ? 'Today' : `Day ${r.dayNo}`}</span>
                </th>
                {r.cells.map((c) => {
                  const p = byId.get(c.personId);
                  return p ? (
                    <td key={c.personId}>
                      <Cell cell={c} person={p} dateText={dateText} />
                    </td>
                  ) : null;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
