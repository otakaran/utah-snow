// "Where to ski today" (spec §10), pure and deterministic for a given input: powder first, and ration capped days.
// pick() runs the briefing's main target (today, or the trip start in preview; null pick after the trip);
// pickTomorrow() adds the forecast-only outlook from 15:00. Crew scope also reports members who would gain
// >= divergenceMin by going elsewhere ("as me" runs the same function with memberIds [me]).
import { TRIP } from '../../../config/ikon.ts';
import { RESORTS } from '../../../config/resorts.ts';
import { STRATEGY } from '../../../config/strategy.ts';
import { pickMode } from '../time.ts';
import type { PickArgs, PickResult, RankedResort } from '../types.ts';
import { actions, inputs } from './actions.ts';
import { buildCtx, type Ctx, resolveMembers } from './crew.ts';
import type { RunMode } from './fresh.ts';
import { rankWithPick, scoreAll, tierOf } from './rank.ts';
import { PREVIEW_REASON, signed } from './reasons.ts';
import { thresholdsOut } from './threshold.ts';

export { parkingRequired, routeCorridors } from './calendar.ts';
export { invExceed, skiDaysLeft } from './threshold.ts';

function divergences(args: PickArgs, ctx: Ctx, top: RankedResort): PickResult['divergences'] {
  if (args.scope !== 'crew' || ctx.members.length < 2) return [];
  const out: PickResult['divergences'] = [];
  for (const m of ctx.members) {
    const mine = run({ ...args, scope: 'me', memberIds: [m.id] }, ctx.mode, ctx.target);
    const best = mine.ranked[0];
    const there = mine.ranked.find((x) => x.resort === top.resort);
    if (!best || !there || best.resort === top.resort) continue;
    const gain = best.net - there.net;
    if (gain >= STRATEGY.divergenceMin) out.push({ personId: m.id, name: m.name, resort: best.resort, gain });
  }
  return out;
}

function run(args: PickArgs, mode: RunMode, target: string): PickResult {
  const ctx = buildCtx(args, mode, target);
  const { ranked: byNet, excluded } = scoreAll(ctx);
  const ranked = rankWithPick(byNet);
  const top = ranked[0] ?? null;
  const diverge = top ? divergences(args, ctx, top) : [];
  if (top) {
    if (mode === 'preview') top.reasons.unshift(PREVIEW_REASON);
    for (const d of diverge) top.reasons.push(`${d.name} would pick ${RESORTS[d.resort].name} ${signed(d.gain)}`);
  }
  return {
    mode,
    date: target,
    scope: args.scope,
    members: ctx.members,
    pick: top?.resort ?? null,
    tier: top ? tierOf(top.eff) : null,
    lowValue: top?.cls === 2,
    ranked,
    excluded,
    thresholds: thresholdsOut(ctx.groups),
    divergences: diverge,
    actions: actions(ctx, top),
    inputs: inputs(ctx),
  };
}

/** Today's pick (00:00-23:59 on a trip day), the trip-start preview before it, or `pick: null` after it. */
export function pick(args: PickArgs): PickResult {
  const { today } = pickMode(args.nowMs, STRATEGY.tomorrowFrom);
  if (today > TRIP.end) {
    const members = resolveMembers(args.tracker, args.memberIds);
    const empty = { ranked: [], excluded: [], thresholds: {}, divergences: [], actions: [], inputs: [] };
    return { mode: 'post', date: today, scope: args.scope, members, pick: null, tier: null, lowValue: false, ...empty };
  }
  return today < TRIP.start ? run(args, 'preview', TRIP.start) : run(args, 'today', today);
}

/** "Tomorrow outlook (forecast-based)": from 15:00 local when tomorrow is a trip day, else null. */
export function pickTomorrow(args: PickArgs): PickResult | null {
  const { tomorrow } = pickMode(args.nowMs, STRATEGY.tomorrowFrom);
  return tomorrow ? run(args, 'tomorrow', tomorrow) : null;
}
