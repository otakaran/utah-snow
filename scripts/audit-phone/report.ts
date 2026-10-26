// Pure parts of scripts/audit-phone.ts: the result shape, byte totals by kind (above the fold, on load, full page),
// long-task totals, V8 coverage merging and the fix-1 card estimate. No Playwright import, so it unit-tests.
import type { JumpProbe } from './jump.ts';
import type { CardBox, ImgState, Layout } from './metrics.ts';
import type { Replay } from './replay.ts';

export type Phase = 'load' | 'scroll';
export interface Req {
  url: string;
  type: string; // Playwright resourceType()
  phase: Phase;
  bytes: number; // encoded body + response headers; 0 when the request failed
  status: number; // -1 = failed
}
export interface Bytes {
  total: number;
  n: number;
  byKind: Record<string, number>;
}
export interface Tasks {
  count: number;
  totalMs: number;
  maxMs: number;
}
export interface CoverageRow {
  url: string;
  chars: number;
  used: number;
}
export interface Audit {
  tool: 'audit-phone';
  at: string;
  url: string;
  route: string;
  /** The --snapshot replay (file, sizes, modelled wire delay, times served), or null for the server's snapshot. */
  snapshot: Replay | null;
  engine: 'chromium' | 'webkit';
  device: { width: number; height: number; dpr: number };
  throttle: { rttMs: number; downKbps: number; upKbps: number; cpu: number } | null;
  connection: { effectiveType: string | null; saveData: boolean | null };
  timing: { fcp: number | null; dcl: number | null; load: number | null; lcp: number | null; settle: number };
  lcp: { start: number; size: number; url: string; el: string } | null;
  longTasks: { load: Tasks; scroll: Tasks; list: { start: number; dur: number }[] } | null;
  /** Layout shifts (no recent input) up to the settle point: first source and every source's move; null where unsupported. */
  cls: { sum: number; shifts: { start: number; value: number; src: string; moves: string[] }[] } | null;
  ends: { path: string; end: number }[];
  layout: Layout;
  afterScroll: Layout;
  jump: JumpProbe | null;
  hlsLight: boolean;
  openMeteo: { stubbed: number; network: number };
  bytes: { aboveFold: Bytes; load: Bytes; full: Bytes };
  heroesOnLoad: { pick: number; other: number; cards: number };
  coverage: CoverageRow[] | null;
  requests: Req[];
}

const MEDIA_RE = /\.(?:m3u8|ts|m4s|mp4|aac)(?:[?#]|$)/i;

/** Byte bucket of a request: document, script, css, font, image, media, api (our /api), fetch, other. */
export function kind(r: Pick<Req, 'url' | 'type'>, origin: string): string {
  if (r.type === 'media' || MEDIA_RE.test(r.url)) return 'media';
  if (r.type === 'fetch' || r.type === 'xhr') return r.url.startsWith(`${origin}/api/`) ? 'api' : 'fetch';
  if (r.type === 'stylesheet') return 'css';
  return ['document', 'script', 'font', 'image'].includes(r.type) ? r.type : 'other';
}

export function sumBytes(reqs: readonly Req[], origin: string): Bytes {
  const out: Bytes = { total: 0, n: 0, byKind: {} };
  for (const r of reqs) {
    const k = kind(r, origin);
    out.total += r.bytes;
    out.n++;
    out.byKind[k] = (out.byKind[k] ?? 0) + r.bytes;
  }
  return out;
}

/** Image URLs whose element starts inside the first viewport (document top < fold). */
export function foldImages(images: readonly ImgState[], fold: number): Set<string> {
  return new Set(images.filter((i) => i.src && i.top < fold).map((i) => i.src));
}

/** Above the fold = every load-phase request except images and media that sit below the first viewport. */
export function aboveFold(reqs: readonly Req[], inFold: ReadonlySet<string>, origin: string): Req[] {
  return reqs.filter((r) => {
    if (r.phase !== 'load') return false;
    const k = kind(r, origin);
    return (k !== 'image' && k !== 'media') || inFold.has(r.url);
  });
}

export function tasks(long: readonly { start: number; dur: number }[], from: number, to: number): Tasks {
  const xs = long.filter((t) => t.start >= from && t.start < to);
  return {
    count: xs.length,
    totalMs: Math.round(xs.reduce((s, t) => s + t.dur, 0)),
    maxMs: Math.round(Math.max(0, ...xs.map((t) => t.dur))),
  };
}

/** CLS-style sum of layout shifts that started before `to`, 3 decimals. */
export function shiftSum(shifts: readonly { start: number; value: number }[], to: number): number {
  return Math.round(1000 * shifts.filter((x) => x.start < to).reduce((t, x) => t + x.value, 0)) / 1000;
}

interface V8Range {
  startOffset: number;
  endOffset: number;
  count: number;
}
/** Characters of a script V8 ran: nested block ranges, outer first, each overriding its parent. */
export function usedChars(functions: readonly { ranges: readonly V8Range[] }[], length: number): number {
  const ranges = functions.flatMap((f) => f.ranges);
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  const used = new Uint8Array(length);
  for (const r of ranges) used.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(r.endOffset, length));
  return used.reduce((s, u) => s + u, 0);
}

/** Pixels saved if every non-pick card closed down to its name row (fix 1), and the share of the page. */
export function collapseSaving(cards: readonly CardBox[], page: number): { px: number; pct: number } {
  const px = cards.filter((c) => !c.pick).reduce((s, c) => s + Math.max(0, c.height - c.collapsed), 0);
  return { px, pct: page > 0 ? Math.round((100 * px) / page) : 0 };
}
