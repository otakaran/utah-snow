// MtnPowder legacy feed -> ResortSnapshot (spec §5.4, §5.5). Pure and runtime-agnostic: the Worker adapter
// (src/worker/sources/mtnpowder.ts) and the browser fallback (O1: Imperva blocks Worker egress, the feed sends
// ACAO *) both run it. Numbers arrive as int or string ('6.0', '0', '--'), so every field goes through num().
import { arr, type Obj, obj } from './json.ts';
import { liftId } from './lifts.ts';
import { num, range, text } from './num.ts';
import { prevOpenedAt, reportIsToday, seasonState } from './season.ts';
import { hm24, isoToMs, localParts } from './time.ts';
import type { Gate, LiftState, LiftStatus, ResortSnapshot, RoadState, SnowNumbers, WeatherNow } from './types.ts';

export const MTNPOWDER = {
  solitude: { resortId: 65, name: 'Solitude' },
  'deer-valley': { resortId: 49, name: 'Deer Valley' }, // 50 is 'Deer Valley Summer'
} as const;
export type MtnResort = keyof typeof MTNPOWDER;

/** Feed URL; the browser fallback passes `bust` (epoch ms) to append `&_={ts}`. */
export function mtnpowderUrl(resort: MtnResort, bust?: number): string {
  const url = `https://mtnpowder.com/feed?resortId=${MTNPOWDER[resort].resortId}`;
  return bust === undefined ? url : `${url}&_=${bust}`;
}

export type MtnParse = { ok: true; data: ResortSnapshot; unmapped: string[] } | { ok: false; error: string };

const rec = (v: unknown): Obj => obj(v) ?? {}; // total reads: a missing branch is an empty record
const MISSING_RE = /^(?:--|-|n\/a|null|none)$/i;
const OFFSET_RE = /([+-]\d{2})(\d{2})$/;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Display text (tags stripped, entities decoded) or null for '--', 'N/A' and blanks. */
function clean(v: unknown, max = 600): string | null {
  const t = text(v, max);
  return t && !MISSING_RE.test(t) ? t : null;
}

/** 'YYYY-MM-DDTHH:mm:ss±HHMM' -> '…±HH:MM'; null unless the result parses as a zoned instant. */
export function mtnIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(OFFSET_RE, '$1:$2');
  return isoToMs(s) === null ? null : s;
}

const OPEN = [
  ...['open', 'open_first_tracks', 'open_to_mid_station_only', 'mid_station_only', 'open_closes_tomorrow'],
  ...['30_mins_or_less', 'windy_conditions', 'open_but_closed_to_foot_traffic'],
];
const HOLD = ['hold', 'weather_hold', 'wind_hold', 'mechanical_hold', 'patrol_hold', 'lightning_hold'];
const SCHEDULED = [
  ...['scheduled', 'expected', 'anticipated_weather_impact', 'scheduled_to_mid_station_only', 'delayed'],
  ...['pending_mitigation', 'pending_avalanche_mitigation'],
];
const CLOSED = [
  ...['closed', 'closed_for_season', 'wind_closure', 'mechanical_closure', 'lightning_closure', 'patrol_closure'],
  ...['closed_opens_tomorrow', 'download_only', 'open_uphill_only', 'open_ski_ride_school_only'],
];
const TABLE = new Map<string, LiftState>([
  ...OPEN.map((s) => [s, 'open'] as const),
  ...HOLD.map((s) => [s, 'hold'] as const),
  ...SCHEDULED.map((s) => [s, 'scheduled'] as const),
  ...CLOSED.map((s) => [s, 'closed'] as const),
]);

/**
 * §5.5 MtnPowder normalizer: slug of the display `Status` (StatusEnglish only as fallback; StatusId is untrusted),
 * exact table, then the regex fallback. `known` is false for values that fell through to 'closed' (log them).
 */
export function mtnLiftState(status: unknown): { state: LiftState; known: boolean } {
  const raw = typeof status === 'string' ? status : '';
  const slug = raw
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (!slug) return { state: 'unknown', known: false };
  const hit = TABLE.get(slug);
  if (hit) return { state: hit, known: true };
  if (/hold/.test(slug)) return { state: 'hold', known: true };
  if (/mitigation|delay|schedul|expect|anticipat/.test(slug)) return { state: 'scheduled', known: true };
  if (/closure|closed|^clos/.test(slug)) return { state: 'closed', known: true };
  if (/^open/.test(slug)) return { state: 'open', known: true };
  return { state: 'closed', known: false };
}

const statusOf = (r: Obj): string => clean(r.Status, 80) ?? clean(r.StatusEnglish, 80) ?? '';

function lift(l: Obj, weekday: number, unmapped: string[]): LiftStatus | null {
  const name = clean(l.Name, 80);
  if (!name) return null;
  const raw = statusOf(l);
  const { state, known } = mtnLiftState(raw);
  if (!known && raw) unmapped.push(raw);
  const hours = rec(rec(l.Hours)[DAYS[weekday] ?? '']);
  const id = typeof l.Id === 'number' || (typeof l.Id === 'string' && l.Id.trim()) ? String(l.Id) : liftId(name);
  return {
    id,
    name,
    state,
    raw,
    area: clean(l.MountainAreaName, 80),
    opensAt: typeof hours.Open === 'string' ? hm24(hours.Open) : null,
    closesAt: typeof hours.Close === 'string' ? hm24(hours.Close) : null,
    updatedAt: mtnIso(l.UpdateDate),
  };
}

const inches = (v: unknown, max: number) => range(num(v), 0, max);

/** Mid-Mountain is the headline area (§5.5); another area only when Mid has no 24 h number at all. */
function headlineArea(sr: Obj): { a: Obj; area: SnowNumbers['area'] } {
  const mid = rec(sr.MidMountainArea);
  if (num(mid.Last24HoursIn) !== null) return { a: mid, area: 'mid' };
  for (const [key, area] of [
    ['SummitArea', 'summit'],
    ['BaseArea', 'base'],
  ] as const) {
    if (num(rec(sr[key]).Last24HoursIn) !== null) return { a: rec(sr[key]), area };
  }
  return { a: mid, area: 'mid' };
}

function snowNumbers(sr: Obj, now: number, preseason: boolean): SnowNumbers {
  const { a, area } = headlineArea(sr);
  const reportAt = mtnIso(sr.LastUpdate);
  const n = (v: unknown, max: number) => (preseason ? null : inches(v, max));
  const s = rec(sr.SummitArea);
  const summit = { overnightIn: n(s.SinceLiftsClosedIn, 80), new24hIn: n(s.Last24HoursIn, 100) };
  const hasSummit = area !== 'summit' && (summit.overnightIn !== null || summit.new24hIn !== null);
  return {
    overnightIn: n(a.SinceLiftsClosedIn, 80),
    new12hIn: null,
    new24hIn: n(a.Last24HoursIn, 100),
    new48hIn: n(a.Last48HoursIn, 150),
    new72hIn: n(a.Last72HoursIn, 200),
    new7dIn: n(a.Last7DaysIn, 300),
    stormTotalIn: n(sr.StormTotalIn, 400),
    seasonTotalIn: n(sr.SeasonTotalIn, 1200),
    baseDepthIn: n(a.BaseIn, 400),
    reportAt,
    reportIsToday: reportIsToday(reportAt, now),
    area,
    ...(hasSummit ? { summit } : {}),
    surface: preseason ? null : clean(sr.BaseConditions, 80), // off-season it is last season's label
    text: clean(sr.Report) ?? clean(sr.AdditionalText),
  };
}

function weatherNow(cc: Obj): WeatherNow {
  const [b, m, s] = [rec(cc.Base), rec(cc.MidMountain), rec(cc.Summit)]; // MidMountain.Name was 'Summit' in 2022/23
  const temp = (v: unknown) => range(num(v), -60, 110);
  const wind = range(num(s.WindStrengthMph), 0, 200);
  return {
    baseTempF: temp(b.TemperatureF),
    midTempF: temp(m.TemperatureF),
    summitTempF: temp(s.TemperatureF),
    summitWindMph: wind,
    summitGustMph: range(num(s.WindGustsMph), 0, 250),
    windDir: wind === null ? null : clean(s.WindDirection, 24),
    sky: clean(s.Skies, 60) ?? clean(m.Skies, 60) ?? clean(b.Skies, 60),
    obsAt: mtnIso(s.FeedSavedTime) ?? mtnIso(m.FeedSavedTime) ?? mtnIso(b.FeedSavedTime),
    src: 'mtnpowder',
  };
}

/** DV `Roads[]` (staff-entered, coarse): a hint only; UDOT stays the source of truth. */
function roadHint(roads: Obj[]): ResortSnapshot['roadHint'] {
  const named = roads.filter((r) => clean(r.Name, 40));
  if (named.length === 0) return undefined;
  const chains = (r: Obj) => /^y/i.test(clean(r.ChainsRequired, 8) ?? '');
  const raw = named.map((r) => `${clean(r.Name, 40)}: ${statusOf(r) || '?'}${chains(r) ? ' (chains)' : ''}`).join('; ');
  const states = named.map((r) => mtnLiftState(statusOf(r)).state);
  let state: RoadState = 'unknown';
  if (states.includes('closed')) state = 'closed';
  else if (named.some(chains)) state = 'traction';
  else if (states.every((s) => s === 'open')) state = 'open';
  return { raw, state };
}

/**
 * Validates and normalizes one feed body. `prev` is the last-good ResortSnapshot for this resort (or null);
 * only its `seasonOpenedAt` is read. Gate (§5.2): `$.Name` is exactly the resort's name and `SnowReport` is an object.
 */
export function parseMtnPowder(json: unknown, resort: MtnResort, now: number, prev: unknown): MtnParse {
  const root = rec(json);
  const want = MTNPOWDER[resort].name;
  if (root.Name !== want)
    return { ok: false, error: `Name is ${JSON.stringify(root.Name)?.slice(0, 40)}, not ${want}` };
  const sr = rec(root.SnowReport);
  if (Object.keys(sr).length === 0) return { ok: false, error: 'SnowReport missing' };
  const unmapped: string[] = [];
  const weekday = localParts(now)?.weekday ?? 0;
  const areas = arr(root.MountainAreas).map(rec);
  const list = areas.flatMap((a) => arr(a.Lifts).map((l) => lift(rec(l), weekday, unmapped))).filter((l) => l !== null);
  const count = (st: LiftState) => list.filter((l) => l.state === st).length;
  const total = range(num(sr.TotalLifts), 1, 100) ?? list.length;
  const open = range(num(sr.TotalOpenLifts), 0, total) ?? count('open');
  const st = seasonState(
    list.map((l) => l.state),
    prevOpenedAt(prev),
    now,
    { running: open > 0 },
  );
  const gates: Gate[] = areas
    .filter((a) => a.Name === 'Terrain Areas')
    .flatMap((a) => arr(a.Activities).map(rec))
    .flatMap((g) => {
      const name = clean(g.Name, 80);
      return name ? [{ name, state: mtnLiftState(statusOf(g)).state, note: null }] : [];
    });
  const alerts = [...new Set([clean(sr.Alert), clean(sr.LiftNotification)].filter((t) => t !== null))];
  const hint = roadHint(arr(root.Roads).map(rec));
  const data: ResortSnapshot = {
    id: resort,
    ...st,
    snow: snowNumbers(sr, now, st.season === 'preseason'),
    weather: weatherNow(rec(root.CurrentConditions)),
    lifts: { open, hold: count('hold'), scheduled: count('scheduled'), total, list },
    trails: {
      open: range(num(sr.TotalOpenTrails), 0, 500),
      total: range(num(sr.TotalTrails), 1, 500),
      groomed: range(num(sr.GroomedTrails), 0, 500),
    },
    gates,
    parking: { state: 'unknown', raw: null }, // the legacy feed has no live lot status (v3 only)
    alerts,
    ...(hint ? { roadHint: hint } : {}),
  };
  return { ok: true, data, unmapped: [...new Set(unmapped)] };
}
