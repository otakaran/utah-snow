// Snowbasin mountain-report scoping and value regexes (spec §5.5 "Snowbasin regexes"). Pure string work, no DOM.
// The page repeats the report widget: the FIRST `.mc-weather` is the header dropdown (value before label), the
// SECOND is the real report. Everything except the dropdown fallback, alerts and the narrative reads `main` only.
// CPU: the page is ~700 KB in season, so each spec regex runs on a small window located with indexOf first
// (a cold regex is interpreted and would otherwise scan hundreds of KB).
import { decodeEntities, num, range, text } from '../../../shared/num.ts';

export const SNOW_LABELS = ['Overnight', '24 hours', '7 days', 'Base', 'Season'] as const;
export type SnowLabel = (typeof SNOW_LABELS)[number];
export type SnowValues = Partial<Record<SnowLabel, number | null>>;

export interface Page {
  season: 'winter' | 'summer';
  head: string; // before the main report: alert bar, header dropdown, narrative
  main: string; // from the main report anchor to the end of the page
}
export interface Stamp {
  month: number; // 1-12
  day: number;
  clock: string; // '4:19 AM'
}
export interface SnowRead {
  values: SnowValues;
  from: 'main' | 'dropdown' | null;
  stamp: Stamp | null;
}
export interface CondRow {
  tempF: number | null;
  sky: string | null;
  windMph: number | null;
  windDir: string | null;
}

const SEASON_RE = /^<body class="-(winter|summer)-season"/;
const MAIN_TAG = '<div class="mc-weather__wrap">';
const MAIN_NEXT_RE = /^\s*<p class="mc__timestamp/;
const SNOW_BLOCK_RE = /<h2 class="mc__heading mc__h2">Snow Report<\/h2>([\s\S]*?)<\/ul>/;
const PAIR_RE = /<h3 class="mc__heading mc__h3">([^<]+)<\/h3>\s*<p class="mc__num[^"]*">([^<]+)<\/p>/g;
const DROPDOWN_RE =
  /<p class="mc__num mc__num-sm">([^<]+)<\/p>\s*<\/div>\s*<p class="mc__heading mc__h4">(Overnight|24 hours|7 days|Base|Season)<\/p>/g;
const STAMP_RE = /Last Updated:? ([A-Z][a-z]{2}) (\d{1,2}),? (\d{1,2}:\d{2} (?:AM|PM)) MT/;
const COND_ROW_RE =
  /<h3 class="mc__heading mc__h3">([^<]+)<\/h3>\s*<p class="mc__num[^"]*">([^<]+)<\/p>[\s\S]*?<h4 class="mc__heading mc__h4">([^<]*)<\/h4>[\s\S]*?<h4 class="mc__heading mc__h4">([^<]*)<\/h4>/g;
const WIND_RE = /Wind:? (\d+) mph ?([NSEW]{0,3})/;
const COUNT_RE = /mc-lifts__graph-value">(\d+) \/ (\d+)<\/span>\s*$/;
const ALERT_RE =
  /^<div class="alert -[a-z-]+">\s*<div class="alert__content">[\s\S]*?<div class="alert__content-copy">([\s\S]*?)<\/div>/;
const INLINE_TAG_RE = /<\/?(?:strong|b|em|i|u|span)\b[^>]*>/gi; // dropped so '<strong>X</strong>: y' reads 'X: y'
const CTA_RE = /<a\b[^>]*>[^<]*(?:&gt;|>){2}\s*<\/a>/g; // "View Mountain Report >>" links
const NARRATIVE_TAG = '<div class="mc__cell mc__cell-forecast-1 forecast-text">';
const NARRATIVE_RE =
  /^<div class="mc__cell mc__cell-forecast-1 forecast-text">\s*<div>([\s\S]*?)<p class="mc__timestamp/;
const PARKING_RE = /^mc-parking__graph-value">(\d+)<\/span>\s*%\s*Full/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `s.slice(i, i + n)`, or '' when the marker was not found. */
const win = (s: string, i: number, n: number) => (i < 0 ? '' : s.slice(i, i + n));

/** Splits the page at the main report anchor; null when the season flag or the anchor is missing. */
export function scope(html: string): Page | null {
  const season = SEASON_RE.exec(win(html, html.indexOf('<body '), 60))?.[1];
  let mainIdx = html.indexOf(MAIN_TAG);
  while (mainIdx >= 0 && !MAIN_NEXT_RE.test(win(html, mainIdx + MAIN_TAG.length, 200))) {
    mainIdx = html.indexOf(MAIN_TAG, mainIdx + 1);
  }
  if (!season || mainIdx < 0) return null;
  return { season: season as Page['season'], head: html.slice(0, mainIdx), main: html.slice(mainIdx) };
}

function stampOf(s: string): Stamp | null {
  const m = STAMP_RE.exec(s);
  const month = MONTHS.indexOf(m?.[1] ?? '') + 1;
  const day = Number(m?.[2]);
  if (!m?.[3] || month < 1 || day < 1 || day > 31) return null;
  return { month, day, clock: m[3] };
}

const isLabel = (s: string): s is SnowLabel => (SNOW_LABELS as readonly string[]).includes(s);

/** Snow Report pairs from the main block (mapped by label, never position); the dropdown is the fallback. */
export function readSnow(page: Page): SnowRead {
  const values: SnowValues = {};
  const at = page.main.indexOf('Snow Report</h2>');
  const block = at < 0 ? undefined : SNOW_BLOCK_RE.exec(page.main.slice(Math.max(0, at - 40), at + 6000))?.[1];
  for (const m of block?.matchAll(PAIR_RE) ?? []) {
    const label = (m[1] ?? '').trim();
    if (isLabel(label)) values[label] = num(m[2]);
  }
  if (Object.keys(values).length > 0) return { values, from: 'main', stamp: stampOf(page.main.slice(0, 1000)) };

  // Header dropdown: from its `.mc-weather` to the next one (the narrative wrapper just before the main report).
  const from = page.head.indexOf('class="mc-weather"');
  const to = from < 0 ? -1 : page.head.indexOf('class="mc-weather"', from + 1);
  const drop = from < 0 ? '' : page.head.slice(from, to < 0 ? undefined : to);
  for (const m of drop.matchAll(DROPDOWN_RE)) {
    const label = m[2] ?? '';
    if (isLabel(label) && !(label in values)) values[label] = num(m[1]);
  }
  if (Object.keys(values).length === 0) return { values, from: null, stamp: null };
  return { values, from: 'dropdown', stamp: stampOf(drop) };
}

/** Conditions rows by location ('Base', 'Mid Mountain'): temperature, sky and wind. No timestamp exists. */
export function readConditions(main: string): Record<string, CondRow> {
  const out: Record<string, CondRow> = {};
  // Spec block: 'Conditions</h2>' up to 'Lens Recommendation'. That card was missing on 2025-12-01, so the
  // next <h2> (Forecast) also ends the block.
  const at = main.indexOf('Conditions</h2>');
  const ends = at < 0 ? [] : [main.indexOf('Lens Recommendation', at), main.indexOf('<h2', at)].filter((i) => i > 0);
  const block = ends.length ? main.slice(at, Math.min(...ends)) : '';
  for (const m of block.matchAll(COND_ROW_RE)) {
    const row: CondRow = { tempF: range(num(m[2]), -50, 110), sky: null, windMph: null, windDir: null };
    for (const h4 of [m[3] ?? '', m[4] ?? '']) {
      const w = WIND_RE.exec(decodeEntities(h4));
      if (w) {
        row.windMph = range(num(w[1]), 0, 200);
        row.windDir = w[2] || null;
      } else {
        row.sky ??= text(h4, 80);
      }
    }
    out[(m[1] ?? '').trim()] = row;
  }
  return out;
}

/** 'n / m Lifts|Trails Open' summary on the main report; null when absent. */
export function readCount(main: string, what: 'Lifts' | 'Trails'): { open: number; total: number } | null {
  for (let i = main.indexOf(`${what} Open`); i >= 0; i = main.indexOf(`${what} Open`, i + 1)) {
    const m = COUNT_RE.exec(main.slice(Math.max(0, i - 120), i));
    if (m) return { open: Number(m[1]), total: Number(m[2]) };
  }
  return null;
}

/** Alert-bar messages (not the header notification dropdown, which also carries marketing). */
export function readAlerts(head: string): string[] {
  const out: string[] = [];
  const tag = '<div class="alert -';
  for (let i = head.indexOf(tag); i >= 0; i = head.indexOf(tag, i + 1)) {
    const m = ALERT_RE.exec(head.slice(i, i + 3000));
    const t = m ? text((m[1] ?? '').replace(CTA_RE, ' ').replace(INLINE_TAG_RE, ''), 300) : null;
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** The free-text daily report that sits just before the main report. */
export function readNarrative(head: string): string | null {
  const at = head.lastIndexOf(NARRATIVE_TAG);
  const m = at < 0 ? null : NARRATIVE_RE.exec(head.slice(at));
  return m ? text((m[1] ?? '').replace(INLINE_TAG_RE, ''), 600) : null;
}

/** Parking '% Full' gauge (inventory is updated on winter weekends and holidays only). */
export function readParking(main: string): number | null {
  const m = PARKING_RE.exec(win(main, main.indexOf('mc-parking__graph-value">'), 120));
  return range(num(m?.[1]), 0, 100);
}
