// GET /api/tracker (spec §7, §9.3), no-store. Fields are mapped explicitly, so ip_hash, client_id and updated_by
// (never selected by store/tracker.ts) can never leak. Removed people, their days and their DV bookings are hidden.
// publicState() is also the `state` of every POST answer and the `current` of every 409.
import { summary } from '../../../shared/caps.ts';
import type { TrackerState } from '../../../shared/types.ts';
import { json } from '../../http.ts';
import { readTracker, type TrackerRaw } from '../../store/tracker.ts';

export type { TrackerState };

export function publicState(raw: TrackerRaw, now: number): TrackerState {
  const active = raw.people.filter((p) => p.deletedAt === null);
  const ids = new Set(active.map((p) => p.id));
  const days = raw.days
    .filter((d) => ids.has(d.personId))
    .map((d) => ({
      personId: d.personId,
      date: d.date,
      resortId: d.resortId,
      status: d.status,
      updatedAt: d.updatedAt,
    }));
  return {
    people: active.map((p) => ({ id: p.id, name: p.name, mode: p.mode, color: p.color, updatedAt: p.updatedAt })),
    days,
    bookings: raw.bookings
      .filter((b) => b.personId === '*' || ids.has(b.personId))
      .map((b) => ({ date: b.date, kind: b.kind, personId: b.personId, note: b.note, updatedAt: b.updatedAt })),
    audit: raw.audit.map((a) => ({
      id: a.id,
      at: a.at,
      action: a.action,
      entity: a.entity,
      key: a.key,
      before: a.before,
      after: a.after,
      undoneBy: a.undoneBy,
    })),
    summary: summary(days, [...ids]),
    serverTime: now,
  };
}

/** 409 `{error:'conflict', code?, current}`: the client applies `current` and toasts. */
export const conflict = (raw: TrackerRaw, now: number, code?: string): Response =>
  json({ error: 'conflict', ...(code ? { code } : {}), current: publicState(raw, now) }, { status: 409 });

export async function trackerGet(_req: Request, env: Env): Promise<Response> {
  return json(publicState(await readTracker(env.DB), Date.now()));
}
