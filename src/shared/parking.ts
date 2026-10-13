// Parking and reservation calendar (spec §4.7, Appendix C.7): evaluates config/parking.ts for one resort on one
// Denver date. Pure. Read by the resort page, the pick (busPen, Snowbird busy) and the tracker bookings row.
// `required` is the parking reservation only; Deer Valley's Ikon lift reservation is `liftReservation`.
import { LIFT_RESERVATION } from '../../config/ikon.ts';
import { ASSUMED_HOLIDAYS, PARKING, type ParkingRule, type Price, type Reservation } from '../../config/parking.ts';
import { type LiftHours, RESORTS } from '../../config/resorts.ts';
import { daysBetween } from './time.ts';
import type { ResortId } from './types.ts';

export interface ParkingDay {
  resort: ResortId;
  date: string; // Denver 'YYYY-MM-DD'
  weekday: number; // 0 = Sunday
  required: boolean; // a parking reservation is required
  liftReservation: boolean; // Deer Valley: Ikon lift reservation, every day
  window: string | null; // when the reservation applies: '08:00–13:00', 'before 12:00'
  priceUsd: Price | null; // per car while required
  busy: boolean; // Fri–Sun or a holiday
  assumedHoliday: boolean; // busy only through ASSUMED_HOLIDAYS (C.7 †: the resort publishes no dates)
  nightRiding: boolean | null; // Brighton 16:00–21:00; null where there is none
  book: string | null; // booking link: parking, the DV lift reservation, or Snowbird's optional paid lots
  cancelBy: string | null;
  summary: string; // one line for chips and the head
  notes: string[];
}

const A_SUNDAY = '1970-01-04';

/** Day of week of a local date, 0 = Sunday. */
export const weekday = (date: string): number => ((daysBetween(A_SUNDAY, date) % 7) + 7) % 7;

const isWeekend = (dow: number): boolean => dow === 5 || dow === 6 || dow === 0;

/** True when `date` is one of `spans`: 'YYYY-MM-DD' or an inclusive 'A..B' range. */
export function inSpans(date: string, spans: readonly string[]): boolean {
  return spans.some((s) => {
    const [a = '', b = a] = s.split('..');
    return date >= a && date <= b;
  });
}

function reservationOn(r: Reservation | null, date: string, dow: number): boolean {
  if (!r) return false;
  if (r.season && !inSpans(date, [r.season])) return false;
  if (r.except && inSpans(date, r.except)) return false;
  if (r.dates) return inSpans(date, r.dates);
  return (r.days === 'FRI_SAT_SUN' && isWeekend(dow)) || inSpans(date, r.holidays ?? []);
}

const windowOf = (r: Reservation | null): string | null =>
  r?.window ? r.window.replace('-', '–') : r?.before ? `before ${r.before}` : null;

const usd = (n: number): string => (n === 0 ? 'free' : `$${n}`);

/** '$25', or '$35 (1–3 in car) / free (4+)'. */
export function priceText(p: Price | null | undefined): string {
  if (p === null || p === undefined) return 'free';
  return typeof p === 'number' ? usd(p) : `${usd(p['1-3'])} (1–3 in car) / ${usd(p['4+'])} (4+)`;
}

function nightOn(id: ResortId, date: string, dow: number): boolean | null {
  const hours: LiftHours = RESORTS[id].liftHours;
  const n = hours.night;
  return n ? !n.noWeekdays.includes(dow) && !n.noDates.includes(date) : null;
}

const firstUrl = (s: string | undefined): string | null => /https?:\/\/\S+/.exec(s ?? '')?.[0] ?? null;

type Extra = Pick<ParkingDay, 'summary' | 'notes' | 'book' | 'cancelBy'>;

const reqText = (rule: ParkingRule, win: string | null): string =>
  `Reservation required${win ? ` ${win}` : ''} · ${priceText(rule.priceUsd)}`;

function extra(id: ResortId, rule: ParkingRule, d: ParkingDay): Extra {
  const book = rule.book ?? null;
  const cancelBy = rule.cancelBy ?? null;
  const notes: string[] = [];
  const free = 'No reservation needed · free';
  switch (id) {
    case 'alta': {
      const e = rule.early;
      const hol = isWeekend(d.weekday) || inSpans(d.date, rule.reservation?.holidays ?? []);
      if (e) notes.push(`Early lot ${e.from}–${e.before}: ${usd(hol ? e.priceUsd.friSunHol : e.priceUsd.monThu)}`);
      if (rule.fines) notes.push(`Fines: ${rule.fines}`);
      return { summary: d.required ? reqText(rule, d.window) : free, notes, book, cancelBy };
    }
    case 'brighton':
      if (rule.lotClosed) notes.push(`Lot closed ${rule.lotClosed.replace('-', '–')}`);
      notes.push(d.nightRiding ? 'Night riding 16:00–21:00' : 'No night riding');
      return { summary: d.required ? reqText(rule, d.window) : free, notes, book, cancelBy };
    case 'solitude':
      if (rule.lotOpens) notes.push(`Lot opens ${rule.lotOpens}; free after 11:00`);
      if (d.required) notes.push('4+ in the car is free, but the reservation is still required');
      return { summary: d.required ? reqText(rule, d.window) : free, notes, book, cancelBy };
    case 'snowbird': {
      const p = rule.paid;
      if (p) notes.push(`Paid ParkWhiz lots before ${p.before}: ${p.prices}; refund until ${p.refundBy}`);
      const tier = d.busy ? `Fri–Sun+Hol${d.assumedHoliday ? '†' : ''}` : 'Mon–Thu';
      const summary = `Free lots, first-come · ${tier}${d.busy ? ': fill early, arrive before 8' : ''}`;
      return { summary, notes, book: firstUrl(p?.book), cancelBy: null };
    }
    case 'deer-valley': {
      const lift = LIFT_RESERVATION['deer-valley'];
      notes.push(`Parking: ${rule.parking ?? 'free first-come'}`, `No-shows: ${lift.noShow}`);
      return {
        summary: 'Ikon lift reservation required · parking free',
        notes,
        book: lift.book,
        cancelBy: lift.cancelBy,
      };
    }
    case 'snowbasin': {
      const [busyText = '', weekdayText = ''] = (rule.carpool ?? '').split('; ');
      const tier = d.assumedHoliday ? '†' : '';
      return { summary: `Free · carpool: ${d.busy ? `${busyText}${tier}` : weekdayText}`, notes, book: null, cancelBy };
    }
  }
}

/** The C.7 rule for `resort` on the Denver date `date` ('YYYY-MM-DD'). */
export function parkingCal(resort: ResortId, date: string): ParkingDay {
  const rule: ParkingRule = PARKING[resort];
  const dow = weekday(date);
  const published = rule.reservation?.holidays;
  const holiday = inSpans(date, published ?? ASSUMED_HOLIDAYS);
  const req = reservationOn(rule.reservation, date, dow);
  const day: ParkingDay = {
    resort,
    date,
    weekday: dow,
    required: req,
    liftReservation: resort === 'deer-valley',
    window: req ? windowOf(rule.reservation) : null,
    priceUsd: req ? (rule.priceUsd ?? null) : null,
    busy: isWeekend(dow) || holiday,
    assumedHoliday: !published && !isWeekend(dow) && holiday,
    nightRiding: nightOn(resort, date, dow),
    book: null,
    cancelBy: null,
    summary: '',
    notes: [],
  };
  return { ...day, ...extra(resort, rule, day) };
}
