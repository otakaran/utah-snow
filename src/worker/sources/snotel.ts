// SNOTEL hourly snowpack (spec §5.4 'snotel', §5.7 derivations, C.3). Job and row id 'snotel'.
// Stamps 'yyyy-MM-dd HH:mm' are PST all year; missing hours are omitted (index by time, never by position),
// and a whole element can be absent (off-season WTEQ at 628 and 1300 is filtered as suspect).
import { SNOTEL } from '../../../config/resorts.ts';
import { num, range } from '../../shared/num.ts';
import { DAY, HOUR, isoUtc, pstToUtc } from '../../shared/time.ts';
import type { SnotelSeries } from '../../shared/types.ts';
import { type FetchCtx, type Output, type Source, ValidationError } from './types.ts';

type Triplet = keyof typeof SNOTEL;
const TRIPLETS = Object.keys(SNOTEL) as Triplet[];
const BASE = 'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data';
export const SNOTEL_URL = `${BASE}?stationTriplets=${TRIPLETS.join(',')}&elements=SNWD,WTEQ,TOBS&duration=HOURLY&beginDate=-72&endDate=0`;
const PROBE_URL = `${BASE}?stationTriplets=1308:UT:SNTL&elements=SNWD&duration=HOURLY&beginDate=-72&endDate=0`;

const ANCHOR_UTC_H = 23; // 16:00 MST = 15:00 PST = 23:00 UTC; the window is 15:00-17:00 MST (§5.7)

/** Plausibility gates per element (imperial, as stored upstream). */
const GATES = { SNWD: [0, 400], WTEQ: [0, 200], TOBS: [-60, 120] } as const;
type Code = keyof typeof GATES;

export interface Pt {
  t: number; // epoch ms (UTC)
  v: number;
}
export interface Depth {
  now: number | null;
  since16: number | null;
  change24: number | null;
}
type Element = { stationElement?: { elementCode?: unknown }; values?: unknown };

function json(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError('snotel: body is not JSON');
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** pstToUtc memoized per parse: ~73 distinct stamps repeat across 7 stations x 3 elements (1 ms -> 0.1 ms). */
type Stamp = (date: string) => number | null;
function stamper(): Stamp {
  const memo = new Map<string, number | null>();
  return (date) => {
    const hit = memo.get(date);
    if (hit !== undefined) return hit;
    const t = pstToUtc(date);
    memo.set(date, t);
    return t;
  };
}

function points(values: unknown, code: Code, stamp: Stamp): Pt[] {
  if (!Array.isArray(values)) return [];
  const [min, max] = GATES[code];
  const out: Pt[] = [];
  for (const x of values as { date?: unknown; value?: unknown }[]) {
    const t = typeof x?.date === 'string' ? stamp(x.date) : null;
    const v = range(num(x?.value), min, max);
    if (t !== null && v !== null) out.push({ t, v });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * §5.7 on hourly SNWD (ascending by time). `now` = median of the last 3 values (hourly depth is noisy).
 * since16 = now − median(values at the anchor ±1 h), anchor = latest 16:00 MST at least 1 h older than the newest;
 * change24 = now − median(values 24 h before the last 3 stamps). Null when either side has < 2 values.
 * Negative results are kept (settling); the pick clamps since16 at >= 0.
 */
export function deriveDepth(snwd: readonly Pt[]): Depth {
  const last = snwd.slice(-3);
  const newest = last.at(-1);
  if (!newest) return { now: null, since16: null, change24: null };
  const now = median(last.map((p) => p.v));
  const byT = new Map(snwd.map((p) => [p.t, p.v]));
  const at = (ts: number[]) => ts.map((t) => byT.get(t)).filter((v): v is number => v !== undefined);
  const diff = (side: number[]) => (last.length >= 2 && side.length >= 2 ? round1(now - median(side)) : null);
  const anchor = Math.floor((newest.t - HOUR - ANCHOR_UTC_H * HOUR) / DAY) * DAY + ANCHOR_UTC_H * HOUR;
  return {
    now: round1(now),
    since16: diff(at([anchor - HOUR, anchor, anchor + HOUR])),
    change24: diff(at(last.map((p) => p.t - DAY))),
  };
}

function series(triplet: Triplet, data: unknown, stamp: Stamp): SnotelSeries {
  const el: Partial<Record<Code, Pt[]>> = {};
  for (const d of Array.isArray(data) ? (data as Element[]) : []) {
    const code = d?.stationElement?.elementCode;
    if (code === 'SNWD' || code === 'WTEQ' || code === 'TOBS') el[code] = points(d.values, code, stamp);
  }
  const snwd = el.SNWD ?? [];
  const depth = deriveDepth(snwd);
  const latest = (code: Code) => el[code]?.at(-1);
  // `at` is the newest depth stamp; without SNWD, the newest of the other elements.
  const atMs = latest('SNWD')?.t ?? (Math.max(latest('WTEQ')?.t ?? 0, latest('TOBS')?.t ?? 0) || null);
  return {
    triplet,
    name: SNOTEL[triplet].name,
    elevFt: SNOTEL[triplet].elevFt,
    snwdIn: depth.now,
    sweIn: latest('WTEQ')?.v ?? null,
    tempF: latest('TOBS')?.v ?? null,
    snwdChange24In: depth.change24,
    snwdSince16In: depth.since16,
    at: atMs === null ? null : isoUtc(atMs),
  };
}

/** Pure: AWDB `[{stationTriplet, data:[{stationElement:{elementCode}, values:[{date, value}]}]}]` -> by triplet. */
export function parseSnotel(raw: unknown): Record<string, SnotelSeries> {
  const doc = json(raw);
  if (!Array.isArray(doc)) throw new ValidationError('snotel: body is not an array');
  const out: Record<string, SnotelSeries> = {};
  const stamp = stamper();
  for (const st of doc as { stationTriplet?: unknown; data?: unknown }[]) {
    const triplet = st?.stationTriplet;
    if (typeof triplet === 'string' && triplet in SNOTEL) out[triplet] = series(triplet as Triplet, st.data, stamp);
  }
  // gate: >= 1 station with SNWD values
  if (!Object.values(out).some((s) => s.snwdIn !== null)) throw new ValidationError('snotel: no station has SNWD');
  return out;
}

export const snotel: Source<string> = {
  id: 'snotel',
  staleAfterMin: 180,
  rows: ['snotel'],
  maxSubrequests: () => 1, // one GET for all 7 stations; redirects are not followed
  probes: [{ hostId: 'snotel', url: PROBE_URL }],
  async fetch(ctx: FetchCtx): Promise<string> {
    const res = await ctx.fetch<string>(SNOTEL_URL, { headers: { Accept: 'application/json' }, follow: false });
    if (res.status !== 200) throw new Error(`snotel: HTTP ${res.status} (redirects are not followed)`);
    return res.data;
  },
  parse(raw: string): Output {
    return { rows: { snotel: parseSnotel(raw) } };
  },
};
