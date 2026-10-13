// Parking reservation rules keyed by ResortId (spec §4.7, Appendix C.7). parkingCal() in src/shared/parking.ts
// evaluates them; §13 turns each `releases` entry into a dated USER action item. Date ranges are 'A..B', inclusive.
// Deer Valley's Ikon lift reservation lives in config/ikon.ts (LIFT_RESERVATION).
import type { ResortId } from '../src/shared/types.ts';

export interface Reservation {
  days?: 'FRI_SAT_SUN';
  holidays?: readonly string[];
  dates?: readonly string[]; // explicit required dates (Solitude)
  except?: readonly string[];
  season?: string;
  window?: string; // HH:MM-HH:MM when required
  before?: string; // required before HH:MM
}
export type Price = number | { '1-3': number; '4+': number }; // per car, by people in the car
export interface ParkingRule {
  reservation: Reservation | null;
  priceUsd?: Price;
  early?: { before: string; from: string; priceUsd: { monThu: number; friSunHol: number }; url: string };
  book?: string;
  cancelBy?: string;
  fines?: string;
  releases?: string;
  limits?: string;
  lotClosed?: string;
  lotOpens?: string;
  freeLots?: boolean;
  busy?: 'FRI_SAT_SUN_HOL';
  paid?: { book: string; prices: string; before: string; refundBy: string };
  parking?: string;
  carpool?: string;
}

export const PARKING = {
  alta: {
    reservation: {
      days: 'FRI_SAT_SUN',
      holidays: ['2026-12-18..2027-01-03', '2027-01-18', '2027-02-15'],
      season: '2026-12-11..2027-04-04',
      window: '08:00-13:00',
    },
    priceUsd: 25,
    early: {
      before: '08:00',
      from: '06:00',
      priceUsd: { monThu: 15, friSunHol: 25 },
      url: 'https://www.altaearlyparking.com/',
    },
    book: 'https://reserve.altaparking.com/',
    cancelBy: '08:00',
    fines: 'no-res $150; 2nd+ no-show $100',
    releases:
      'open now (partial fall release); more Sundays 15:00 MT for the next weekend/holiday; max 4 active per account',
    limits: 'max 4 active per account; cancellations reopen spots daily; rental car: plate RENTAL, update later',
  },
  brighton: {
    reservation: {
      days: 'FRI_SAT_SUN',
      holidays: ['2026-12-18..2027-01-03', '2027-01-16..2027-01-19', '2027-02-13..2027-02-16'],
      except: ['2026-12-25'],
      before: '12:00',
    },
    priceUsd: { '1-3': 25, '4+': 10 },
    lotClosed: '00:00-07:00',
    book: 'https://reserve.inflowparking.com/qr/ParkBrightonResort/welcome',
    cancelBy: '08:00',
    releases: 'weekend inventory Mondays 18:00; remainder the day before at 08:00 and 14:00',
    limits: 'max 5 reservations per plate, 2 plates per profile',
  },
  solitude: {
    reservation: {
      dates: [
        '2026-12-18',
        '2026-12-19',
        '2026-12-20',
        '2026-12-25..2026-12-31',
        '2027-01-01..2027-01-03',
        '2027-01-08..2027-01-10',
        '2027-01-15..2027-01-18',
        '2027-01-22..2027-01-24',
        '2027-01-29..2027-01-31',
      ],
      before: '11:00',
    },
    priceUsd: { '1-3': 35, '4+': 0 }, // 4+ is free but the reservation is still required
    lotOpens: '07:00',
    book: 'https://reservenski.parksolitude.com/',
    cancelBy: '06:00',
    releases:
      'opens 2026-10-15 (08:00 or 18:00 MT, sources disagree, O23); Sundays 18:00 for the next weekend; day-of 06:00; hold max 3',
    limits: 'single-day users hold max 3 days at a time: split bookings across drivers',
  },
  snowbird: {
    reservation: null,
    freeLots: true, // first-come
    busy: 'FRI_SAT_SUN_HOL',
    paid: {
      book: 'https://www.parkwhiz.com/ (search "Snowbird Resort")',
      prices: 'TBA 26/27 (25/26: Lower Gad/Pond $25 Mon-Thu, $35 Fri-Sun+Hol)',
      before: '13:00',
      refundBy: '07:00',
    },
  },
  'deer-valley': { reservation: null, parking: 'free first-come (25/26 baseline; 26/27 unpublished)' },
  snowbasin: {
    reservation: null,
    carpool: "Earl's A-E 3+ until 11:00 weekends/holidays; weekdays Lot A carpool-only",
  },
} as const satisfies Record<ResortId, ParkingRule>;

// Snowbird/Snowbasin "busy" flags; neither resort publishes holiday dates.
export const ASSUMED_HOLIDAYS = ['2026-12-25..2027-01-03', '2027-01-18'] as const;

// UTA ski bus (C.7): free with Ikon; the fallback when required parking is not booked (STRATEGY.busPen).
export const UTA_SKI_BUS = {
  from: '2026-12-06',
  routes: { bcc: ['972'], lcc: ['994', 'CS1', 'CS2'], snowbasin: ['675', '677'] },
  stops: ['6200 S Wasatch P&R', 'BCC P&R'],
} as const;
