// window.Alta extraction and Alta local stamps for alta-weather. Same logic as alta/extract.ts + alta/stamp.ts:
// check-repo lets an adapter import only its own helper folder, so the two adapters cannot share one copy until it
// moves to src/shared/ (see the integration note). Keep them in sync.
import { denverOffsetMin, zonedToUtc } from '../../../shared/time.ts';
import { ValidationError } from '../types.ts';

export type Obj = Record<string, unknown>;

const MARK = 'window.Alta = ';
const STAMP_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/;
const pad = (n: number) => String(n).padStart(2, '0');

export const obj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
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
  if (i < 0) throw new ValidationError('alta-weather: window.Alta marker missing');
  const start = i + MARK.length;
  const j = html.indexOf('</script>', start);
  let s = html.slice(start, j < 0 ? html.length : j).trim();
  if (s.endsWith(';')) s = s.slice(0, -1);
  const direct = tryParse(s);
  if (direct) return direct;
  const open = html.indexOf('{', start);
  const end = open < 0 ? -1 : objectEnd(html, open);
  const scanned = end < 0 ? null : tryParse(html.slice(open, end));
  if (!scanned) throw new ValidationError('alta-weather: window.Alta is not a JSON object');
  return scanned;
}

/** 'YYYY-MM-DD HH:MM[:SS]' Denver wall time -> ISO with the Denver offset of that instant, or null. */
export function stampIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const m = STAMP_RE.exec(s);
  const ms = m ? zonedToUtc(s) : null;
  if (!m || ms === null) return null;
  const off = denverOffsetMin(ms);
  const abs = Math.abs(off);
  return `${m[1]}T${m[2]}:${m[3] ?? '00'}${off < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
