// UDOT message signs (spec §5.6 "Message signs", C.10). Pure. Keyless pages are message/message2/message3;
// keyed Messages[] entries are '<MSG>LINE<BR/>LINE</MSG>'. Canyon times are keyed by text, never by page order.
import { decodeEntities, stripHtml } from '../../../shared/num.ts';
import type { Corridor, RoadStatus } from '../../../shared/types.ts';
import type { Signal } from './raw.ts';

export type SignView = RoadStatus['signs'][number];
export interface SignRow {
  id: string; // keyless DT_RowId
  name: string;
  pages: string[]; // raw page markup
  at: string | null;
}

const TRAVEL_LAST_RE = /^(\d+)\s*MIN$/i;
const TRAVEL_LINE_RE = /^(.+?)\s+(\d+)\s*MIN$/i;
const SPEED_RE = /^\d+$/;
export const SIGN_FLAG_RE = /TRACTION|CHAIN|4WD|AWD|CLOSED|AVALANCHE|INTERLODGE|DELAY|CONGESTION|CRASH|ACCIDENT/i;
const SIGN_TRACTION_RE = /TRACTION|CHAIN|4WD|AWD|4X4/i;
const SIGN_CLOSED_RE = /\b(CANYON|ROAD)\b[^\n]{0,20}\bCLOSED\b|\bCLOSED\b[^\n]{0,20}\b(CANYON|ROAD)\b/i; // not lot status
const SIGN_DELAY_RE = /DELAY|CONGESTION|CRASH|ACCIDENT/i;
const BCC_RE = /BIG\s+COTTONWOOD|\bBCC\b/i;
const LCC_RE = /LITTLE\s+COTTONWOOD|\bLCC\b/i;

const pageLines = (page: string): string[] =>
  page
    .replace(/<\/?MSG>/gi, '')
    .split(/<br\s*\/?>/i)
    .map((s) => decodeEntities(stripHtml(s)).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/** One page -> lines, travel times and advisory text. A bare number is a speed limit and is ignored. */
export function parsePage(page: string): { lines: string[]; travel: SignView['travel']; advisory: string[] } {
  const lines = pageLines(page);
  const last = TRAVEL_LAST_RE.exec(lines[lines.length - 1] ?? '');
  if (last && lines.length > 1) {
    return { lines, travel: [{ dest: lines.slice(0, -1).join(' '), min: Number(last[1]) }], advisory: [] };
  }
  const travel: SignView['travel'] = [];
  const header: string[] = [];
  const advisory: string[] = [];
  for (const line of lines) {
    const m = TRAVEL_LINE_RE.exec(line);
    if (m) travel.push({ dest: [...header, m[1] ?? ''].join(' '), min: Number(m[2]) });
    else if (SPEED_RE.test(line)) continue;
    else if (travel.length) advisory.push(line);
    else header.push(line);
  }
  if (!travel.length) advisory.push(...header);
  return { lines, travel, advisory };
}

/** Keyed Messages[] entry -> pages (one per <MSG> block). */
export const keyedPages = (entry: string): string[] =>
  entry
    .split(/<\/MSG>/i)
    .map((s) => s.replace(/<MSG>/gi, '').trim())
    .filter(Boolean);

export function canyonOf(dest: string): 'lcc' | 'bcc' | null {
  if (BCC_RE.test(dest)) return 'bcc';
  if (LCC_RE.test(dest)) return 'lcc';
  return null;
}

/** A sign row -> the RoadStatus view. For the canyon corridors, travel times of the other canyon are dropped. */
export function signView(row: SignRow, corridor: Corridor): SignView {
  const lines: string[] = [];
  const travel: SignView['travel'] = [];
  const adv: string[] = [];
  for (const page of row.pages) {
    const p = parsePage(page);
    lines.push(...p.lines);
    travel.push(...p.travel);
    if (p.advisory.length) adv.push(p.advisory.join(' '));
  }
  const keep =
    corridor === 'lcc' || corridor === 'bcc'
      ? travel.filter((t) => {
          const c = canyonOf(t.dest);
          return c === null || c === corridor;
        })
      : travel;
  return { id: row.id, name: row.name, lines, travel: keep, advisory: adv.length ? adv.join(' / ') : null, at: row.at };
}

/**
 * Sign advisory text -> crossCheck signal (interlodge, closed, traction, delays, or recorded only).
 * Text that names the other canyon is skipped on lcc/bcc.
 */
export function signSignal(view: SignView, corridor: Corridor): Signal | null {
  const t = view.advisory;
  if (!t || !SIGN_FLAG_RE.test(t)) return null;
  const canyon = canyonOf(t);
  if (canyon && (corridor === 'lcc' || corridor === 'bcc') && canyon !== corridor) return null;
  const source = `UDOT sign ${view.id}`;
  if (/INTERLODGE/i.test(t)) return { source, raw: t, state: 'interlodge' };
  if (SIGN_CLOSED_RE.test(t)) return { source, raw: t, state: 'closed' };
  if (SIGN_TRACTION_RE.test(t)) return { source, raw: t, state: 'traction' };
  if (SIGN_DELAY_RE.test(t)) return { source, raw: t, state: 'delays' };
  return { source, raw: t, state: 'unknown' };
}
