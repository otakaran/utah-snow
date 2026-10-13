// window.Alta extraction (spec §5.4 'resort:alta'). Every alta.com page embeds one inline
// `<script>window.Alta = {JSON};</script>` line (Laravel json_encode, so '/' is escaped and '</' never occurs inside).
// eval/vm are unavailable in Workers: slice + JSON.parse, with a balanced-brace scan as the fallback.
import { ValidationError } from '../types.ts';

export type Obj = Record<string, unknown>;

const MARK = 'window.Alta = ';

export const obj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Trimmed non-empty string, else null. */
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function tryParse(s: string): Obj | null {
  try {
    return obj(JSON.parse(s));
  } catch {
    return null;
  }
}

/** Index just past the object that opens at `from` ('{'), honoring JSON strings and escapes; -1 if unbalanced. */
function objectEnd(s: string, from: number): number {
  let depth = 0;
  let inStr = false;
  for (let k = from; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (inStr) {
      // 92 = backslash (skip the escaped char), 34 = quote
      if (c === 92) k++;
      else if (c === 34) inStr = false;
    } else if (c === 34) inStr = true;
    else if (c === 123) depth++;
    else if (c === 125 && --depth === 0) return k + 1;
  }
  return -1;
}

/** The window.Alta object of a page, or ValidationError when the marker or a parseable object is missing. */
export function altaJson(html: string): Obj {
  const i = html.indexOf(MARK);
  if (i < 0) throw new ValidationError('alta: window.Alta marker missing');
  const start = i + MARK.length;
  const j = html.indexOf('</script>', start);
  let s = html.slice(start, j < 0 ? html.length : j).trim();
  if (s.endsWith(';')) s = s.slice(0, -1);
  const direct = tryParse(s);
  if (direct) return direct;
  const open = html.indexOf('{', start);
  const end = open < 0 ? -1 : objectEnd(html, open);
  const scanned = end < 0 ? null : tryParse(html.slice(open, end));
  if (!scanned) throw new ValidationError('alta: window.Alta is not a JSON object');
  return scanned;
}
