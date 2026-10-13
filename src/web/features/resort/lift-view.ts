// Pure view helpers for the resort page's lift and gate lists (spec §8.7.4): the status plate under the C.8
// "closed is news only while lifts run" rule, the one state every gate shares, and the list's "as of" age.
import { formatClock, formatLocalDate, isoToMs, localDate } from '../../../shared/time.ts';
import type { Gate, LiftState, LiftStatus } from '../../../shared/types.ts';
import { LIFT_STATUS, type StatusWord } from '../../ui/status.ts';

const QUIET_CLOSED: StatusWord = { tone: 'off', word: 'Closed' };

/** Lift or gate plate: Closed is the red ◆ plate only while lifts run (liftsRunning), else the grey ◌ 'Closed'. */
export function liftWord(state: LiftState, running: boolean): StatusWord {
  if (state === 'closed' && !running) return QUIET_CLOSED;
  return LIFT_STATUS[state] ?? LIFT_STATUS.unknown;
}

/** The state every gate shares, else null (also for an empty list). */
export function sharedState(gates: readonly Gate[]): LiftState | null {
  const first = gates[0]?.state;
  return first && gates.every((g) => g.state === first) ? first : null;
}

/** Newest `updatedAt` of the list (the original string), or null when no lift carries one. */
export function newestUpdate(list: readonly LiftStatus[]): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const l of list) {
    const ms = isoToMs(l.updatedAt);
    if (ms !== null && ms > bestMs) {
      best = l.updatedAt ?? null;
      bestMs = ms;
    }
  }
  return best;
}

/** A lift row's raw label and note belong to today: no `updatedAt`, or one on today's Denver date. */
export const updatedToday = (updatedAt: string | null | undefined, today: string): boolean =>
  !updatedAt || localDate(updatedAt) === today;

/** Heading age: '10:28 AM' for today, else 'Apr 26'; '' when unknown. */
export function asOf(updatedAt: string | null, today: string): string {
  if (!updatedAt) return '';
  return localDate(updatedAt) === today ? formatClock(updatedAt) : formatLocalDate(updatedAt, 'md');
}
