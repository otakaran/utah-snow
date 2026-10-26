// Pure view logic for ForecastPanel (spec §8.2, §8.8): NWS base/summit rows -> per-resort snow ranges
// (today 08-16, tonight 16-08, tomorrow 08-16), summit wind, temps and snow level against the true elevations
// (`levelStatus` is the Snow / Mix / Rain word the resort and weather pages chip), plus the Open-Meteo model
// spread. Values arrive imperial and are formatted with src/shared/units.ts only.
import { RESORTS } from '../../../../config/resorts.ts';
import type { NwsDay, PointForecast, ResortId } from '../../../shared/types.ts';
import { fmt, type Kind, type Units } from '../../../shared/units.ts';
import type { OmSeries } from '../../data/open-meteo.ts';
import type { StatusWord } from '../../ui/status.ts';

const DASH = '—';
const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Min–max of the values in display units ('1.1–2.9″', '3–7 cm'); one value when both ends print the same.
 * Snow drops a trailing '.0' so forecast ranges read like NWS ranges ('0–1″', not '0.0–1.0″').
 * `bare` leaves the unit off (table cells, where the unit sits in a note).
 */
export function range(kind: Kind, values: readonly (number | null | undefined)[], units: Units, bare = false): string {
  const ok = values.filter(finite);
  if (ok.length === 0) return DASH;
  const trim = (v: string) => (kind === 'snow' ? v.replace(/\.0$/, '') : v);
  const lo = trim(fmt(kind, Math.min(...ok), units).value);
  const hi = fmt(kind, Math.max(...ok), units);
  const hiText = `${trim(hi.value)}${bare ? '' : hi.text.slice(hi.value.length)}`;
  return lo === trim(hi.value) ? hiText : `${lo}–${hiText}`;
}

/** A grid row, or null for a missing or placeholder payload (the e2e seed stores '{}'). */
export const gridRow = (pf: PointForecast | null | undefined): PointForecast | null =>
  pf && Array.isArray(pf.days) ? pf : null;

export const dayOf = (pf: PointForecast | null | undefined, date: string): NwsDay | undefined =>
  gridRow(pf)?.days.find((d) => d.date === date);

/** Sustained wind and gust as '13 G25' (unit in the column header); '—' when neither is known. */
export function windText(day: NwsDay | undefined, units: Units): string {
  const wind = finite(day?.windMaxMph) ? fmt('wind', day.windMaxMph, units).value : null;
  const gust = finite(day?.gustMaxMph) ? fmt('wind', day.gustMaxMph, units).value : null;
  if (gust === null) return wind ?? DASH;
  return wind === null ? `G${gust}` : `${wind} G${gust}`;
}

/** Per-model sums of `snowfall_sum` over `dates`, then min–max across models (models missing a day drop out). */
export function modelSpread(
  daily: OmSeries | null | undefined,
  dates: readonly string[],
): { min: number; max: number; n: number } | null {
  if (!daily) return null;
  const idx = dates.map((d) => daily.time.indexOf(d));
  if (idx.some((i) => i < 0)) return null;
  const totals: number[] = [];
  for (const [key, arr] of Object.entries(daily)) {
    if (!key.startsWith('snowfall_sum_')) continue;
    const vals = idx.map((i) => (arr as unknown[])[i]);
    if (vals.every((v): v is number => typeof v === 'number' && Number.isFinite(v))) {
      totals.push(vals.reduce((a, b) => a + b, 0));
    }
  }
  return totals.length ? { min: Math.min(...totals), max: Math.max(...totals), n: totals.length } : null;
}

export interface ForecastRow {
  id: ResortId;
  name: string;
  today: string;
  tonight: string;
  tomorrow: string;
  models: string;
  wind: string; // summit, today
  level: { minFt: number | null; maxFt: number | null; baseFt: number; summitFt: number };
  tMinF: number | null; // summit, today
  tMaxF: number | null;
}

/** One table row from the resort's base and summit grid rows; `om` is its Open-Meteo daily block. */
export function forecastRow(
  id: ResortId,
  baseRow: PointForecast | null | undefined,
  summitRow: PointForecast | null | undefined,
  dates: { today: string; tomorrow: string },
  units: Units,
  om?: OmSeries | null,
): ForecastRow {
  const base = gridRow(baseRow);
  const summit = gridRow(summitRow);
  const bDay = dayOf(base, dates.today);
  const sDay = dayOf(summit, dates.today);
  const spread = modelSpread(om, [dates.today, dates.tomorrow]);
  const mins = [bDay?.snowLevelMinFt, sDay?.snowLevelMinFt].filter(finite);
  const maxs = [bDay?.snowLevelMaxFt, sDay?.snowLevelMaxFt].filter(finite);
  return {
    id,
    name: RESORTS[id].name,
    today: range('snow', [base?.todayDaytimeSnowIn, summit?.todayDaytimeSnowIn], units, true),
    tonight: range('snow', [base?.tonightSnowIn, summit?.tonightSnowIn], units, true),
    tomorrow: range('snow', [base?.tomorrowDaytimeSnowIn, summit?.tomorrowDaytimeSnowIn], units, true),
    models: spread ? range('snow', [spread.min, spread.max], units, true) : DASH,
    wind: windText(sDay ?? bDay, units),
    level: {
      minFt: mins.length ? Math.min(...mins) : null,
      maxFt: maxs.length ? Math.max(...maxs) : null,
      baseFt: RESORTS[id].base.ft,
      summitFt: RESORTS[id].summit.ft,
    },
    tMinF: (sDay ?? bDay)?.tMinF ?? null,
    tMaxF: (sDay ?? bDay)?.tMaxF ?? null,
  };
}

/** Snow level against the point's true elevation on a day with precipitation: Snow / Mix / Rain, else null. */
export function levelStatus(d: NwsDay, elevFt: number): StatusWord | null {
  if (!(d.qpfIn > 0) || d.snowLevelMaxFt === null) return null;
  if (d.snowLevelMaxFt <= elevFt) return { tone: 'ok', word: 'Snow' };
  if ((d.snowLevelMinFt ?? d.snowLevelMaxFt) > elevFt) return { tone: 'bad', word: 'Rain' };
  return { tone: 'warn', word: 'Mix' };
}

const names = (rows: readonly ForecastRow[]): string => rows.map((r) => r.name).join(', ');

/** Today's snow level against the true base and summit elevations, e.g. 'Snow level today 7,600–9,900 ft: …'. */
export function snowLevelNote(rows: readonly ForecastRow[], units: Units): string | null {
  const known = rows.filter((r) => finite(r.level.maxFt));
  if (known.length === 0) return null;
  const top = (r: ForecastRow) => r.level.maxFt ?? 0;
  const lvl = range('snowLevel', [...known.map((r) => r.level.minFt ?? top(r)), ...known.map(top)], units);
  const wetBase = known.filter((r) => top(r) > r.level.baseFt);
  const wetSummit = known.filter((r) => top(r) > r.level.summitFt);
  // 'every'/'the' only when every listed resort is known; otherwise name the resorts.
  const all = known.length === rows.length;
  const every = rows.length > 1 ? 'every' : 'the';
  let tail: string;
  if (wetBase.length === 0) tail = all ? `below ${every} base` : `below the base at ${names(known)}`;
  else if (all && wetSummit.length === known.length) tail = `above ${every} summit, so rain is possible top to bottom`;
  else if (all && wetBase.length === known.length) tail = `above ${every} base, so rain is possible low down`;
  else tail = `above the base at ${names(wetBase)}`;
  return `Snow level today ${lvl}: ${tail}.`;
}

/** Summit temperatures today across the rows: 'Summit today: highs 31–36°F, lows 26–31°F.' */
export function tempNote(rows: readonly ForecastRow[], units: Units): string | null {
  const highs = rows.map((r) => r.tMaxF).filter(finite);
  const lows = rows.map((r) => r.tMinF).filter(finite);
  if (highs.length === 0 && lows.length === 0) return null;
  const parts = [
    highs.length ? `${highs.length === 1 ? 'high' : 'highs'} ${range('temp', highs, units)}` : null,
    lows.length ? `${lows.length === 1 ? 'low' : 'lows'} ${range('temp', lows, units)}` : null,
  ].filter(Boolean);
  return `Summit today: ${parts.join(', ')}.`;
}

/** AFD KEY MESSAGES as bullets: '- ' starts a bullet, other lines continue the previous one. */
export function afdBullets(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^[-*•]\s+(.*)$/.exec(line);
    if (m || out.length === 0) out.push(m?.[1] ?? line);
    else out[out.length - 1] = `${out[out.length - 1]} ${line}`;
  }
  return out;
}
