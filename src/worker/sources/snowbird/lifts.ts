// Snowbird lifts, terrain gates, trail counts and season state (spec §5.4, §5.5). Pure helpers for snowbird.ts.
import { text } from '../../../shared/num.ts';
import { hm24, localDate } from '../../../shared/time.ts';
import type { Gate, LiftState, LiftStatus, ResortSnapshot } from '../../../shared/types.ts';

export type Obj = Record<string, unknown>;
export const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
export const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
export const iso = (ms: number): string => new Date(ms).toISOString();
/** Epoch seconds -> ISO, or null for 0 / missing / non-numbers. */
export const epochIso = (s: unknown): string | null =>
  typeof s === 'number' && Number.isFinite(s) && s > 1e9 ? iso(s * 1000) : null;

// Lifts never count as season opening before this local date: summer tram/lift operations end in October (§5.5).
export const SEASON_GATE = '2026-11-01';

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

// '9 am - 3:45 pm' -> 09:00 / 15:45. Off-season and unopened lifts carry 'TBD' or 'Closed for the season'.
const HOURS_RE = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i;

export function parseHours(hours: string | null): { opensAt: string | null; closesAt: string | null } {
  const m = hours ? HOURS_RE.exec(hours) : null;
  if (!m) return { opensAt: null, closesAt: null };
  return {
    opensAt: hm24(`${m[1]}:${m[2] ?? '00'} ${m[3]}m`),
    closesAt: hm24(`${m[4]}:${m[5] ?? '00'} ${m[6]}m`),
  };
}

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** `lifts[].{name,status,hours,sector.name,updated}`; entries without a name are skipped. */
export function liftList(raw: unknown[]): LiftStatus[] {
  const out: LiftStatus[] = [];
  for (const v of raw) {
    const l = asObj(v);
    const name = asStr(l?.name);
    if (!l || !name) continue;
    const status = asStr(l.status) ?? '';
    const hours = text(l.hours, 80);
    const { opensAt, closesAt } = parseHours(hours);
    out.push({
      id: slug(name),
      name,
      state: liftState(status),
      raw: status,
      area: asStr(asObj(l.sector)?.name),
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
    const g = asObj(v);
    const name = asStr(g?.name);
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
    const t = asObj(v);
    if (t?.season !== 'winter' || t.type !== 'alpine_trail' || t.include !== true) continue;
    total++;
    if (liftState(t.status) === 'open') open++;
    if (typeof t.groom_status === 'string' && t.groom_status.startsWith('groomed')) groomed++;
  }
  return total ? { open, total, groomed } : null;
}

/**
 * Season state (§5.5): seasonOpenedAt is copied forward and set to now the first time, on or after SEASON_GATE,
 * that any lift is open or on hold. Preseason until then; afterwards open while any lift is open/hold/scheduled.
 */
export function seasonState(
  lifts: LiftStatus[],
  prevOpenedAt: string | null,
  now: number,
): { season: ResortSnapshot['season']; seasonOpenedAt: string | null } {
  const running = lifts.some((l) => l.state === 'open' || l.state === 'hold');
  const seasonOpenedAt = prevOpenedAt ?? (running && localDate(now) >= SEASON_GATE ? iso(now) : null);
  if (seasonOpenedAt === null) return { season: 'preseason', seasonOpenedAt };
  const active = lifts.some((l) => l.state === 'open' || l.state === 'hold' || l.state === 'scheduled');
  return { season: active ? 'open' : 'closed-for-day', seasonOpenedAt };
}
