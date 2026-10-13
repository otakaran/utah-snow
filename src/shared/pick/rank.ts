// Score, tie-break and rank (spec §10.2 step 6). net = quality + day term - penalties. Inside the tie band
// (top net - tieEps) the pick prefers a free day (cls), then more snow, a shorter drive, then registry order.
import { RESORT_IDS } from '../../../config/resorts.ts';
import { POWDER_MULT, STRATEGY } from '../../../config/strategy.ts';
import { group, skiersOnly } from '../caps.ts';
import type { RankedResort, ResortId, Tier } from '../types.ts';
import { type Ctx, crewMin } from './crew.ts';
import { effOf, fresh } from './fresh.ts';
import { exclusions, penalties } from './gates.ts';
import { dayLine, joinNames, snowLine } from './reasons.ts';
import { dayTerm } from './threshold.ts';

const EPS = 1e-9;

export interface Scored {
  ranked: RankedResort[]; // by net desc, registry order on equal nets
  excluded: { resort: ResortId; reasons: string[] }[];
}

function score(ctx: Ctx, r: ResortId): RankedResort {
  const f = fresh(ctx.snap, r, ctx.mode, ctx.nowMs);
  const eff = effOf(f);
  const quality = POWDER_MULT[r] * eff;
  const g = group(r);
  const st = ctx.groups[g];
  const term = dayTerm(g, eff, st);
  const pens = penalties(ctx, r, eff);
  const net = quality + term.value - pens.reduce((s, p) => s + p.value, 0);
  const reasons = [
    snowLine(f, ctx.mode === 'tomorrow', ctx.units),
    dayLine(g, st, term, { eff, sx: ctx.sx, crewMin: crewMin(ctx), units: ctx.units }),
    ...pens.flatMap((p) => (p.reason ? [p.reason] : [])),
  ];
  const unknown = skiersOnly(r) ? ctx.members.filter((m) => m.mode === 'unknown') : [];
  if (unknown.length) reasons.push(`Confirm ski/board for ${joinNames(unknown.map((m) => m.name))}`);
  return {
    resort: r,
    net,
    eff,
    quality,
    cls: term.cls,
    driveMin: ctx.drive[r],
    dayCost: {
      group: g,
      spends: g === 'solitude' ? 0 : 1,
      before: Number.isFinite(st.remaining) ? st.remaining : null,
      threshold: g === 'solitude' ? null : st.threshold,
    },
    fresh: f,
    reasons,
  };
}

/** Every resort either scored or excluded (with all its reasons). */
export function scoreAll(ctx: Ctx): Scored {
  const ranked: RankedResort[] = [];
  const excluded: Scored['excluded'] = [];
  for (const r of RESORT_IDS) {
    const why = exclusions(ctx, r);
    if (why.length) excluded.push({ resort: r, reasons: why });
    else ranked.push(score(ctx, r));
  }
  ranked.sort((a, b) => b.net - a.net); // stable: registry order breaks exact ties
  return { ranked, excluded };
}

const order = (r: ResortId): number => RESORT_IDS.indexOf(r);

/** cls asc, eff desc, drive asc, registry order. */
function tieBreak(a: RankedResort, b: RankedResort): number {
  if (a.cls !== b.cls) return a.cls - b.cls;
  if (Math.abs(a.eff - b.eff) > EPS) return b.eff - a.eff;
  if (a.driveMin !== b.driveMin) return a.driveMin - b.driveMin;
  return order(a.resort) - order(b.resort);
}

/** [pick, ...the rest by net]: the pick is the tie-break winner of the band within tieEps of the top net. */
export function rankWithPick(byNet: readonly RankedResort[]): RankedResort[] {
  const top = byNet[0];
  if (!top) return [];
  const band = byNet.filter((x) => x.net >= top.net - STRATEGY.tieEps - EPS);
  const pick = [...band].sort(tieBreak)[0] ?? top;
  return [pick, ...byNet.filter((x) => x !== pick)];
}

export function tierOf(eff: number): Tier {
  const t = STRATEGY.tiers;
  return eff >= t.deep ? 'deep' : eff >= t.good ? 'good' : eff >= t.soft ? 'soft' : 'quiet';
}
