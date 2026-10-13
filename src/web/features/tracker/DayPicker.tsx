// Bottom-sheet picker for one grid cell (spec §9.5): Planned/Skied, the 7 resort values and Clear. A choice is off,
// with its reason shown, when the resort is skiers-only for a boarder or the cap group is used up. Choosing saves
// at once (optimistic); the server's verdict shows in the page notice. Native modal <dialog>: Esc and focus trap.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { DayStatus } from '../../../shared/caps.ts';
import { formatLocalDate, localDate } from '../../../shared/time.ts';
import type { TrackerResort } from '../../../shared/types.ts';
import { serverNow } from '../../data/snapshot.ts';
import { mutate, people, skiDays } from '../../data/tracker.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Toggle } from '../../ui/Toggle.tsx';
import { defaultStatus, resortChoices } from './grid-model.ts';
import { closePicker, pickerTarget } from './picker-state.ts';

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'skied', label: 'Skied' },
] as const;

const leftText = (left: number | null): string =>
  left === null ? 'Unlimited' : left === 0 ? 'Uses the last day' : `${left} left after this`;

export function DayPicker() {
  const t = pickerTarget.value;
  const ref = useRef<HTMLDialogElement>(null);
  const person = t ? people.value.find((p) => p.id === t.personId) : undefined;
  const days = skiDays.value;
  const day = t ? days.find((d) => d.personId === t.personId && d.date === t.date) : undefined;
  const today = localDate(serverNow.value);
  const [status, setStatus] = useState<DayStatus>('planned');

  // New target (keyed on the cell only): start from its own status, else the date default (past = skied).
  const key = t ? `${t.personId}|${t.date}` : '';
  useEffect(() => {
    if (t) setStatus(day?.status ?? defaultStatus(t.date, today));
  }, [key]);

  // Layout effect: the modal opens in the same frame its content renders (no taps reach the grid in between).
  const open = t !== null && person !== undefined;
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const choose = (resortId: TrackerResort) => {
    if (!t) return;
    if (day?.resortId !== resortId || day.status !== status) {
      void mutate({ op: 'upsertDay', personId: t.personId, date: t.date, resortId, status });
    }
    closePicker();
  };
  const clear = () => {
    if (!t) return;
    void mutate({ op: 'deleteDay', personId: t.personId, date: t.date });
    closePicker();
  };
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) closePicker();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes a modal <dialog> natively; the click is backdrop-only.
    <dialog
      ref={ref}
      class="trk-sheet"
      aria-labelledby="trk-sheet-title"
      data-testid="tracker-picker"
      onClose={closePicker}
      onClick={onBackdrop}
    >
      {open && t && person ? (
        <div class="trk-sheet-body">
          <div class="trk-sheet-bar">
            <h2 id="trk-sheet-title" class="trk-sheet-title">
              {person.name} · {formatLocalDate(t.date, 'short')}
            </h2>
            <button type="button" class="btn-icon" onClick={closePicker} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          {person.mode === 'unknown' ? (
            <p class="field-note">Confirm ski/board for {person.name} in Crew: Alta and Deer Valley are skiers-only.</p>
          ) : null}
          <Toggle
            label="Status"
            name="trk-status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={(v) => setStatus(v)}
          />
          <ul class="trk-choices">
            {resortChoices(person, days, t.date).map((c) => {
              const current = day?.resortId === c.resort;
              return (
                <li key={c.resort}>
                  <button
                    type="button"
                    class={`trk-choice${current ? ' trk-choice-current' : ''}`}
                    aria-pressed={current}
                    disabled={c.disabled}
                    title={c.reason ?? undefined}
                    data-resort={c.resort}
                    onClick={() => choose(c.resort)}
                  >
                    <span class="trk-choice-name">{c.label}</span>
                    <span class="trk-choice-note">{c.reason ?? (current ? 'Current' : leftText(c.left))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {day ? (
            <button type="button" class="btn trk-clear" onClick={clear}>
              Clear this day
            </button>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
