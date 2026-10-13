// POST /api/tracker (spec §9.3): guards (guard.ts), then one op per body. Write protocol: read the state (one batch),
// check the token (409 `conflict` + current state) and the rules (422 / warnings), then ONE batch = guarded write +
// guarded audit insert (+ undo mark) + state reads. A write that changed nothing is a 409 when the entity's token
// moved meanwhile, else the op's 422 (cap-exceeded, max-people, duplicate-name).
import { capOf, GROUP_VALUES, group, skiersOnly } from '../../../shared/caps.ts';
import { json } from '../../http.ts';
import {
  auditStmt,
  bookingDeleteStmt,
  bookingUpsertStmt,
  commit,
  type DayRow,
  dayDeleteStmt,
  dayUpsertStmt,
  type Entity,
  findBooking,
  findDay,
  findPerson,
  nextToken,
  type PersonRow,
  personInsertStmt,
  personSetStmt,
  readTracker,
  type TrackerRaw,
} from '../../store/tracker.ts';
import { conflict, publicState } from './get.ts';
import { dayRules, type Guarded, guard, type Op, personClash } from './guard.ts';
import { undoPlan } from './undo.ts';

/** One guarded write and what to answer when it changes nothing. */
export interface Plan {
  write: D1PreparedStatement;
  action: string;
  entity: Entity;
  key: string;
  before: unknown; // audit before_json: the row read in step 2
  after: unknown; // audit after_json: the row written (null = deleted)
  prev: number | null; // the token the write expects
  token: (raw: TrackerRaw) => number | null; // the entity's token in a state
  warnings?: string[];
  rejected?: (fresh: TrackerRaw) => Response | null; // the 422 when the token did not move
  extra?: D1PreparedStatement[]; // after the audit insert (undo marks the undone row)
  conflictCode?: string;
}

type OpOf<K extends Op['op']> = Extract<Op, { op: K }>;

const DEFAULT_COLOR = '#3b82f6'; // = the people.color column default
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** 10-char nanoid (crypto.getRandomValues). */
const newId = (): string => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => ID_CHARS[b & 63]).join('');

const dayToken = (personId: string, date: string) => (raw: TrackerRaw) =>
  findDay(raw, personId, date)?.updatedAt ?? null;
const personToken = (id: string) => (raw: TrackerRaw) => findPerson(raw, id)?.updatedAt ?? null;
const activePerson = (raw: TrackerRaw, id: string): PersonRow | undefined => {
  const p = findPerson(raw, id);
  return p && p.deletedAt === null ? p : undefined;
};

function upsertDay(db: D1Database, o: OpOf<'upsertDay'>, raw: TrackerRaw, g: Guarded): Plan | Response {
  const p = activePerson(raw, o.personId);
  const token = dayToken(o.personId, o.date);
  if (!p || token(raw) !== o.prev) return conflict(raw, g.now);
  const rules = dayRules(raw, p, o.date, o.resortId);
  if (rules instanceof Response) return rules;
  const after: DayRow = {
    personId: o.personId,
    date: o.date,
    resortId: o.resortId,
    status: o.status,
    updatedAt: nextToken(g.now, o.prev),
  };
  const gr = group(o.resortId);
  const write = { ...after, clientId: g.clientId, groupValues: GROUP_VALUES[gr], cap: capOf(gr), prev: o.prev };
  return {
    write: dayUpsertStmt(db, write),
    action: o.op,
    entity: 'ski_days',
    key: `${o.personId}|${o.date}`,
    before: findDay(raw, o.personId, o.date) ?? null,
    after,
    prev: o.prev,
    token,
    warnings: rules,
    rejected: (fresh) => {
      const r = dayRules(fresh, p, o.date, o.resortId);
      return r instanceof Response ? r : null;
    },
  };
}

function deleteDay(db: D1Database, o: OpOf<'deleteDay'>, raw: TrackerRaw, g: Guarded): Plan | Response {
  const token = dayToken(o.personId, o.date);
  if (token(raw) !== o.prev) return conflict(raw, g.now);
  return {
    write: dayDeleteStmt(db, o.personId, o.date, o.prev),
    action: o.op,
    entity: 'ski_days',
    key: `${o.personId}|${o.date}`,
    before: findDay(raw, o.personId, o.date) ?? null,
    after: null,
    prev: o.prev,
    token,
  };
}

function addPerson(db: D1Database, o: OpOf<'addPerson'>, raw: TrackerRaw, g: Guarded): Plan | Response {
  const clash = personClash(raw, null, o.name);
  if (clash) return clash;
  const after: PersonRow = {
    id: newId(),
    name: o.name,
    mode: o.mode,
    color: o.color ?? DEFAULT_COLOR,
    updatedAt: g.now,
    deletedAt: null,
  };
  return {
    write: personInsertStmt(db, { ...after, at: g.now }),
    action: o.op,
    entity: 'people',
    key: after.id,
    before: null,
    after,
    prev: null,
    token: personToken(after.id),
    rejected: (fresh) => personClash(fresh, null, o.name),
  };
}

/** updatePerson and removePerson: the new row replaces the active person `o.personId`. */
function setPerson(
  db: D1Database,
  o: OpOf<'updatePerson'> | OpOf<'removePerson'>,
  raw: TrackerRaw,
  g: Guarded,
): Plan | Response {
  const p = activePerson(raw, o.personId);
  if (!p || p.updatedAt !== o.prev) return conflict(raw, g.now);
  const updatedAt = nextToken(g.now, o.prev);
  const next: PersonRow =
    o.op === 'removePerson'
      ? { ...p, deletedAt: updatedAt, updatedAt }
      : { ...p, name: o.name ?? p.name, mode: o.mode ?? p.mode, color: o.color ?? p.color, updatedAt };
  const clash = o.op === 'updatePerson' ? personClash(raw, p.id, next.name) : null;
  if (clash) return clash;
  const warnings: string[] = [];
  const so = raw.days.filter((d) => d.personId === p.id && skiersOnly(d.resortId)).length;
  if (next.mode === 'board' && p.mode !== 'board' && so > 0)
    warnings.push(`${next.name} has ${so} skiers-only day${so === 1 ? '' : 's'} recorded`);
  return {
    write: personSetStmt(db, { ...next, prev: o.prev }),
    action: o.op,
    entity: 'people',
    key: p.id,
    before: p,
    after: next,
    prev: o.prev,
    token: personToken(p.id),
    warnings,
    rejected: (fresh) => (next.deletedAt === null ? personClash(fresh, p.id, next.name) : null),
  };
}

function booking(
  db: D1Database,
  o: OpOf<'upsertBooking'> | OpOf<'deleteBooking'>,
  raw: TrackerRaw,
  g: Guarded,
): Plan | Response {
  const key = { date: o.date, kind: o.kind, personId: o.personId };
  const token = (r: TrackerRaw) => findBooking(r, key)?.updatedAt ?? null;
  if ((o.personId !== '*' && !activePerson(raw, o.personId)) || token(raw) !== o.prev) return conflict(raw, g.now);
  const after =
    o.op === 'upsertBooking' ? { ...key, note: o.note, updatedAt: nextToken(g.now, o.prev) } : (null as null);
  const write = after
    ? bookingUpsertStmt(db, { ...after, clientId: g.clientId, prev: o.prev })
    : bookingDeleteStmt(db, key, o.prev as number);
  return {
    write,
    action: o.op,
    entity: 'bookings',
    key: `${o.date}|${o.kind}|${o.personId}`,
    before: findBooking(raw, key) ?? null,
    after,
    prev: o.prev,
    token,
  };
}

function planOf(db: D1Database, g: Guarded, raw: TrackerRaw): Plan | Response {
  const o = g.op;
  switch (o.op) {
    case 'upsertDay':
      return upsertDay(db, o, raw, g);
    case 'deleteDay':
      return deleteDay(db, o, raw, g);
    case 'addPerson':
      return addPerson(db, o, raw, g);
    case 'updatePerson':
    case 'removePerson':
      return setPerson(db, o, raw, g);
    case 'upsertBooking':
    case 'deleteBooking':
      return booking(db, o, raw, g);
    case 'undo':
      return undoPlan(db, o.auditId, raw, g);
  }
}

async function run(db: D1Database, plan: Plan, g: Guarded): Promise<Response> {
  const audit = auditStmt(db, {
    at: g.now,
    clientId: g.clientId,
    ipHash: g.ipHash,
    action: plan.action,
    entity: plan.entity,
    key: plan.key,
    before: plan.before,
    after: plan.after,
  });
  const { changes, raw } = await commit(db, [plan.write, audit, ...(plan.extra ?? [])]);
  if (changes === 0)
    return (plan.token(raw) === plan.prev && plan.rejected?.(raw)) || conflict(raw, g.now, plan.conflictCode);
  const warnings = plan.warnings?.length ? { warnings: plan.warnings } : {};
  return json({ ok: true, ...warnings, state: publicState(raw, g.now) });
}

export async function trackerPost(req: Request, env: Env): Promise<Response> {
  const g = await guard(req, env, Date.now());
  if (g instanceof Response) return g;
  const raw = await readTracker(env.DB, g.op.op === 'undo' ? g.op.auditId : undefined);
  const plan = planOf(env.DB, g, raw);
  return plan instanceof Response ? plan : run(env.DB, plan, g);
}
