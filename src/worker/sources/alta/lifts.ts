// Alta lift, gate and terrain-area states (spec §5.5 "Lift-state normalizers", Alta row). Alta exposes only a boolean
// `open` plus free-text notes, and `open: true` stays set overnight, so the state depends on local time vs the
// lift's opening_at/closing_at.
import { text } from '../../../shared/num.ts';
import { addDays } from '../../../shared/time.ts';
import type { Gate, LiftState, LiftStatus } from '../../../shared/types.ts';
import { arr, type Obj, obj, str } from './extract.ts';
import { stampIso } from './stamp.ts';

/** Local context: now as 'HH:MM', today as 'YYYY-MM-DD', and seasonal.is_winter. */
export interface Clock {
  hm: string;
  today: string;
  winter: boolean;
}

type Phase = 'before' | 'within' | 'after';

const HM_RE = /^\d{2}:\d{2}$/;
const hmOf = (v: unknown): string | null => (typeof v === 'string' && HM_RE.test(v) ? v : null);
const AREA: Record<string, LiftState> = {
  open: 'open',
  closed: 'closed',
  scheduled: 'scheduled',
  'route-in-progress': 'scheduled',
};

/** Where `hm` sits relative to [opens, closes] (inclusive). Unknown hours count as 'within' (trust the flag). */
function phase(opens: unknown, closes: unknown, hm: string): Phase {
  const o = hmOf(opens);
  const c = hmOf(closes);
  if (!o || !c) return 'within';
  if (hm < o) return 'before';
  return hm > c ? 'after' : 'within';
}

/** The stale overnight `open: true`, or a status change yesterday at/after opening time (it closed after running). */
function ranYesterday(l: Obj, today: string): boolean {
  if (l.open === true) return true;
  const upd = typeof l.updated_at === 'string' ? l.updated_at : '';
  const opens = hmOf(l.opening_at) ?? '00:00';
  return upd.slice(0, 10) === addDays(today, -1) && upd.slice(11, 16) >= opens;
}

export function liftState(l: Obj, clock: Clock, areaScheduled: boolean): LiftState {
  const notes = str(l.notes) ?? '';
  const ph = phase(l.opening_at, l.closing_at, clock.hm);
  if (ph === 'after') return 'closed';
  if (ph === 'before') {
    const expected = /delay/i.test(notes) || areaScheduled || ranYesterday(l, clock.today);
    return clock.winter && expected ? 'scheduled' : 'closed';
  }
  if (l.open === true) return /hold/i.test(notes) ? 'hold' : 'open';
  if (/hold|wind/i.test(notes)) return 'hold';
  return /delay|expected|later/i.test(notes) ? 'scheduled' : 'closed';
}

/** liftStatus.lifts[] -> LiftStatus[] (entries without a name are skipped). */
export function liftList(ls: Obj, clock: Clock): LiftStatus[] {
  const areaScheduled = arr(ls.terrainAreas).some((t) => obj(t)?.status === 'scheduled');
  const out: LiftStatus[] = [];
  for (const v of arr(ls.lifts)) {
    const l = obj(v);
    const name = str(l?.name);
    if (!l || !name) continue;
    out.push({
      id: String(l.id ?? name),
      name,
      state: liftState(l, clock, areaScheduled),
      raw: l.open === true ? 'open' : 'closed',
      area: null,
      opensAt: hmOf(l.opening_at),
      closesAt: hmOf(l.closing_at),
      note: text(l.notes),
      updatedAt: stampIso(l.updated_at),
    });
  }
  return out;
}

/** Access gates follow their first lift's hours: closed after it closes, at most scheduled before it opens. */
function gateState(g: Obj, clock: Clock): LiftState {
  const lift = obj(arr(g.lifts)[0]);
  const ph = lift ? phase(lift.opening_at, lift.closing_at, clock.hm) : 'within';
  const flagged: LiftState = g.open === true ? 'open' : g.scheduled === true ? 'scheduled' : 'closed';
  if (ph === 'after') return 'closed';
  if (ph === 'before') return clock.winter && flagged !== 'closed' ? 'scheduled' : 'closed';
  return flagged;
}

/** accessGates[] then terrainAreas[] as Gate[]; unlisted area statuses map to closed. */
export function gateList(ls: Obj, clock: Clock): Gate[] {
  const out: Gate[] = [];
  for (const v of arr(ls.accessGates)) {
    const g = obj(v);
    const name = str(g?.name);
    if (g && name) out.push({ name, state: gateState(g, clock), note: text(g.notes) });
  }
  for (const v of arr(ls.terrainAreas)) {
    const t = obj(v);
    const name = str(t?.name);
    if (!t || !name) continue;
    const status = str(t.status)?.toLowerCase() ?? '';
    const note = text(t.notes) ?? (status === 'route-in-progress' ? 'Route in progress' : null);
    out.push({ name, state: AREA[status] ?? 'closed', note });
  }
  return out;
}
