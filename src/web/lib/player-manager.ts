// Player manager (spec §8.3): caps concurrent live players and stops idle ones.
// - HLS: 1 on phones (max-width 600px), 2 on desktop, ?hls on the wall (at most WALL_LIMITS.hls, 3).
// - YouTube: at most one per page; starting a new one stops the previous one.
// - A claim over the cap stops the oldest player of that kind (the newest tap wins).
// - Outside the wall, every player stops after 10 min without user interaction ("Paused to save data").
// Pausing on hidden/offscreen is each player's own job (lib/visibility.ts), since it resumes in place.
import { WALL_LIMITS } from '../../../config/wall.ts';
import { route } from '../router.ts';

export type PlayerKind = 'hls' | 'youtube';
export type StopReason = 'evicted' | 'idle';

export interface Lease {
  release(): void;
}

interface Entry {
  kind: PlayerKind;
  stop: (reason: StopReason) => void;
}

const IDLE_MS = 10 * 60_000;
const IDLE_CHECK_MS = 30_000;
const WALL_HLS_MAX = WALL_LIMITS.hls[1];
const PHONE_QUERY = '(max-width: 600px)';

const active: Entry[] = []; // oldest first
let lastInteraction = Date.now();
let idleTimer: ReturnType<typeof setInterval> | null = null;
let listening = false;

const onWall = (): boolean => route.peek().name === 'wall';

/** A phone-width viewport (max-width 600px): the HLS cap here and the scrubber's 15-min step. */
export const isPhone = (): boolean => typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches;

/** Concurrent HLS players allowed on this page right now. */
export function hlsCap(): number {
  const r = route.peek();
  if (r.name === 'wall') return Math.max(0, Math.min(r.params.hls, WALL_HLS_MAX));
  return isPhone() ? 1 : 2;
}

const capOf = (kind: PlayerKind): number => (kind === 'youtube' ? 1 : hlsCap());

function noteInteraction(): void {
  lastInteraction = Date.now();
}

function listen(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
    document.addEventListener(type, noteInteraction, { passive: true, capture: true });
  }
}

function checkIdle(): void {
  if (onWall() || Date.now() - lastInteraction < IDLE_MS) return;
  for (const e of [...active]) {
    remove(e);
    e.stop('idle');
  }
}

function remove(e: Entry): void {
  const i = active.indexOf(e);
  if (i !== -1) active.splice(i, 1);
  if (active.length === 0 && idleTimer !== null) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}

/**
 * Registers a starting player. Older players of the same kind beyond the cap get `stop('evicted')`.
 * Returns null when the cap is 0 (for example `?hls=0` on the wall); the caller then stays on the still.
 */
export function claimPlayer(kind: PlayerKind, stop: (reason: StopReason) => void): Lease | null {
  const cap = capOf(kind);
  if (cap <= 0) return null;
  listen();
  noteInteraction(); // starting a player counts as interaction
  const same = active.filter((e) => e.kind === kind);
  for (const old of same.slice(0, Math.max(0, same.length - cap + 1))) {
    remove(old);
    old.stop('evicted');
  }
  const entry: Entry = { kind, stop };
  active.push(entry);
  idleTimer ??= setInterval(checkIdle, IDLE_CHECK_MS);
  return { release: () => remove(entry) };
}

/** True when a new player of `kind` would not evict anyone (the wall uses it before autoplaying). */
export const hasRoom = (kind: PlayerKind): boolean => active.filter((e) => e.kind === kind).length < capOf(kind);
