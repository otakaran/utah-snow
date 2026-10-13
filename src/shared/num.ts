// Number and text helpers for parsers (spec "Number helpers"). Never call parseFloat directly; use num().

const MISSING = -7999; // SNOTEL/NRCS "no data" sentinel
const NUM_RE = /-?\d+(\.\d+)?/;
const THOUSANDS_RE = /(\d),(?=\d{3}(?!\d))/g;

/**
 * First number in a value, or null for null/undefined, '--', '', 'N/A', whitespace and -7999.
 * Tolerates units and entities ('39&#8221;' -> 39) and thousands commas ('9,662 ft' -> 9662).
 */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v !== MISSING ? v : null;
  if (typeof v !== 'string') return null;
  const m = NUM_RE.exec(v.replace(THOUSANDS_RE, '$1'));
  if (!m) return null;
  const n = Number(m[0]);
  return n === MISSING ? null : n;
}

/** Keeps a value only when it lies in [min, max] (plausibility gate), else null. */
export function range(v: number | null | undefined, min: number, max: number): number | null {
  return v !== null && v !== undefined && v >= min && v <= max ? v : null;
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  deg: '°',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  prime: '′',
  Prime: '″',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  middot: '·',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  times: '×',
};

/** Decodes numeric (&#8221; &#x2033;) and common named HTML entities; unknown ones are left as is. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, body: string) => {
    if (body[0] !== '#') return NAMED[body] ?? NAMED[body.toLowerCase()] ?? all;
    const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}

/** Removes script/style blocks, comments and tags (each tag becomes a space). */
export function stripHtml(s: string): string {
  return s
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ');
}

/** Display text from markup: tags stripped, entities decoded, whitespace collapsed, cut to `max` chars. */
export function text(v: unknown, max = 600): string | null {
  if (typeof v !== 'string') return null;
  const t = decodeEntities(stripHtml(v)).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
