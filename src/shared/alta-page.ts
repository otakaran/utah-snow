// window.Alta extraction for alta.com pages (spec §5.4 'resort:alta', 'alta-weather'). Every page embeds one inline
// `<script>window.Alta = {JSON};</script>` line (Laravel json_encode: '/' is escaped, so '</' never occurs inside).
// eval/vm are unavailable in Workers: slice + JSON.parse, with a balanced-brace scan as the fallback. Pure; callers
// throw ValidationError on null. Alta stamps are zone-less Denver wall time ('2026-02-12 11:05:05').
import { isObj, type Obj, tryJson } from './json.ts';
import { denverOffsetMin, isoLocal, MIN, zonedToUtc } from './time.ts';

const MARK = 'window.Alta = ';
const STAMP_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/;

const objectOf = (s: string): Obj | null => {
  const v = tryJson(s);
  return isObj(v) ? v : null;
};

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

/** The window.Alta object of a page, or null when the marker or a parseable object is missing. */
export function altaJson(html: string): Obj | null {
  const i = html.indexOf(MARK);
  if (i < 0) return null;
  const start = i + MARK.length;
  const j = html.indexOf('</script>', start);
  let s = html.slice(start, j < 0 ? html.length : j).trim();
  if (s.endsWith(';')) s = s.slice(0, -1);
  const direct = objectOf(s);
  if (direct) return direct;
  const open = html.indexOf('{', start);
  const end = open < 0 ? -1 : objectEnd(html, open);
  return end < 0 ? null : objectOf(html.slice(open, end));
}

/**
 * 'YYYY-MM-DD HH:MM[:SS]' Denver wall time -> '2026-02-12T11:05:05-07:00', or null. `dst` is window.Alta.DST: when it
 * is a boolean it pins the offset (-06:00 / -07:00, spec §5.5 "+DST flag") and the wall time is kept as written;
 * otherwise the offset is Denver's at that instant.
 */
export function stampIso(v: unknown, dst?: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  const ms = STAMP_RE.test(s) ? zonedToUtc(s) : null;
  if (ms === null) return null;
  if (typeof dst !== 'boolean') return isoLocal(ms);
  const pinned = dst ? -360 : -420;
  return isoLocal(ms + (denverOffsetMin(ms) - pinned) * MIN, pinned);
}
