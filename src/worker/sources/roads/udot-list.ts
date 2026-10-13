// Keyless UDOT Traffic lists (spec §5.4, Appendix B udot-list): DataTables JSON from /List/GetData/{Layer}.
// Undocumented front-end endpoints; a start past the end silently returns page 0, so paging follows
// recordsFiltered. Validation gate: recordsTotal > 0 (recordsFiltered may be 0).
import { num, range, text } from '../../../shared/num.ts';
import { hm24, isoToMs, zonedToUtc } from '../../../shared/time.ts';
import type { RoadStatus } from '../../../shared/types.ts';
import { iso, obj, str } from './raw.ts';
import type { SignRow } from './signs.ts';

const LIST = 'https://www.udottraffic.utah.gov/List/GetData';
export const PAGE = 100;

export type Segment = RoadStatus['segments'][number];
export type PassView = NonNullable<RoadStatus['pass']>;
export interface PassRow {
  name: string;
  rowId: number | null; // keyless DT_RowId
  apiId: number | null; // MountainPassId
  view: PassView;
}
export interface TrafficEvent {
  id: string;
  route: string | null; // 'SR-190', 'I-80'
  layer: string; // 'Construction', 'Incidents', …
  full: boolean;
  startMs: number | null;
  endMs: number | null;
  text: string;
}

export function listUrl(layer: string, start: number, term = '', length = PAGE): string {
  const q = { draw: 1, columns: [{ data: null, name: '' }], order: [], start, length, search: { value: term } };
  return `${LIST}/${layer}?query=${encodeURIComponent(JSON.stringify(q))}&lang=en`;
}

export interface ListPage {
  recordsTotal: number;
  recordsFiltered: number;
  data: unknown[];
}
export function asPage(v: unknown): ListPage | null {
  const o = obj(v);
  const total = Number(o?.recordsTotal);
  if (!o || !(total > 0) || !Array.isArray(o.data)) return null;
  return { recordsTotal: total, recordsFiltered: Number(o.recordsFiltered) || 0, data: o.data };
}

/** Page 0, then the next pages only while start + 100 < recordsFiltered, capped at maxPages. `get` yields null on failure. */
export async function fetchPages(
  get: (url: string, label: string) => Promise<unknown>,
  layer: string,
  term: string,
  maxPages: number,
): Promise<unknown[]> {
  const label = `list:${layer}${term ? `:${term}` : ''}`;
  const first = await get(listUrl(layer, 0, term), label);
  const filtered = asPage(first)?.recordsFiltered ?? 0;
  const starts: number[] = [];
  for (let s = PAGE; s < filtered && starts.length < maxPages - 1; s += PAGE) starts.push(s);
  const rest = await Promise.all(starts.map((s) => get(listUrl(layer, s, term), `${label}@${s}`)));
  return [first, ...rest];
}

/** Rows of all valid pages, deduped by DT_RowId/id; null when no page passed the gate. */
export function listRows(pages: unknown[] | null): unknown[] | null {
  const valid = (pages ?? []).map(asPage).filter((p): p is ListPage => p !== null);
  if (!valid.length) return null;
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const row of valid.flatMap((p) => p.data)) {
    const o = obj(row);
    const id = str(o?.DT_RowId ?? o?.id);
    if (!o || (id && seen.has(id))) continue;
    if (id) seen.add(id);
    out.push(o);
  }
  return out;
}

/** UDOT list stamps '10/12/26, 7:49 PM' are Denver wall time. */
export function udotLocalMs(s: string): number | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}:\d{2}\s*[AP]M)/i.exec(s);
  const hm = m ? hm24(m[4] ?? '') : null;
  if (!m || !hm) return null;
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return zonedToUtc(`${y}-${(m[1] ?? '').padStart(2, '0')}-${(m[2] ?? '').padStart(2, '0')} ${hm}`);
}
const localIso = (s: unknown): string | null => {
  const ms = udotLocalMs(str(s));
  return ms === null ? null : iso(ms);
};

export function normRoute(name: string): string | null {
  const m = /^\s*(SR|I|US)[\s-]?(\d+)/i.exec(name);
  return m ? `${(m[1] ?? '').toUpperCase()}-${m[2]}` : null;
}

export function segmentRow(o: Record<string, unknown>): Segment {
  const isoStamp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})/.exec(str(o.description))?.[0];
  const ms = isoToMs(isoStamp);
  return {
    name: str(o.roadway),
    roadCondition: str(o.roadCondition),
    weatherCondition: str(o.weatherCondition),
    restriction: str(o.restriction),
    at: ms === null ? localIso(o.lastUpdated) : iso(ms),
  };
}

/** rwisInfo = 'station;airF;windDir;windMph;gustMph;surfaceF;surfaceStatus;visMi'. */
export function rwisView(name: string, rwis: string): PassView {
  const f = rwis.split(';');
  return {
    name,
    airF: range(num(f[1]), -60, 130),
    windMph: range(num(f[3]), 0, 200),
    gustMph: range(num(f[4]), 0, 250),
    surfaceF: range(num(f[5]), -60, 170),
    surface: f[6]?.trim() || null,
    visMi: range(num(f[7]), 0, 100),
  };
}

export function passRow(o: Record<string, unknown>): PassRow {
  const name = str(o.name);
  return {
    name,
    rowId: num(o.DT_RowId),
    apiId: num(o.mountainPassId),
    view: rwisView(name, str(o.rwisInfo)),
  };
}

export function signRow(o: Record<string, unknown>): SignRow {
  return {
    id: str(o.DT_RowId),
    name: str(o.name),
    pages: [o.message, o.message2, o.message3].map(str).filter((s) => s.trim()),
    at: localIso(o.lastUpdated),
  };
}

export function trafficRow(o: Record<string, unknown>): TrafficEvent {
  const where = str(o.locationDescription);
  return {
    id: `udot-event:${str(o.id ?? o.DT_RowId)}`,
    route: normRoute(str(o.roadwayName)),
    layer: str(o.layerName ?? o.type),
    full: o.isFullClosure === true,
    startMs: udotLocalMs(str(o.startDate)),
    endMs: udotLocalMs(str(o.endDate)),
    text: text(`${where ? `${where}: ` : ''}${str(o.description)}`, 300) ?? '',
  };
}
