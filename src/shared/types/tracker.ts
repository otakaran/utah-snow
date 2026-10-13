// GET /api/tracker wire shapes (spec §7, §9.3): the GET body, a 200's `state` and a 409's `current`.
// The worker builds them (api/tracker/get.ts); the web store parses them (src/web/data/tracker/wire.ts).
// They never carry ip_hash, client_id or updated_by.
import type { BookingKind, SkiMode } from './pick.ts';
import type { CapGroupId, TrackerResort } from './resort.ts';

export type DayStatus = 'planned' | 'skied';
export type TrackerEntity = 'ski_days' | 'people' | 'bookings';

/** An active crew member. `updatedAt` is the optimistic-concurrency token. */
export interface TrackerPerson {
  id: string;
  name: string;
  mode: SkiMode;
  color: string;
  updatedAt: number;
}

export interface TrackerDayRow {
  personId: string;
  date: string; // YYYY-MM-DD, America/Denver
  resortId: TrackerResort;
  status: DayStatus;
  updatedAt: number;
}

export interface TrackerBookingRow {
  date: string;
  kind: BookingKind;
  personId: string; // '*' = car-level parking
  note: string | null;
  updatedAt: number;
}

export interface TrackerAuditRow {
  id: number;
  at: number; // epoch ms
  action: string;
  entity: TrackerEntity;
  key: string;
  before: unknown;
  after: unknown;
  undoneBy: number | null;
}

/** Days used per cap group (src/shared/caps.ts `summary`). */
export interface TrackerCapCount {
  cap: number | null; // null = unlimited
  skied: number;
  planned: number;
  remaining: number | null;
}

export interface TrackerState {
  people: TrackerPerson[];
  days: TrackerDayRow[];
  bookings: TrackerBookingRow[];
  audit: TrackerAuditRow[]; // newest first, last 50
  summary: Record<string, Record<CapGroupId, TrackerCapCount>>; // by person id
  serverTime: number; // epoch ms
}
