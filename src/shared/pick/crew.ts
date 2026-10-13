// Who is going and what they have left (spec §10 Scope): resolves members, builds the per-run context (cap-group
// thresholds, drive minutes, base longitude) and answers booking questions. Crew remaining = min across members.
import { BASES, DEFAULT_BASE, DRIVE } from '../../../config/bases.ts';
import { RESORT_IDS } from '../../../config/resorts.ts';
import { STRATEGY } from '../../../config/strategy.ts';
import { localHM } from '../time.ts';
import type {
  BookingKind,
  CapGroupId,
  PickArgs,
  PickMember,
  PickScope,
  PickTracker,
  ResortId,
  Snapshot,
} from '../types.ts';
import type { Units } from '../units.ts';
import type { RunMode } from './fresh.ts';
import { type GroupState, groupStates, skiDaysLeft } from './threshold.ts';

export interface Ctx {
  snap: Snapshot;
  nowMs: number;
  hm: string; // local 'HH:MM' of nowMs
  mode: RunMode;
  target: string;
  scope: PickScope;
  members: PickMember[]; // empty = one virtual skier with every day unused
  days: PickTracker['days'];
  bookings: NonNullable<PickTracker['bookings']>;
  sx: number;
  groups: Record<CapGroupId, GroupState>;
  drive: Record<ResortId, number>; // minutes; live delay included in 'today' only
  minDrive: number;
  baseLon: number;
  units: Units;
}

/** Tracker people whose id is in `ids`, in tracker order. */
export function resolveMembers(tracker: PickTracker, ids: readonly string[]): PickMember[] {
  const want = new Set(ids);
  return tracker.people.filter((p) => want.has(p.id)).map(({ id, name, mode }) => ({ id, name, mode }));
}

export function buildCtx(args: PickArgs, mode: RunMode, target: string): Ctx {
  const members = resolveMembers(args.tracker, args.memberIds);
  const fraction = args.skiFraction ?? STRATEGY.skiDayFraction;
  const { sx } = skiDaysLeft(target, fraction);
  const ids = members.map((m) => m.id);
  const base = args.base ?? DEFAULT_BASE;
  const preset = typeof base === 'string' ? base : DEFAULT_BASE;
  const drive = {} as Record<ResortId, number>;
  for (const r of RESORT_IDS) {
    const live = mode === 'today' ? Math.max(0, args.liveDelayMin?.[r] ?? 0) : 0;
    drive[r] = (args.drive?.[r] ?? DRIVE[preset][r].min) + live;
  }
  return {
    snap: args.snap,
    nowMs: args.nowMs,
    hm: localHM(args.nowMs),
    mode,
    target,
    scope: args.scope,
    members,
    days: args.tracker.days,
    bookings: args.tracker.bookings ?? [],
    sx,
    groups: groupStates(args.tracker.days, ids, target, sx, fraction),
    drive,
    minDrive: Math.min(...RESORT_IDS.map((r) => drive[r])),
    baseLon: typeof base === 'string' ? BASES[base].lon : base.lon,
    units: args.units ?? 'imperial',
  };
}

/** A booking of `kind` on the target day; `personId` undefined = anyone (parking is per car). */
export const hasBooking = (ctx: Ctx, kind: BookingKind, personId?: string): boolean =>
  ctx.bookings.some(
    (b) => b.date === ctx.target && b.kind === kind && (personId === undefined || b.personId === personId),
  );

/** Members without their own Deer Valley Ikon lift reservation on the target day. */
export const lackingDvLift = (ctx: Ctx): PickMember[] => ctx.members.filter((m) => !hasBooking(ctx, 'dv-lift', m.id));

/** Parking booking kind of a resort ('alta-parking'), or null for resorts without one. */
export function parkingKind(r: ResortId): BookingKind | null {
  const kind = `${r}-parking`;
  return kind === 'alta-parking' ||
    kind === 'brighton-parking' ||
    kind === 'solitude-parking' ||
    kind === 'snowbird-parking'
    ? kind
    : null;
}

/** True when the car has a parking booking at `r` on the target day. */
export function parkingBooked(ctx: Ctx, r: ResortId): boolean {
  const kind = parkingKind(r);
  return kind !== null && hasBooking(ctx, kind);
}

/** True in crew scope with several members: day lines read 'crew min 7 → 6' instead of '7 → 6 left'. */
export const crewMin = (ctx: Ctx): boolean => ctx.scope === 'crew' && ctx.members.length > 1;
