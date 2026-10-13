// Tracker store (spec §9.3, §9.5, §8.8): GET /api/tracker fills the signals; every POST op is applied optimistically,
// sent one at a time with its optimistic-concurrency token, and the response state replaces the local copy.
// Polls while the page is visible: every 30 s while the tracker page watches, otherwise every 10 min (the pick
// reads it), plus on focus. A 404 (route not deployed) keeps the empty crew and retries every 10 min.
// 409: apply the fresh state, then finish, retry once or show "Changed on another phone – updated"
// (optimistic.ts `conflictPlan`). 422 / 429 / 403 / offline: revert and show an inline notice. A 200 for an op sent
// with `saved` text shows it as a brief "saved" notice whose Undo reverts that op's audit row.
import { batch, computed, signal } from '@preact/signals';
import type { PickTracker } from '../../shared/types.ts';
import { clientId, notify } from './tracker/notice.ts';
import { applyOp, auditIdFor, conflictPlan, prevOf } from './tracker/optimistic.ts';
import {
  type AuditEntry,
  type BookingRow,
  type DayRow,
  EMPTY_STATE,
  failureText,
  type PersonRow,
  parseState,
  stateIn,
  type TrackerOp,
  type TrackerState,
  warningsOf,
} from './tracker/wire.ts';

export { dismissNotice, type Notice, type NoticeTone, notify, trackerNotice } from './tracker/notice.ts';
export type {
  AuditEntry,
  BookingRow,
  DayRow,
  Person,
  PersonRow,
  TrackerBooking,
  TrackerDay,
  TrackerOp,
  TrackerState,
} from './tracker/wire.ts';

export type TrackerStatus = 'idle' | 'ok' | 'missing' | 'error';

const API = '/api/tracker';
const PAGE_MS = 30_000;
const BACKGROUND_MS = 10 * 60_000;
const MISSING_MS = 10 * 60_000;
const TICK_MS = 5_000;
const FOCUS_GAP_MS = 10_000;

interface Item {
  op: TrackerOp;
  saved?: string | undefined;
  settle: (ok: boolean) => void;
}

const confirmed = signal<TrackerState>(EMPTY_STATE);
const queue = signal<readonly Item[]>([]);
const shown = computed(() => queue.value.reduce((s, i) => applyOp(s, i.op), confirmed.value));

/** Everyone in the tracker (removed people excluded), with pending edits applied. */
export const people = computed<PersonRow[]>(() => shown.value.people);
/** Every planned or skied day of every active person, with pending edits applied. */
export const skiDays = computed<DayRow[]>(() => shown.value.days);
/** Recorded bookings (parking per car '*', DV lift reservations per person). */
export const bookings = computed<BookingRow[]>(() => shown.value.bookings);
/** The last 50 audit rows, newest first (server-confirmed only). */
export const audit = computed<AuditEntry[]>(() => confirmed.value.audit);
/** Server time of the last applied state (ms; 0 before the first answer). */
export const trackerServerTime = computed(() => confirmed.value.serverTime);

/** True once the first /api/tracker answer arrived. */
export const trackerLoaded = signal(false);
export const trackerLoading = signal(false);
export const trackerStatus = signal<TrackerStatus>('idle');
/** Last GET problem (HTTP or network); the last good data stays shown. */
export const trackerError = signal<string | null>(null);
/** Bumped every time a server state is applied. */
export const trackerVersion = signal(0);
/** True while ops are queued or in flight. */
export const trackerSaving = computed(() => queue.value.length > 0);

/** The tracker as the pick engine reads it. */
export const pickTracker = computed<PickTracker>(() => ({
  people: people.value,
  days: skiDays.value,
  bookings: bookings.value,
}));

let started = false;
let watchers = 0;
let inflight = false;
let lastAt = 0;
let mutSeq = 0; // bumped per POST, so a GET that overlapped a mutation is dropped

function accept(state: TrackerState): void {
  batch(() => {
    confirmed.value = state;
    trackerLoaded.value = true;
    trackerStatus.value = 'ok';
    trackerError.value = null;
    trackerVersion.value += 1;
  });
}

async function refresh(): Promise<void> {
  if (inflight) return;
  inflight = true;
  lastAt = Date.now();
  const seq = mutSeq;
  trackerLoading.value = true;
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (res.status === 404) {
      void res.body?.cancel();
      trackerStatus.value = 'missing';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const state = parseState(await res.json().catch(() => null));
    if (!state) throw new Error('bad data');
    if (seq === mutSeq && queue.peek().length === 0) accept(state);
  } catch (err) {
    // fetch rejects with a TypeError when the network is down; our own errors carry 'HTTP 500' / 'bad data'
    trackerError.value = err instanceof Error && !(err instanceof TypeError) ? err.message : 'offline';
    if (trackerStatus.peek() !== 'ok') trackerStatus.value = 'error';
  } finally {
    inflight = false;
    trackerLoading.value = false;
  }
}

async function send(op: TrackerOp, attempt: number, saved?: string): Promise<boolean> {
  const prev = prevOf(confirmed.peek(), op);
  const body = { ...op, ...(prev === undefined ? {} : { prevUpdatedAt: prev }), clientId: clientId() };
  mutSeq += 1;
  let res: Response;
  try {
    res = await fetch(API, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'utahsnow' },
      body: JSON.stringify(body),
    });
  } catch {
    notify('bad', 'Offline – change not saved');
    return false;
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const state = stateIn(json, 'state');
    lastAt = Date.now(); // a fresh state: the next poll can wait a full period
    if (state) accept(state);
    else await reload();
    const warnings = warningsOf(json);
    if (warnings.length > 0) notify('warn', warnings.join(' · '));
    else if (saved) notify('ok', saved, auditIdFor(confirmed.peek().audit, op));
    return true;
  }
  if (res.status === 409 && op.op !== 'undo') {
    const current = stateIn(json, 'current');
    if (current) accept(current);
    else await reload();
    const plan = conflictPlan(confirmed.peek(), op);
    if (plan === 'done') return true;
    if (plan === 'retry' && attempt === 0) return send(op, 1, saved);
    notify('warn', 'Changed on another phone – updated');
    return false;
  }
  notify('bad', failureText(res.status, json));
  return false;
}

/** A GET that bypasses the overlap guard (after a 409 without a full `current`, or a 200 without `state`). */
async function reload(): Promise<void> {
  try {
    const res = await fetch(API, { cache: 'no-store' });
    const state = res.ok ? parseState(await res.json()) : null;
    if (state) accept(state);
  } catch {
    // keep what we have; the next poll catches up
  }
}

let draining = false;
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  for (let item = queue.peek()[0]; item; item = queue.peek()[0]) {
    let ok = false;
    try {
      ok = await send(item.op, 0, item.saved);
    } catch {
      notify('bad', 'Not saved – try again');
    }
    const done = item;
    queue.value = queue.peek().filter((i) => i !== done);
    done.settle(ok);
  }
  draining = false;
}

/**
 * Queues one op (shown at once, sent in order). Resolves true when the server accepted it. `saved` is the brief
 * confirmation shown on success ('Ana → Alta, Jan 3 saved'), with an Undo when the op wrote an audit row.
 */
export function mutate(op: TrackerOp, saved?: string): Promise<boolean> {
  return new Promise((settle) => {
    queue.value = [...queue.peek(), { op, saved, settle }];
    void drain();
  });
}

/** Reverts one audit row (the saved notice's Undo and Recent changes). */
export const undoChange = (auditId: number): Promise<boolean> => mutate({ op: 'undo', auditId }, 'Undone');

const visible = (): boolean => document.visibilityState === 'visible';
function period(): number {
  if (trackerStatus.peek() === 'missing') return MISSING_MS;
  return watchers > 0 ? PAGE_MS : BACKGROUND_MS;
}

/** Starts polling once (main.tsx for the pick and briefing; the tracker page also calls it). */
export function startTracker(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  setInterval(() => {
    if (visible() && queue.peek().length === 0 && Date.now() - lastAt >= period()) void refresh();
  }, TICK_MS);
  const soon = () => {
    if (!visible() || trackerStatus.peek() === 'missing') return;
    if (Date.now() - lastAt >= FOCUS_GAP_MS) void refresh();
  };
  document.addEventListener('visibilitychange', soon);
  addEventListener('focus', soon);
  void refresh();
}

/** The tracker page polls every 30 s while mounted. Returns the release. */
export function watchTracker(): () => void {
  startTracker();
  watchers += 1;
  if (Date.now() - lastAt >= PAGE_MS) void refresh();
  return () => {
    watchers = Math.max(0, watchers - 1);
  };
}
