// Bookings (spec §9.5): what the recorded days still need (DV Ikon reservations per person, car parking where
// parkingCal says it is required), the bookings on record with Remove, and a form to record one. Every row links
// to its booking site from config/parking.ts / config/ikon.ts.
import { useMemo, useState } from 'preact/hooks';
import { formatLocalDate, localDate } from '../../../shared/time.ts';
import type { BookingKind } from '../../../shared/types.ts';
import { serverNow } from '../../data/snapshot.ts';
import { bookings, mutate, people, skiDays } from '../../data/tracker.ts';
import { Glyph } from '../../ui/StatusChip.tsx';
import {
  BOOKING_KINDS,
  BOOKING_LABEL,
  bookingUrl,
  missingBookings,
  perPerson,
  requiredHint,
} from './bookings-model.ts';
import { focusDate, tripDates } from './grid-model.ts';

const MAX_NOTE = 80;

function BookLink({ url }: { url: string | null }) {
  return url ? (
    <a class="btn trk-book" href={url} target="_blank" rel="noopener noreferrer">
      Book ↗
    </a>
  ) : null;
}

function Needed({ today }: { today: string }) {
  const list = missingBookings(people.value, skiDays.value, bookings.value, today);
  if (list.length === 0) {
    return (
      <p class="trk-need-none trk-tone-ok">
        <Glyph tone="ok" />
        <span>Nothing missing for the recorded days</span>
      </p>
    );
  }
  return (
    <ul class="trk-list" data-testid="tracker-needs">
      {list.map((n) => (
        <li key={`${n.date}|${n.kind}|${n.personId}`} class="trk-list-item trk-need">
          <span class="trk-list-main trk-tone-warn">
            <Glyph tone="warn" />
            <span>
              <b>{formatLocalDate(n.date, 'short')}</b> · {BOOKING_LABEL[n.kind]} · {n.who}
            </span>
          </span>
          <span class="trk-list-note">{n.hint} · not recorded</span>
          <span class="trk-list-actions">
            <BookLink url={n.url} />
            <button
              type="button"
              class="btn"
              onClick={() => void mutate({ op: 'upsertBooking', date: n.date, kind: n.kind, personId: n.personId })}
            >
              Mark booked
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Recorded() {
  const names = new Map(people.value.map((p) => [p.id, p.name]));
  const list = [...bookings.value].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (list.length === 0) return <p class="field-note">No bookings recorded yet.</p>;
  return (
    <ul class="trk-list" data-testid="tracker-booking-list">
      {list.map((b) => (
        <li key={`${b.date}|${b.kind}|${b.personId}`} class="trk-list-item">
          <span class="trk-list-main trk-tone-ok">
            <Glyph tone="ok" />
            <span>
              <b>{formatLocalDate(b.date, 'short')}</b> · {BOOKING_LABEL[b.kind]}
              {b.personId === '*' ? '' : ` · ${names.get(b.personId) ?? 'removed person'}`}
            </span>
          </span>
          {b.note ? <span class="trk-list-note">{b.note}</span> : null}
          <span class="trk-list-actions">
            <button
              type="button"
              class="btn"
              onClick={() => void mutate({ op: 'deleteBooking', date: b.date, kind: b.kind, personId: b.personId })}
            >
              Remove
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AddBooking({ today }: { today: string }) {
  const list = people.value;
  const dates = useMemo(tripDates, []);
  const [date, setDate] = useState(focusDate(today));
  const [kind, setKind] = useState<BookingKind>('dv-lift');
  const [personId, setPersonId] = useState('');
  const [note, setNote] = useState('');
  const chosen = list.some((p) => p.id === personId) ? personId : (list[0]?.id ?? '');
  const who = perPerson(kind) ? chosen : '*';
  const hint = requiredHint(kind, date);
  const submit = (e: Event) => {
    e.preventDefault();
    if (!who) return;
    void mutate({ op: 'upsertBooking', date, kind, personId: who, note: note.trim() || null });
    setNote('');
  };
  return (
    <form class="trk-add trk-add-booking" onSubmit={submit} data-testid="tracker-add-booking">
      <label class="field">
        <span class="field-label">Date</span>
        <select value={date} onChange={(e) => setDate(e.currentTarget.value)}>
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatLocalDate(d, 'short')}
            </option>
          ))}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Booking</span>
        <select value={kind} onChange={(e) => setKind(e.currentTarget.value as BookingKind)}>
          {BOOKING_KINDS.map((k) => (
            <option key={k} value={k}>
              {BOOKING_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {perPerson(kind) ? (
        <label class="field">
          <span class="field-label">For</span>
          <select value={who} onChange={(e) => setPersonId(e.currentTarget.value)}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label class="field">
        <span class="field-label">Note (optional)</span>
        <input
          value={note}
          maxLength={MAX_NOTE}
          placeholder="Confirmation #, plate…"
          onInput={(e) => setNote(e.currentTarget.value)}
        />
      </label>
      <p class={`trk-hint ${hint ? 'trk-tone-warn' : 'trk-tone-off'}`}>
        <Glyph tone={hint ? 'warn' : 'off'} />
        <span>{hint ?? 'Not required that day'}</span>
        <BookLink url={bookingUrl(kind, date)} />
      </p>
      <button type="submit" class="btn btn-primary" disabled={!who}>
        Record booking
      </button>
    </form>
  );
}

export function Bookings() {
  const today = localDate(serverNow.value);
  return (
    <div class="stack trk-bookings">
      <h3 class="trk-h3">Still to book</h3>
      <Needed today={today} />
      <h3 class="trk-h3">On record</h3>
      <Recorded />
      <h3 class="trk-h3">Record a booking</h3>
      <AddBooking today={today} />
    </div>
  );
}
