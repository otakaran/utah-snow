// PickResult side lists (spec §10.2 step 6, §10.3): booking actions for the pick and the source rows behind it.
import { LIFT_RESERVATION } from '../../../config/ikon.ts';
import { RESORT_IDS, RESORTS } from '../../../config/resorts.ts';
import { ageMin, badge } from '../freshness.ts';
import type { Meta, PickResult, PickSourceRow, RankedResort, ResortId } from '../types.ts';
import { parkingBooking, parkingRequired, routeCorridors } from './calendar.ts';
import { type Ctx, lackingDvLift, parkingBooked } from './crew.ts';
import { clockAt } from './reasons.ts';

/** Book the pick's missing parking / DV lift reservation; cancel the crew's parking elsewhere while refundable. */
export function actions(ctx: Ctx, top: RankedResort | null): PickResult['actions'] {
  if (!top || ctx.mode === 'preview') return [];
  const out: PickResult['actions'] = [];
  const r = top.resort;
  const book = parkingBooking(r);
  if (book && parkingRequired(r, ctx.target) && !parkingBooked(ctx, r)) {
    out.push({ label: `Book ${RESORTS[r].name} parking`, url: book.url });
  }
  if (r === 'deer-valley' && lackingDvLift(ctx).length) {
    out.push({ label: 'Book Deer Valley Ikon reservation', url: LIFT_RESERVATION['deer-valley'].book });
  }
  for (const other of RESORT_IDS) {
    const b = other === r ? null : parkingBooking(other);
    if (!b || !parkingBooked(ctx, other)) continue;
    if (ctx.mode === 'today' && b.cancelBy && ctx.hm >= b.cancelBy) continue; // too late for a refund
    const by = b.cancelBy ? ` by ${clockAt(ctx.target, b.cancelBy)}` : '';
    out.push({ label: `Cancel ${RESORTS[other].name} parking${by}`, url: b.url });
  }
  return out;
}

/** Freshness of every source the run reads: resort reports, summit forecasts, SNOTEL, and live data in 'today'. */
export function inputs(ctx: Ctx): PickSourceRow[] {
  const { snap } = ctx;
  const metas: (Meta | undefined)[] = [];
  for (const r of RESORT_IDS) {
    if (ctx.mode !== 'tomorrow') metas.push(snap.resorts[r]?.meta);
    metas.push(snap.forecast[`${r}:summit`]?.meta);
  }
  if (ctx.mode !== 'tomorrow') metas.push(snap.snotel?.meta);
  if (ctx.mode === 'today') {
    metas.push(snap.obs?.meta, snap.avalanche?.meta);
    const corridors = new Set(RESORT_IDS.flatMap((r: ResortId) => routeCorridors(ctx.baseLon, r)));
    for (const c of corridors) metas.push(snap.roads[c]?.meta);
  }
  const seen = new Set<string>();
  const out: PickSourceRow[] = [];
  for (const m of metas) {
    if (!m || seen.has(m.source)) continue;
    seen.add(m.source);
    const age = ageMin(m, ctx.nowMs);
    out.push({ source: m.source, status: badge(m, ctx.nowMs), ageMin: age === null ? null : Math.round(age) });
  }
  return out;
}
