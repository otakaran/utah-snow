// Pure view helpers for the resort page (spec §8.7): the season status word, lift grouping, C.8 lift hours, days
// left and the drive line (the snow-level word is conditions/forecast-rows.ts `levelStatus`). No Date/Intl.
import { CAP_GROUPS } from '../../../../config/ikon.ts';
import { type LiftHours, type LiftWindow, RESORTS } from '../../../../config/resorts.ts';
import { type CapDay, crewRemaining, group, remaining } from '../../../shared/caps.ts';
import type { Badge } from '../../../shared/freshness.ts';
import type { DriveMatrix } from '../../../shared/geo.ts';
import type { ParkingDay } from '../../../shared/parking.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { LiftStatus, PointForecast, ResortId, ResortSnapshot } from '../../../shared/types.ts';
import type { StatusWord } from '../../ui/status.ts';

const SEASON: Record<ResortSnapshot['season'], StatusWord> = {
  open: { tone: 'ok', word: 'Open' },
  'closed-for-day': { tone: 'bad', word: 'Closed today' },
  preseason: { tone: 'off', word: 'Pre-season' },
  unknown: { tone: 'off', word: 'Unknown' },
};

export const seasonStatus = (season: ResortSnapshot['season'] | undefined): StatusWord =>
  season ? SEASON[season] : SEASON.unknown;

/** Stale data never shows a solid state (the chip turns into 'Last known: Open?'). */
export const isStale = (fresh: Badge | null): boolean => fresh === 'amber' || fresh === 'red';

/** A resort row with every section the page reads, else null (a seeded or legacy row may be `{}`). */
export function resortData(data: ResortSnapshot | null | undefined): ResortSnapshot | null {
  const d = data as Partial<ResortSnapshot> | null | undefined;
  return d?.snow && d.weather && d.lifts && d.trails ? (d as ResortSnapshot) : null;
}

/** A point forecast with its days, else null. */
export const forecastData = (f: PointForecast | null | undefined): PointForecast | null =>
  Array.isArray(f?.days) ? (f as PointForecast) : null;

/**
 * Lifts grouped by `area` in feed order (no area: 'Lifts'). When every area holds a single lift (feeds that use the
 * lift name as its area), the list stays flat under 'Lifts'.
 */
export function groupByArea(list: readonly LiftStatus[]): { area: string; lifts: LiftStatus[] }[] {
  const groups = new Map<string, LiftStatus[]>();
  for (const l of list) {
    const key = l.area?.trim() || 'Lifts';
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }
  if (groups.size > 1 && groups.size === list.length) return [{ area: 'Lifts', lifts: [...list] }];
  return [...groups].map(([area, lifts]) => ({ area, lifts }));
}

/** '16:30' -> '4:30 PM'; anything else passes through. */
export function hm12(hm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm ?? '');
  if (!m) return hm ?? '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** '9:15 AM–4:30 PM'; '' when both ends are missing. */
export const span12 = (open: string | null | undefined, close: string | null | undefined): string =>
  open || close ? `${hm12(open) || '?'}–${hm12(close) || '?'}` : '';

export interface HoursLine {
  label: string;
  hours: string;
  note?: string;
}

const liftNames = (w: LiftWindow): string => (w.lifts === 'all' ? 'All lifts' : w.lifts.join(', '));
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Appendix C.8 hours as display lines: day windows, early season, night riding with its exceptions. */
export function hoursLines(id: ResortId): HoursLine[] {
  const h: LiftHours = RESORTS[id].liftHours;
  const out: HoursLine[] = h.day.map((w) => ({ label: liftNames(w), hours: span12(w.open, w.close) }));
  if (h.early) out.push({ label: `Early season: ${liftNames(h.early)}`, hours: span12(h.early.open, h.early.close) });
  if (h.night) {
    const dates = h.night.noDates.map((d) => formatLocalDate(d, 'md'));
    const no = [...h.night.noWeekdays.map((d) => `${WEEKDAY[d] ?? d}s`), ...dates].join(', ');
    out.push({ label: `Night: ${liftNames(h.night)}`, hours: span12(h.night.open, h.night.close), note: `not ${no}` });
  }
  return out;
}

export const hoursSource = (id: ResortId): string => (RESORTS[id].liftHours as LiftHours).source;

export interface DriveInfo {
  min: number;
  mi: number | null; // exact drives only (a preset row or /api/drive)
  via: string | null;
  warning: string | null; // /api/drive: the route crosses Guardsman Pass
  from: string;
  approx: boolean; // custom base without an /api/drive result for this resort: the nearest preset's row (C.6)
  delayMin: number | null; // live sign delay over its baseline (C.10); null = no sign or no usable reading
}

/** The head's drive line from the pick card's drive matrix and live delays for the active base. */
export function driveInfo(
  base: { label: string },
  id: ResortId,
  matrix: Pick<DriveMatrix, 'min' | 'exact'>,
  live: number | null | undefined,
): DriveInfo {
  const exact = matrix.exact[id];
  return {
    min: matrix.min[id],
    mi: exact?.mi ?? null,
    via: exact?.via ?? null,
    warning: exact?.warning ?? null,
    from: base.label,
    approx: !exact,
    delayMin: live ?? null,
  };
}

/** '7 / 12'; '—' when the open count is unknown. */
export function ofTotal(open: number | null | undefined, total: number | null | undefined): string {
  if (open === null || open === undefined) return '—';
  return total ? `${open} / ${total}` : String(open);
}

export interface DaysLeft {
  group: string; // 'Alta/Snowbird'
  cap: number | null; // null = unlimited
  me: number | null; // null = "I am" unset
  crew: number | null; // fewest left across the crew; null = no crew yet
}

/** Ikon days left in the resort's cap group for "me" and the crew minimum (spec §8.7 head, §9.2). */
export function daysLeft(id: ResortId, days: readonly CapDay[], crew: readonly string[], me: string | null): DaysLeft {
  const g = group(id);
  const def = CAP_GROUPS[g];
  if (def.cap === null) return { group: def.label, cap: null, me: null, crew: null };
  return {
    group: def.label,
    cap: def.cap,
    me: me ? remaining(days, me, g) : null,
    crew: crew.length > 0 ? crewRemaining(days, crew, g) : null,
  };
}

/** Link text for a parking day's booking URL. */
export function bookLabel(p: ParkingDay): string {
  if (p.liftReservation) return 'Ikon reservation';
  if (p.required) return 'Book';
  return p.resort === 'snowbird' ? 'Paid lots' : 'Reservations';
}
