// Trim helpers for refresh-fixtures: keep the fields parse() reads, cap arrays, shrink scraped HTML. Pure.
import { altaJson } from '../../src/shared/alta-page.ts';
import { isObj, type Obj } from '../../src/shared/json.ts';

/** Keys to keep: a name keeps the value whole, `{ key: Shape }` recurses ('*' = every key). Arrays: per item. */
export type Shape = readonly (string | { readonly [key: string]: Shape })[];

function rule(shape: Shape, key: string): Shape | true | null {
  for (const s of shape) {
    if (s === key) return true;
    if (typeof s !== 'string') {
      const sub = s[key] ?? s['*'];
      if (sub) return sub;
    }
  }
  return null;
}

/** `v` with only the keys `shape` names, in their original order. */
export function keep(v: unknown, shape: Shape): unknown {
  if (Array.isArray(v)) return v.map((x) => keep(x, shape));
  if (!isObj(v)) return v;
  const out: Obj = {};
  for (const [k, x] of Object.entries(v)) {
    const r = rule(shape, k);
    if (r) out[k] = r === true ? x : keep(x, r);
  }
  return out;
}

/** The last `n` items of an array (anything else unchanged). */
export const tail = (v: unknown, n: number): unknown => (Array.isArray(v) ? v.slice(-n) : v);

/** The first and the last `n` items of an array (anything else unchanged). */
export const ends = (v: unknown, n: number): unknown =>
  Array.isArray(v) && v.length > 2 * n ? [...v.slice(0, n), ...v.slice(-n)] : v;

/** Applies `f` to each value of an object or array (in place) and returns it. */
export function each<T>(v: T, f: (x: Obj) => void): T {
  for (const x of Array.isArray(v) ? v : isObj(v) ? Object.values(v) : []) if (isObj(x)) f(x);
  return v;
}

/** An alta.com page reduced to its window.Alta script, with `f` applied to the object. */
export function altaPage(html: unknown, f: (root: Obj) => unknown): string {
  const root = altaJson(String(html));
  if (!root) throw new Error('window.Alta missing');
  const json = JSON.stringify(f(root)).replaceAll('/', '\\/'); // as Laravel writes it: '</' never occurs
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<script>window.Alta = ${json};</script>\n</head>\n<body></body>\n</html>\n`;
}

const DROP_BLOCKS = /<(script|style|svg|noscript|iframe|picture|template)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi;
const DROP_TAGS = /<(?:img|source|link|meta|input)\b[^>]*>/gi;
const TAG_ATTRS = /<([a-z][a-z0-9]*)(\s[^>]*)>/gi;
const KEPT_ATTR = /\s(?:class="[^"]*"|href="#")/g; // regex scrapers match on class names and accordion toggles

/** Scraped HTML without scripts, styles, media, comments, the head and attributes other than class. */
export function cleanHtml(html: string): string {
  return html
    .replace(DROP_BLOCKS, '')
    .replace(DROP_TAGS, '')
    .replace(/<head\b[\s\S]*?<\/head>/i, '<head></head>')
    .replace(TAG_ATTRS, (_, tag: string, attrs: string) => `<${tag}${(attrs.match(KEPT_ATTR) ?? []).join('')}>`)
    .replace(/[ \t]*\n\s*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
}
