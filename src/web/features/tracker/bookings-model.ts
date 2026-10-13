// Pure helpers for the bookings section (spec §9.5): labels, booking links and "required" hints from parkingCal
// (src/shared/parking.ts, config/parking.ts), and the reservations the recorded days still need.
import { parkingCal } from '../../../shared/parking.ts';
import type { BookingKind, ResortId, TrackerResort } from '../../../shared/types.ts';

export const BOOKING_KINDS: readonly BookingKind[] = [
  'dv-lift',
  'alta-parking',
  'brighton-parking',
  'solitude-parking',
  'snowbird-parking',
];

export const BOOKING_LABEL: Record<BookingKind, string> = {
  'dv-lift': 'Deer Valley Ikon reservation',
  'alta-parking': 'Alta parking',
  'brighton-parking': 'Brighton parking',
  'solitude-parking': 'Solitude parking',
  'snowbird-parking': 'Snowbird paid parking',
};

const RESORT_OF: Record<BookingKind, ResortId> = {
  'dv-lift': 'deer-valley',
  'alta-parking': 'alta',
  'brighton-parking': 'brighton',
  'solitude-parking': 'solitude',
  'snowbird-parking': 'snowbird',
};

/** dv-lift is per person; parking is per car ('*'). */
export const perPerson = (kind: BookingKind): boolean => kind === 'dv-lift';

/** Where to book `kind` (the DV Ikon page, or the resort's parking site), or null. */
export const bookingUrl = (kind: BookingKind, date: string): string | null => parkingCal(RESORT_OF[kind], date).book;

/** 'Required 08:00–13:00' when a reservation is needed on `date` (DV every day), else null. */
export function requiredHint(kind: BookingKind, date: string): string | null {
  const cal = parkingCal(RESORT_OF[kind], date);
  if (kind === 'dv-lift') return cal.liftReservation ? 'Required every day' : null;
  return cal.required ? `Required${cal.window ? ` ${cal.window}` : ''}` : null;
}

/** Parking kinds a tracker resort uses ('alta-snowbird' parks once, at Alta). */
const PARKING_FOR: Partial<Record<TrackerResort, BookingKind>> = {
  alta: 'alta-parking',
  'alta-snowbird': 'alta-parking',
  brighton: 'brighton-parking',
  solitude: 'solitude-parking',
};

export interface Need {
  date: string;
  kind: BookingKind;
  personId: string; // '*' for parking
  who: string; // person names the booking covers
  hint: string;
  url: string | null;
}

interface DayLike {
  personId: string;
  date: string;
  resortId: TrackerResort;
}

/**
 * Reservations still missing from today on: a DV Ikon reservation per person on a Deer Valley day, and car parking
 * where parkingCal says it is required (Alta, Brighton, Solitude). Sorted by date.
 */
export function missingBookings(
  people: readonly { id: string; name: string }[],
  days: readonly DayLike[],
  booked: readonly { date: string; kind: BookingKind; personId: string }[],
  today: string,
): Need[] {
  const name = new Map(people.map((p) => [p.id, p.name]));
  const has = new Set(booked.map((b) => `${b.date}|${b.kind}|${b.personId}`));
  const parking = new Map<string, Need>();
  const out: Need[] = [];
  for (const d of days) {
    const who = name.get(d.personId);
    if (who === undefined || d.date < today) continue;
    if (d.resortId === 'deer-valley' && !has.has(`${d.date}|dv-lift|${d.personId}`)) {
      const url = bookingUrl('dv-lift', d.date);
      out.push({ date: d.date, kind: 'dv-lift', personId: d.personId, who, hint: 'Required every day', url });
    }
    const kind = PARKING_FOR[d.resortId];
    const hint = kind ? requiredHint(kind, d.date) : null;
    if (!kind || !hint || has.has(`${d.date}|${kind}|*`)) continue;
    const key = `${d.date}|${kind}`;
    const prev = parking.get(key);
    if (prev) prev.who = `${prev.who}, ${who}`;
    else parking.set(key, { date: d.date, kind, personId: '*', who, hint, url: bookingUrl(kind, d.date) });
  }
  return [...out, ...parking.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
