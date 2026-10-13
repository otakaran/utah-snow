// Test-only builders for the pick scenarios (spec §10.4 common setup): every source fresh, roads open, no gusts or
// holds, danger 2, snow given as the overnight report (eff = o). Never imported by app code.
import { TRIP } from '../../../config/ikon.ts';
import { RESORT_IDS } from '../../../config/resorts.ts';
import { addDays, isoUtc, localDate, MIN, zonedToUtc } from '../time.ts';
import type {
  BookingKind,
  Corridor,
  Meta,
  PickArgs,
  PickTracker,
  PointForecast,
  ResortId,
  ResortSnapshot,
  RoadState,
  RoadStatus,
  SkiMode,
  Snapshot,
  TrackerResort,
} from '../types.ts';

export type Inches = Partial<Record<ResortId, number>>;
type Booking = NonNullable<PickTracker['bookings']>[number];

/** Denver wall time 'YYYY-MM-DD HH:MM' as epoch ms. */
export const at = (local: string): number => zonedToUtc(local) ?? Number.NaN;

/** Same overnight inches at every resort, then per-resort overrides. */
export const all = (inches: number, over: Inches = {}): Inches => ({
  ...Object.fromEntries(RESORT_IDS.map((r) => [r, inches])),
  ...over,
});

const meta = (source: string, nowMs: number): Meta => {
  const ok = isoUtc(nowMs - 5 * MIN);
  return { source, fetchedAt: ok, okAt: ok, asOf: ok, status: 'ok', failCount: 0, staleAfterMin: 60 };
};

export interface SnapOpts {
  o?: Inches; // overnight report inches
  tonight?: Inches; // NWS tonightSnowIn
  tomorrowDay?: Inches; // NWS tomorrowDaytimeSnowIn
  roads?: Partial<Record<Corridor, RoadState>>;
  operating?: boolean;
}

export function snap(nowMs: number, opts: SnapOpts = {}): Snapshot {
  const resorts = {} as Snapshot['resorts'];
  const forecast: Snapshot['forecast'] = {};
  const reportAt = isoUtc(at(`${localDate(nowMs)} 06:05`));
  for (const r of RESORT_IDS) {
    const snow = { overnightIn: opts.o?.[r] ?? 0, new24hIn: null, reportIsToday: true, reportAt };
    const lifts = { open: 10, hold: 0, scheduled: 0, total: 10, list: [] };
    const data = { id: r, operatingToday: opts.operating ?? true, snow, lifts, weather: { summitGustMph: null } };
    resorts[r] = { data: data as unknown as ResortSnapshot, meta: meta(`resort:${r}`, nowMs) };
    const fc = {
      todayDaytimeSnowIn: 0,
      tonightSnowIn: opts.tonight?.[r] ?? 0,
      tomorrowDaytimeSnowIn: opts.tomorrowDay?.[r] ?? 0,
      overnight: { snowIn: 0, issuedAt: isoUtc(nowMs - 60 * MIN) },
      updateTime: isoUtc(nowMs - 60 * MIN),
      days: [],
    };
    forecast[`${r}:summit`] = { data: fc as unknown as PointForecast, meta: meta(`nws:${r}:summit`, nowMs) };
  }
  const roads = {} as Snapshot['roads'];
  for (const c of ['lcc', 'bcc', 'parleys', 'snowbasin'] as const) {
    const data = { corridor: c, state: opts.roads?.[c] ?? 'open', eto: null, reason: null };
    roads[c] = { data: data as unknown as RoadStatus, meta: meta(`roads:${c}`, nowMs) };
  }
  const zone = (zoneId: number) => ({ zoneId, level: 2, danger: 'moderate', offSeason: false });
  return {
    v: 1,
    generatedAt: isoUtc(nowMs),
    trip: { start: TRIP.start, end: TRIP.end },
    resorts,
    forecast,
    afd: { data: null, meta: meta('nws:afd', nowMs) },
    alerts: { data: [], meta: meta('nws:alerts', nowMs) },
    avalanche: { data: [zone(1738), zone(1737)] as Snapshot['avalanche']['data'], meta: meta('avy:uac', nowMs) },
    roads,
    snotel: { data: {}, meta: meta('snotel', nowMs) },
    obs: { data: {}, meta: meta('obs', nowMs) },
    sources: [],
  };
}

export interface PersonSpec {
  id: string;
  name: string;
  mode?: SkiMode;
  used?: Partial<Record<TrackerResort, number>>; // days already skied per resort (dates outside any target)
}

export const OTAKAR: PersonSpec = { id: 'o', name: 'Otakar', mode: 'ski' };
export const EVA: PersonSpec = { id: 'e', name: 'Eva', mode: 'ski' };

/** Every required parking (car-level) and each person's DV lift reservation on `date`. */
export function allBooked(date: string, people: readonly PersonSpec[]): Booking[] {
  const kinds: BookingKind[] = ['alta-parking', 'brighton-parking', 'solitude-parking'];
  return [
    ...kinds.map((kind) => ({ date, kind, personId: '*' })),
    ...people.map((p) => ({ date, kind: 'dv-lift' as const, personId: p.id })),
  ];
}

export function tracker(people: readonly PersonSpec[], bookings: Booking[] = []): PickTracker {
  const days: PickTracker['days'][number][] = [];
  for (const p of people) {
    let i = 0;
    for (const [resortId, n] of Object.entries(p.used ?? {}) as [TrackerResort, number][]) {
      for (let k = 0; k < n; k++) {
        days.push({ personId: p.id, date: addDays('2026-11-01', i++), resortId, status: 'skied' });
      }
    }
  }
  return { people: people.map(({ id, name, mode = 'ski' }) => ({ id, name, mode })), days, bookings };
}

export interface Scenario extends SnapOpts {
  people?: readonly PersonSpec[];
  bookings?: Booking[] | 'all';
  scope?: PickArgs['scope'];
  memberIds?: string[];
}

/** PickArgs for one scenario at Denver wall time `local` (default base cottonwood-heights, all booked). */
export function scenario(local: string, s: Scenario = {}): PickArgs {
  const nowMs = at(local);
  const people = s.people ?? [OTAKAR];
  const bookings =
    s.bookings === undefined || s.bookings === 'all' ? allBooked(local.slice(0, 10), people) : s.bookings;
  return {
    snap: snap(nowMs, s),
    tracker: tracker(people, bookings),
    nowMs,
    scope: s.scope ?? 'crew',
    memberIds: s.memberIds ?? people.map((p) => p.id),
  };
}
