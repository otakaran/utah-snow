// Snowbasin lift table, access gates and groomed count (spec §5.5). Status classes are read through the page's own
// Lift Key / Trail Key legends (O10: hold, scheduled, delayed and expected were never observed live), then the
// fixed class names, then the sr-only text. Anything still unrecognised maps to closed with a note.
import { decodeEntities, text } from '../../../shared/num.ts';
import { hm24 } from '../../../shared/time.ts';
import type { Gate, LiftState, LiftStatus } from '../../../shared/types.ts';

export type Legend = Map<string, string>; // icon class suffix -> legend label ('hold' -> 'On Hold')
export interface Classified {
  state: LiftState;
  raw: string;
  known: boolean;
}
export interface TrailsRead {
  gates: Gate[];
  groomed: number | null; // unique trail names with the groomed icon; null when no trail tables
}

const LEGEND_ITEM_RE = /<span class="mc__icon mc__icon-([a-z-]+)"[^>]*><\/span>\s*([^<]*?)\s*<\/li>/g;
const LIFT_TABLE = '<table class="mc__table mc-lifts__table">';
const TRAIL_TABLE_RE = /<table[^>]*mc-trails__table[^>]*>([\s\S]*?)<\/table>/;
const AREA_HEAD_RE = /<h3 class="accordion__heading"><a href="#" class="accordion__toggle[^"]*">$/;
const NAME_RE = /<td[^>]*>\s*(?:<span class="mc__icon[^"]*"><\/span>\s*)?<span>([^<]+)<\/span>/;
const GROOMED = 'mc__icon-groomed"';
const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const TD_RE = /<td[^>]*>([\s\S]*?)<\/td>/g;
const ICON_RE = /mc__icon-([a-z-]+)/;
const SR_RE = /<span class="sr-only">([^<]*)<\/span>/;
const HOURS_RE = /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[–-]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/;
const GATES_AREA = 'Access Gates';
// Ordered: 'Opening Delayed' is scheduled, 'Lift Closed' is closed.
const BY_TEXT: [RegExp, LiftState][] = [
  [/hold/i, 'hold'],
  [/sched|delay|expect|pending/i, 'scheduled'],
  [/open/i, 'open'],
  [/clos/i, 'closed'],
];

/** Icon class -> label pairs of the legend list that follows `heading` (e.g. 'Lift Key'). */
export function readLegend(region: string, heading: string): Legend {
  const legend: Legend = new Map();
  const i = region.indexOf(`${heading}</h3>`);
  if (i < 0) return legend;
  const end = region.indexOf('accordion__heading', i);
  for (const m of region.slice(i, end < 0 ? i + 6000 : Math.min(end, i + 6000)).matchAll(LEGEND_ITEM_RE)) {
    const label = text(m[2], 40);
    if (m[1] && label) legend.set(m[1], label);
  }
  return legend;
}

const byText = (s: string | null | undefined): LiftState | null =>
  s ? (BY_TEXT.find(([re]) => re.test(s))?.[1] ?? null) : null;

/** Status of one table cell from its icon class, the legend label for it, then its sr-only text. */
export function classify(cell: string, legend: Legend): Classified {
  const cls = ICON_RE.exec(cell)?.[1] ?? null;
  const sr = text(SR_RE.exec(cell)?.[1], 40);
  const label = cls ? (legend.get(cls) ?? null) : null;
  for (const t of [label, cls, sr]) {
    const state = byText(t);
    if (t && state) return { state, raw: t, known: true };
  }
  return { state: 'closed', raw: label ?? sr ?? cls ?? '', known: false };
}

const win = (s: string, i: number, n: number) => (i < 0 ? '' : s.slice(i, i + n));

function cells(row: string): string[] {
  return [...row.matchAll(TD_RE)].map((m) => m[1] ?? '');
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Lift rows (null when the table is absent, e.g. off-season). td: name, type, status, hours. */
export function readLifts(main: string): LiftStatus[] | null {
  const at = main.indexOf(LIFT_TABLE);
  const end = at < 0 ? -1 : main.indexOf('</table>', at);
  if (end < 0) return null;
  const legend = readLegend(main.slice(Math.max(0, main.lastIndexOf('Lift Key</h3>', at)), at), 'Lift Key');
  const out: LiftStatus[] = [];
  for (const m of main.slice(at, end).matchAll(ROW_RE)) {
    const td = cells(m[1] ?? '');
    const name = text(td[0], 80);
    if (td.length < 3 || !name) continue; // thead row
    const c = classify(td[2] ?? '', legend);
    const hours = HOURS_RE.exec(decodeEntities(td[3] ?? ''));
    out.push({
      id: slug(name),
      name,
      state: c.state,
      raw: c.raw,
      opensAt: hours?.[1] ? hm24(hours[1]) : null,
      closesAt: hours?.[2] ? hm24(hours[2]) : null,
      note: c.known ? null : `unmapped status '${c.raw}'`,
    });
  }
  return out;
}

/** The trail table of one accordion area (spec: area name = heading text before '<span'), or null. */
function areaTable(trails: string, area: string): string | null {
  for (let i = trails.indexOf(`>${area}`); i >= 0; i = trails.indexOf(`>${area}`, i + 1)) {
    if (!AREA_HEAD_RE.test(trails.slice(Math.max(0, i - 200), i + 1))) continue;
    if (decodeEntities(trails.slice(i + 1, trails.indexOf('<span', i))).trim() !== area) continue;
    const next = trails.indexOf('accordion__heading', i);
    const at = trails.indexOf('<table', i);
    if (at < 0 || (next >= 0 && at > next)) return null; // 'Access Gates Safety Information' has no table
    return TRAIL_TABLE_RE.exec(trails.slice(at, trails.indexOf('</table>', at) + 8))?.[1] ?? null;
  }
  return null;
}

/** Unique trail names whose groomed cell carries the icon (rows only: the legend has no <tr>). */
function groomedCount(trails: string): number {
  const names = new Set<string>();
  for (let i = trails.indexOf(GROOMED); i >= 0; i = trails.indexOf(GROOMED, i + GROOMED.length)) {
    const tr = trails.lastIndexOf('<tr>', i);
    if (tr < 0 || trails.lastIndexOf('</tr>', i) > tr) continue;
    const name = text(NAME_RE.exec(trails.slice(tr, i))?.[1], 80);
    if (name) names.add(name);
  }
  return names.size;
}

/** Access gates (area 'Access Gates', 18 rows) and the groomed count over all trail tables. */
export function readTrails(main: string): TrailsRead {
  const at = main.indexOf('class="mc-trails"');
  if (at < 0) return { gates: [], groomed: null };
  const trails = main.slice(at);
  const legend = readLegend(win(trails, trails.indexOf('Trail Key</h3>'), 6000), 'Trail Key');
  const gates: Gate[] = [];
  for (const m of (areaTable(trails, GATES_AREA) ?? '').matchAll(ROW_RE)) {
    const td = cells(m[1] ?? '');
    const name = text(td[0], 80);
    if (td.length < 4 || !name) continue;
    const c = classify(td[1] ?? '', legend);
    gates.push({ name, state: c.state, note: c.state === 'open' || c.state === 'closed' ? null : c.raw });
  }
  const anyTable = trails.includes('mc-trails__table');
  return { gates, groomed: anyTable ? groomedCount(trails) : null };
}
