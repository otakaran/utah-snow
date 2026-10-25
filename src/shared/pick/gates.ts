// Exclusions and penalties (spec §10.2 steps 4-5). An excluded resort is never scored and lists every matching
// reason; each non-zero penalty (inches) adds a reason line with its value. Live roads, holds and avalanche danger
// apply in 'today' only; bookings and opening are not checked in 'preview'.
import { LIFT_RESERVATION } from '../../../config/ikon.ts';
import { UTA_SKI_BUS } from '../../../config/parking.ts';
import { RESORTS, type ResortDef } from '../../../config/resorts.ts';
import { STRATEGY } from '../../../config/strategy.ts';
import { group, remaining, skiersOnly } from '../caps.ts';
import { usable } from '../freshness.ts';
import { routeCorridors } from '../geo.ts';
import { formatLocalDate, HOUR, hm24, isoToMs } from '../time.ts';
import type { ResortId, RoadStatus } from '../types.ts';
import { isBusy, parkingRequired, roadName } from './calendar.ts';
import { type Ctx, lackingDvLift, parkingBooked } from './crew.ts';
import { summitForecast } from './fresh.ts';
import { clockAt, joinNames, signed, wind, zeroDaysLine } from './reasons.ts';

export interface Penalty {
  value: number;
  reason: string | null; // null = below the reason cut-off (drive < 0.5)
}

const ROAD_WHY: Record<NonNullable<RoadStatus['reason']>, string> = {
  avalanche: ' for avalanche control',
  crash: ' after a crash',
  weather: ' for weather',
  construction: ' for construction',
};

/** Lift counts from a usable resort row only: stale holds neither exclude nor charge. */
function liveLifts(ctx: Ctx, r: ResortId): { open: number; hold: number } | null {
  const block = ctx.snap.resorts[r];
  return (block && usable(block.meta, ctx.nowMs) ? block.data?.lifts : null) ?? null;
}

/** The posted ETO as local 'HH:MM', or null when missing or not a clock time. */
const etoHm = (road: RoadStatus): string | null => (road.eto ? hm24(road.eto) : null);

function roadExclusions(ctx: Ctx, r: ResortId): string[] {
  const out: string[] = [];
  for (const c of routeCorridors(ctx.baseLon, r)) {
    const road = ctx.snap.roads[c]?.data;
    if (!road) continue;
    if (road.state === 'interlodge' || road.state === 'uphill-restricted') {
      out.push(`${roadName(c)}: ${road.state.replace('-', ' ')}`);
    } else if (road.state === 'closed') {
      const eto = etoHm(road);
      if (eto === null || eto > STRATEGY.eto.penBy) {
        out.push(`${roadName(c)} closed, ETO ${eto ? clockAt(ctx.target, eto) : (road.eto ?? 'unknown')}`);
      }
    }
  }
  return out;
}

export function exclusions(ctx: Ctx, r: ResortId): string[] {
  const out: string[] = [];
  const g = group(r);
  if (ctx.groups[g].remaining <= 0) {
    const left = (id: string) => remaining(ctx.days, id, g, { excludeDate: ctx.target });
    const zero = ctx.members.filter((m) => left(m.id) <= 0).map((m) => m.name);
    out.push(zeroDaysLine(zero, g));
  }
  const boarders = skiersOnly(r) ? ctx.members.filter((m) => m.mode === 'board') : [];
  if (boarders.length) {
    const verb = boarders.length === 1 ? 'snowboards' : 'snowboard';
    out.push(`${joinNames(boarders.map((m) => m.name))} ${verb} – ${RESORTS[r].name} is skiers-only`);
  }
  if (ctx.mode !== 'preview' && ctx.snap.resorts[r]?.data?.operatingToday === false) {
    const open = RESORTS[r].projectedOpen;
    out.push(`Not open yet (projected ${open ? formatLocalDate(open, 'md') : 'date TBA'})`);
  }
  if (r === 'deer-valley' && ctx.mode !== 'preview') {
    const lacking = lackingDvLift(ctx);
    const dv = LIFT_RESERVATION['deer-valley'];
    if (lacking.length) {
      const who = joinNames(lacking.map((m) => m.name));
      out.push(`No DV Ikon reservation for ${who} – book at ${dv.book} (same-day if space; cancel by ${dv.cancelBy})`);
    }
  }
  if (ctx.mode === 'today') {
    out.push(...roadExclusions(ctx, r));
    const lifts = liveLifts(ctx, r);
    const allHold = lifts !== null && lifts.open === 0 && lifts.hold > 0;
    if (allHold && ctx.hm >= STRATEGY.allHoldExcludeFrom) out.push('All lifts on hold');
  }
  return out;
}

function drivePenalty(ctx: Ctx, r: ResortId): Penalty | null {
  const min = ctx.drive[r];
  const extra = min - ctx.minDrive;
  const value = Math.min(STRATEGY.drivePenMax, extra * STRATEGY.driveInPerMin);
  if (!(value > 0)) return null;
  const reason = `${Math.round(min)} min drive, ${Math.round(extra)} min more than the closest ${signed(-value)}`;
  return { value, reason: value >= 0.5 ? reason : null };
}

function etoPenalties(ctx: Ctx, r: ResortId): Penalty[] {
  const out: Penalty[] = [];
  for (const c of routeCorridors(ctx.baseLon, r)) {
    const road = ctx.snap.roads[c]?.data;
    const eto = road?.state === 'closed' ? etoHm(road) : null;
    if (!road || eto === null || eto > STRATEGY.eto.penBy) continue;
    const head = `${roadName(c)} closed${road.reason ? ROAD_WHY[road.reason] : ''}, ETO ${clockAt(ctx.target, eto)}`;
    if (eto <= STRATEGY.eto.freeBy) out.push({ value: 0, reason: `${head} – opens before first chair` });
    else out.push({ value: STRATEGY.eto.pen, reason: `${head} ${signed(-STRATEGY.eto.pen)}` });
  }
  return out;
}

const READING_FRESH_MS = 3 * HOUR; // a summit reading older than this is not "now" (nws-obs FRESH_MS)

/** An unstamped reading is trusted (the row badge covers it); a stamped one must be under 3 h old. */
function freshAt(at: string | null | undefined, nowMs: number): boolean {
  const ms = isoToMs(at ?? null);
  return ms === null || nowMs - ms <= READING_FRESH_MS;
}

/** A gust in mph, or the sources that exist but are too old to count (no reason when there is no data at all). */
type Gust = { mph: number } | { stale: string } | null;

/** After 07:00 in 'today': the NWS station's gust, else the resort's own sensors (gust, else sustained wind). */
function liveGust(ctx: Ctx, r: ResortId): Gust {
  const def: ResortDef = RESORTS[r];
  const obs = ctx.snap.obs;
  const st = obs && usable(obs.meta, ctx.nowMs) ? obs.data?.[def.obs.summitGust ?? def.obs.summit] : undefined;
  let stale: string | null = null;
  if (st?.gustMph != null) {
    if (freshAt(st.at, ctx.nowMs)) return { mph: st.gustMph };
    stale = `NWS ${st.station}`;
  }
  const block = ctx.snap.resorts[r];
  const w = block && usable(block.meta, ctx.nowMs) ? block.data?.weather : undefined; // `{}` payloads: undefined
  const mph = w && w.src !== 'none' ? (w.summitGustMph ?? w.summitWindMph ?? null) : null;
  if (mph != null) {
    if (freshAt(w?.obsAt, ctx.nowMs)) return { mph };
    stale = stale ? `${stale} and ${def.name} sensors` : `${def.name} sensors`;
  }
  return stale ? { stale } : null;
}

/** Summit gust: NWS max for the day before 07:00 and in 'tomorrow'; the live reading after 07:00. */
function gustOf(ctx: Ctx, r: ResortId): Gust {
  if (ctx.mode === 'preview') return null;
  if (ctx.mode === 'tomorrow' || ctx.hm < '07:00') {
    const g = summitForecast(ctx.snap, r)?.days.find((d) => d.date === ctx.target)?.gustMaxMph ?? null;
    return g === null ? null : { mph: g };
  }
  return liveGust(ctx, r);
}

function livePenalties(ctx: Ctx, r: ResortId): Penalty[] {
  const out: Penalty[] = [];
  const lifts = liveLifts(ctx, r);
  const running = lifts ? lifts.open + lifts.hold : 0;
  if (lifts && lifts.hold > 0 && running > 0) {
    const value = (STRATEGY.holdPen * lifts.hold) / running;
    out.push({ value, reason: `${lifts.hold} of ${running} lifts on hold ${signed(-value)}` });
  }
  const zone = ctx.snap.avalanche?.data?.find((z) => z.zoneId === RESORTS[r].uacZone);
  if (zone && !zone.offSeason && zone.level >= 4) {
    const value = STRATEGY.avyHighPen;
    out.push({ value, reason: `UAC avalanche danger ${zone.danger} (level ${zone.level}) ${signed(-value)}` });
  }
  return out;
}

function parkingPenalty(ctx: Ctx, r: ResortId): Penalty | null {
  if (ctx.mode === 'preview' || !parkingRequired(r, ctx.target) || parkingBooked(ctx, r)) return null;
  const corridor = RESORTS[r].corridor;
  const routes = corridor in UTA_SKI_BUS.routes ? UTA_SKI_BUS.routes[corridor as keyof typeof UTA_SKI_BUS.routes] : [];
  const bus = `UTA ${routes.join('/')} from ${UTA_SKI_BUS.stops[0]} (free with Ikon)`;
  const value = STRATEGY.busPen;
  return { value, reason: `No ${RESORTS[r].name} parking reservation → ${bus} ${signed(-value)}` };
}

export function penalties(ctx: Ctx, r: ResortId, eff: number): Penalty[] {
  const out: Penalty[] = [];
  const drive = drivePenalty(ctx, r);
  if (drive) out.push(drive);
  if (ctx.mode === 'today') out.push(...etoPenalties(ctx, r), ...livePenalties(ctx, r));
  const gust = gustOf(ctx, r);
  if (gust && 'stale' in gust) {
    out.push({ value: 0, reason: `Summit wind unknown – ${gust.stale} older than 3 h` });
  } else if (gust) {
    const rule = STRATEGY.gust.find((x) => gust.mph >= x.gteMph);
    if (rule) {
      const why = `${RESORTS[r].name} summit gusts ${wind(gust.mph, ctx.units)} – upper lifts may hold`;
      out.push({ value: rule.pen, reason: `${why} ${signed(-rule.pen)}` });
    }
  }
  const parking = parkingPenalty(ctx, r);
  if (parking) out.push(parking);
  const busy = STRATEGY.snowbirdBusy;
  if (r === 'snowbird' && isBusy(ctx.target) && eff >= busy.minEffIn) {
    out.push({ value: busy.pen, reason: `Snowbird free lots fill early – arrive before 8 ${signed(-busy.pen)}` });
  }
  return out;
}
