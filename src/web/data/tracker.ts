// TODO(tracker phase): typed placeholder for the tracker store (spec §9.5, §8.8). It will poll /api/tracker
// (30 s on #/tracker, 10 min elsewhere) and fill these signals; until then the crew is empty, so the pick runs
// with one virtual skier and the briefing shows "Add the crew in Tracker". Keep the exported names and shapes.
import { computed, signal } from '@preact/signals';
import type { PickTracker, SkiMode } from '../../shared/types.ts';

/** One crew member (`people` row without the timestamps). */
export interface Person {
  id: string;
  name: string;
  mode: SkiMode;
  color?: string;
}

export type TrackerDay = PickTracker['days'][number];
export type TrackerBooking = NonNullable<PickTracker['bookings']>[number];

/** Everyone in the tracker (deleted people excluded). */
export const people = signal<Person[]>([]);

/** Every planned or skied day of every person. */
export const skiDays = signal<TrackerDay[]>([]);

/** Recorded bookings (parking per car '*', DV lift reservations per person). */
export const bookings = signal<TrackerBooking[]>([]);

/** True once the first /api/tracker answer arrived (the placeholder never loads). */
export const trackerLoaded = signal(false);

/** The tracker as the pick engine reads it. */
export const pickTracker = computed<PickTracker>(() => ({
  people: people.value,
  days: skiDays.value,
  bookings: bookings.value,
}));
