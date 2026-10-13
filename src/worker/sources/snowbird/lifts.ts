// Snowbird lifts, terrain gates and trail counts (spec §5.4, §5.5). Pure helpers for snowbird.ts.
import { obj, str } from '../../../shared/json.ts';
import { liftHours, liftId } from '../../../shared/lifts.ts';
import { text } from '../../../shared/num.ts';
import { isoUtc } from '../../../shared/time.ts';
import type { Gate, LiftState, LiftStatus, ResortSnapshot } from '../../../shared/types.ts';

/** Epoch seconds -> ISO, or null for 0 / missing / non-numbers. */
const epochIso = (s: unknown): string | null =>
  typeof s === 'number' && Number.isFinite(s) && s > 1e9 ? isoUtc(s * 1000) : null;

// §5.5 normalizer: s = status.toLowerCase().replace(/[\s-]+/g,'_'); anything unlisted is closed (raw keeps it).
const STATE: Record<string, LiftState> = {
  open: 'open',
  opening: 'open',
  on_hold: 'hold',
  expected: 'scheduled',
  expected_opening: 'scheduled',
  scheduled: 'scheduled',
  delayed: 'scheduled',
  closed: 'closed',
  closed_for_the_season: 'closed',
  close: 'closed',
};

export function liftState(status: unknown): LiftState {
  const s = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return STATE[s.replace(/[\s-]+/g, '_')] ?? 'closed';
}

/** `lifts[].{name,status,hours,sector.name,updated}`; entries without a name are skipped. */
export function liftList(raw: unknown[]): LiftStatus[] {
  const out: LiftStatus[] = [];
  for (const v of raw) {
    const l = obj(v);
    const name = str(l?.name);
    if (!l || !name) continue;
    const status = str(l.status) ?? '';
    const hours = text(l.hours, 80); // '9 am - 3:45 pm'; off-season and unopened lifts: 'TBD', 'Closed for the season'
    const { opensAt, closesAt } = liftHours(hours);
    out.push({
      id: liftId(name),
      name,
      state: liftState(status),
      raw: status,
      area: str(obj(l.sector)?.name),
      opensAt,
      closesAt,
      note: opensAt ? null : hours,
      updatedAt: epochIso(l.updated),
    });
  }
  return out;
}

export function liftSummary(list: LiftStatus[]): ResortSnapshot['lifts'] {
  const count = (s: LiftState) => list.filter((l) => l.state === s).length;
  return { open: count('open'), hold: count('hold'), scheduled: count('scheduled'), total: list.length, list };
}

/** `terrains[].{name,status}` -> gates; null when the payload is unusable (the caller keeps the last-good gates). */
export function gateList(raw: unknown): Gate[] | null {
  if (!Array.isArray(raw)) return null;
  const gates: Gate[] = [];
  for (const v of raw) {
    const g = obj(v);
    const name = str(g?.name);
    if (g && name) gates.push({ name, state: liftState(g.status), note: null });
  }
  return gates.length ? gates : null;
}

/** Winter alpine trails only (summer hiking/bike trails read 'open' off-season); null when none match. */
export function trailCounts(raw: unknown): ResortSnapshot['trails'] | null {
  if (!Array.isArray(raw)) return null;
  let open = 0;
  let total = 0;
  let groomed = 0;
  for (const v of raw) {
    const t = obj(v);
    if (t?.season !== 'winter' || t.type !== 'alpine_trail' || t.include !== true) continue;
    total++;
    if (liftState(t.status) === 'open') open++;
    if (typeof t.groom_status === 'string' && t.groom_status.startsWith('groomed')) groomed++;
  }
  return total ? { open, total, groomed } : null;
}
