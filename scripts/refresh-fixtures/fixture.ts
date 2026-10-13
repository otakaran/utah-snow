// Raw payload -> fixture text (trimmed, <= 30 KB), and the re-parse check that compares the fixture's parse()
// output with the full payload's.
import type { ParseCtx, Source } from '../../src/worker/sources/types.ts';
import { openedPrev } from '../lib/jobs.ts';
import { TRIM } from './trim.ts';

export const MAX_BYTES = 30 * 1024; // check-repo's fixture cap

export interface Fixture {
  text: string;
  ext: 'html' | 'json';
  bytes: number;
}
export interface Check {
  ok: boolean;
  msg: string;
}

const isHtml = (v: unknown): v is string => typeof v === 'string' && /^\s*</.test(v);

function withNote(html: string, note: string): string {
  const c = `<!-- ${note.replaceAll('--', '-')} -->\n`;
  const doctype = /^\s*<!doctype[^>]*>\s*/i.exec(html)?.[0];
  return doctype ? `${doctype.trim()}\n${c}${html.slice(doctype.length)}` : `${c}${html}`;
}

/** HTML stays text (with a provenance comment); JSON, as an object or as text, is trimmed and re-serialized. */
export function toFixture(dir: string, raw: unknown, note: string): Fixture {
  const value = typeof raw === 'string' && !isHtml(raw) ? (JSON.parse(raw) as unknown) : raw;
  const trim = TRIM[dir];
  const out = trim ? trim(structuredClone(value)) : value;
  if (typeof out === 'string') {
    const text = withNote(out, note);
    return { text, ext: 'html', bytes: Buffer.byteLength(text) };
  }
  const pretty = `${JSON.stringify(out, null, 1)}\n`;
  const text = Buffer.byteLength(pretty) <= MAX_BYTES ? pretty : `${JSON.stringify(out)}\n`;
  return { text, ext: 'json', bytes: Buffer.byteLength(text) };
}

function firstDiff(a: unknown, b: unknown, path: string): string | null {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) {
    return `${path || '(root)'} (${JSON.stringify(a)?.slice(0, 60)} -> ${JSON.stringify(b)?.slice(0, 60)})`;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const d = firstDiff(x[k], y[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

/** parse() on the full payload and on the fixture text, with the same ctx. Not ok only when the trim broke parse. */
export function checkFixture(src: Source, raw: unknown, text: string, now: number): Check {
  const ctx: ParseCtx = { now, prev: openedPrev(src, now) };
  const run = (r: unknown): { rows: unknown } | { err: string } => {
    try {
      return { rows: src.parse(r, ctx).rows };
    } catch (e) {
      return { err: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
  };
  const full = run(raw);
  const back = run(typeof raw === 'string' ? text : JSON.parse(text));
  if ('err' in back) {
    return 'err' in full
      ? { ok: true, msg: `parse() throws on the full payload too: ${full.err}` }
      : { ok: false, msg: `parse() throws on the fixture only: ${back.err}` };
  }
  if ('err' in full) return { ok: false, msg: `parse() throws on the full payload only: ${full.err}` };
  const diff = firstDiff(full.rows, back.rows, '');
  return { ok: true, msg: diff ? `parse() output differs at ${diff}` : 'parse() output matches the full payload' };
}
