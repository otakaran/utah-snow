// Phone day list (spec §9.5, below 900 px; the grid takes over from 900 px): one card per trip date, today first,
// then the upcoming dates, then the past ones collapsed (most recent first). Each person is a chip with their crew
// stripe, name, resort (or "+") and Skied (solid dot) or Planned (dashed ring); a tap opens the same picker.
import { useMemo } from 'preact/hooks';
import { formatLocalDate, localDate } from '../../../shared/time.ts';
import { serverNow } from '../../data/snapshot.ts';
import { type DayRow, type PersonRow, people, skiDays } from '../../data/tracker.ts';
import { Glyph } from '../../ui/StatusChip.tsx';
import { crewClasses } from './crew-color.ts';
import { cellLabel, cellText, dayListGroups, type GridCell, type GridRow, gridRows } from './grid-model.ts';
import { openPicker } from './picker-state.ts';

interface Ctx {
  byId: Map<string, PersonRow>;
  crewOf: Map<string, string>;
}

function Chip({
  cell,
  person,
  dateText,
  crew,
}: {
  cell: GridCell<DayRow>;
  person: PersonRow;
  dateText: string;
  crew: string;
}) {
  const t = cellText(cell.day);
  const status = cell.day?.status;
  return (
    <button
      type="button"
      class={`trk-chip ${crew} trk-chip-${status ?? 'empty'}`}
      aria-label={cellLabel(person.name, dateText, cell.day)}
      data-testid="tracker-chip"
      data-person={cell.personId}
      onClick={() => openPicker(cell.personId, cell.date)}
    >
      <span class="trk-chip-top">
        <span class="trk-chip-name">{person.name}</span>
        {t && status ? (
          <span class="trk-chip-status">
            <Glyph tone={status === 'skied' ? 'ok' : 'off'} />
            {t.status}
          </span>
        ) : null}
      </span>
      {t ? (
        <span class="trk-chip-resort">{t.resort}</span>
      ) : (
        <span class="trk-chip-add" aria-hidden="true">
          +
        </span>
      )}
    </button>
  );
}

function Day({ row, ctx }: { row: GridRow<DayRow>; ctx: Ctx }) {
  const dateText = formatLocalDate(row.date, 'short');
  return (
    <li class={`trk-dl-day trk-row-${row.when}`} data-date={row.date}>
      <p class="trk-dl-head">
        <span class="trk-dl-date">{dateText}</span>
        <span class="trk-dl-no">{row.when === 'today' ? `Today · Day ${row.dayNo}` : `Day ${row.dayNo}`}</span>
      </p>
      <div class="trk-dl-chips">
        {row.cells.map((c) => {
          const p = ctx.byId.get(c.personId);
          return p ? (
            <Chip key={c.personId} cell={c} person={p} dateText={dateText} crew={ctx.crewOf.get(p.id) ?? ''} />
          ) : null;
        })}
      </div>
    </li>
  );
}

export function DayList() {
  const list = people.value;
  const days = skiDays.value;
  const today = localDate(serverNow.value);
  const { head, past } = useMemo(() => dayListGroups(gridRows(list, days, today)), [list, days, today]);
  const ctx = useMemo<Ctx>(() => ({ byId: new Map(list.map((p) => [p.id, p])), crewOf: crewClasses(list) }), [list]);
  return (
    <div class="trk-daylist" data-testid="tracker-daylist">
      {head.length > 0 ? (
        <ol class="trk-dl">
          {head.map((r) => (
            <Day key={r.date} row={r} ctx={ctx} />
          ))}
        </ol>
      ) : null}
      {past.length > 0 ? (
        <details class="trk-dl-past" open={head.length === 0}>
          <summary>Past days ({past.length})</summary>
          <ol class="trk-dl">
            {past.map((r) => (
              <Day key={r.date} row={r} ctx={ctx} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
