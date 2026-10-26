// Pure view logic for the wall's week strip and its full-screen weather page (spec §8.4): day initials, the storm
// callout, the week table's cell wash, the 48 h hourly lanes (Open-Meteo through the conditions builders, one shared
// scale) and their fallback, NWS day/night halves. Values arrive imperial and are formatted with units.ts only.
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import { addDays, formatLocalDate, localParts } from '../../../shared/time.ts';
import type { Block, PointForecast, ResortId } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { type OmData, type OmModel, type OmStatus, omFor } from '../../data/open-meteo.ts';
import { ageText, clock } from '../../lib/format.ts';
import { niceMax } from '../../ui/chart.ts';
import {
  dayOf,
  type HourlyWindow,
  headline,
  hourLabel,
  hourlyWindow,
  range,
  stormDay,
  type WeekRow,
} from '../conditions/index.ts';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sum = (vals: readonly (number | null)[]): number | null => {
  const ok = vals.filter(finite);
  return ok.length ? ok.reduce((a, b) => a + b, 0) : null;
};

/** 'T' for a Tuesday: the strip's day initials. */
export const dayInitial = (date: string): string => formatLocalDate(date, 'weekday').slice(0, 1);

/** The current local hour as 'YYYY-MM-DDTHH:00' (the hourly window's start); '' for an invalid now. */
export function hourStart(nowMs: number): string {
  const p = localParts(nowMs);
  return p ? `${p.date}T${p.hm.slice(0, 2)}:00` : '';
}

export interface StormHeadline {
  date: string;
  id: ResortId;
  /** 'Thu 8–14″ · Alta' (the page sets it in capitals). */
  text: string;
}

/**
 * The week's single biggest summit day across every resort, with that resort's base–summit range; null when dry or
 * when NWS has no day at all (`weekHeadline` tells the two apart).
 */
export function stormHeadline(rows: readonly WeekRow[], units: Units): StormHeadline | null {
  const s = stormDay(rows);
  const row = s ? rows.find((r) => r.id === s.id) : undefined;
  const day = s ? row?.days.find((d) => d.date === s.date) : undefined;
  if (!s || !row || !day) return null;
  const snow = range('snow', [day.baseIn, day.summitIn], units);
  return { date: s.date, id: s.id, text: `${formatLocalDate(s.date, 'weekday')} ${snow} · ${row.name}` };
}

/** The weather page's callout: the storm day, else 'Dry week', or 'No NWS forecast' when no resort has a known day. */
export function weekHeadline(rows: readonly WeekRow[], storm: StormHeadline | null): string {
  if (storm) return storm.text;
  return rows.some((r) => r.days.some((d) => d.summitIn !== null || d.baseIn !== null))
    ? 'Dry week'
    : 'No NWS forecast';
}

/** Per row and day, the cell wash (0..1): summit snow over the table's biggest day, 6″ at least; 0 when dry. */
export function dayWash(rows: readonly WeekRow[]): number[][] {
  const top = Math.max(6, ...rows.flatMap((r) => r.days.map((d) => d.summitIn ?? 0)));
  return rows.map((r) => r.days.map((d) => (finite(d.summitIn) && d.summitIn > 0 ? Math.min(1, d.summitIn / top) : 0)));
}

/** The shared top of every hourly lane (inch per hour): `niceMax` over all of them, never under 0.5″/h. */
export const hourlyScale = (series: readonly (readonly (number | null)[])[]): number => niceMax(series.flat(), 0.5);

export interface HourlyLane {
  id: ResortId;
  name: string;
  /** The headline model (NBM, else HRRR / ECMWF / GFS with >= 90 % of the window), null when none qualifies. */
  model: OmModel | null;
  values: (number | null)[];
  totalIn: number | null;
}

export interface HourlyView {
  /** The first resort's window: positions, night spans and midnights for the shared axis. */
  window: HourlyWindow;
  lanes: HourlyLane[];
  max: number;
}

/**
 * One snowfall lane per resort over `hours` from `fromIso` (each on its own location's window, `headline` picks the
 * model). Null when no resort has a headline series: the cache misses the hour or no model covers the window.
 */
export function pickHourly(om: OmData['data'] | null | undefined, fromIso: string, hours = 48): HourlyView | null {
  let axis: HourlyWindow | null = null;
  const lanes: HourlyLane[] = [];
  for (const id of RESORT_IDS) {
    const loc = omFor(om, id);
    const w = hourlyWindow(loc, fromIso, hours);
    const h = w ? headline(loc, 'snowfall', w.idx) : null;
    if (w && h && !axis) axis = w;
    const values = h?.values ?? [];
    lanes.push({ id, name: RESORTS[id].name, model: h?.model ?? null, values, totalIn: h ? sum(values) : null });
  }
  if (!axis) return null;
  return { window: axis, lanes, max: hourlyScale(lanes.map((l) => l.values)) };
}

const LABEL: Record<OmModel, string> = {
  ncep_hrrr_conus: 'HRRR',
  ncep_nbm_conus: 'NBM',
  ecmwf_ifs: 'ECMWF',
  ncep_gfs_global: 'GFS',
};

/** 'NBM' or 'NBM, HRRR': the models the lanes drew, in lane order. */
export const laneModels = (lanes: readonly HourlyLane[]): string =>
  [...new Set(lanes.flatMap((l) => (l.model ? [LABEL[l.model]] : [])))].join(', ');

/** Axis labels at every local 00/06/12/18 (a weekday at midnight), as % of the width; none at the very edges. */
export function hourTicks(w: HourlyWindow): { left: number; label: string }[] {
  const n = w.time.length;
  return w.time.flatMap((t, p) => {
    const h = Number(t.slice(11, 13));
    if (h % 6 !== 0 || p < 2 || p > n - 2) return [];
    return [{ left: (p / n) * 100, label: h === 0 ? formatLocalDate(t.slice(0, 10), 'weekday') : hourLabel(t) }];
  });
}

export interface NwsHalf {
  date: string;
  half: 'day' | 'night';
  /** 'Today', 'Tonight', 'Wed', 'Wed night'. */
  label: string;
}

/** The 4 NWS halves (day 6 AM–6 PM, night 6 PM–6 AM, booked on its evening's date) that cover the next 48 h. */
export function nwsHalves(today: string, hour: number): NwsHalf[] {
  if (!today || !Number.isFinite(hour)) return [];
  let date = hour < 6 ? addDays(today, -1) : today;
  let half: NwsHalf['half'] = hour >= 6 && hour < 18 ? 'day' : 'night';
  const out: NwsHalf[] = [];
  for (let i = 0; i < 4; i++) {
    const wd = formatLocalDate(date, 'weekday');
    const label = date === today ? (half === 'day' ? 'Today' : 'Tonight') : half === 'day' ? wd : `${wd} night`;
    out.push({ date, half, label });
    if (half === 'night') date = addDays(date, 1);
    half = half === 'day' ? 'night' : 'day';
  }
  return out;
}

type Forecasts = Record<string, Block<PointForecast>> | undefined;

/** The hourly fallback: per resort, NWS snow for each half as a bare base–summit range ('2–5', '0', '—'). */
export function nwsBuckets(
  forecast: Forecasts,
  halves: readonly NwsHalf[],
  units: Units,
): { id: ResortId; name: string; cells: string[] }[] {
  return RESORT_IDS.map((id) => {
    const at = (point: string, h: NwsHalf) => {
      const d = dayOf(forecast?.[`${id}:${point}`]?.data, h.date);
      return h.half === 'day' ? d?.snowDayIn : d?.snowNightIn;
    };
    const cells = halves.map((h) => range('snow', [at('base', h), at('summit', h)], units, true));
    return { id, name: RESORTS[id].name, cells };
  });
}

/**
 * The hourly section's status line. With lanes: models, age and the shared scale; without: why, then that NWS
 * halves stand in ('Hourly models unavailable · Open-Meteo rate-limited, next try 3:05 PM · showing NWS day/night
 * totals'). A held 429 shows its next try either way.
 */
export function hourlyNote(
  view: HourlyView | null,
  om: { at: number; status: OmStatus; retryAt: number },
  scale: string,
  nowMs: number,
): string {
  const held = om.retryAt > nowMs ? `Open-Meteo rate-limited, next try ${clock(om.retryAt)}` : null;
  if (view) {
    const age = om.at > 0 ? `, updated ${ageText((nowMs - om.at) / 60_000)}` : '';
    return [`Hourly snowfall: ${laneModels(view.lanes)} via Open-Meteo${age}`, `bars to ${scale}/h`, held]
      .filter(Boolean)
      .join(' · ');
  }
  const why =
    held ?? (om.status === 'loading' ? 'loading Open-Meteo' : om.status === 'error' ? 'Open-Meteo unreachable' : null);
  return ['Hourly models unavailable', why, 'showing NWS day/night totals'].filter(Boolean).join(' · ');
}
