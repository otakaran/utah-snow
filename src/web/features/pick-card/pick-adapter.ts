// The only file that calls the pick engine (spec §10, src/shared/pick/). A throw inside the engine (an unexpected
// payload shape) must never take the briefing down, so it degrades to "no pick" for that minute.
import { pick, pickTomorrow } from '../../../shared/pick/index.ts';
import type { PickArgs, PickResult } from '../../../shared/types.ts';

export type PickTarget = 'today' | 'tomorrow';

/** The main pick ('today': today, the trip-start preview, or post) or the 15:00 tomorrow outlook (else null). */
export function runPick(args: PickArgs, target: PickTarget): PickResult | null {
  try {
    return target === 'today' ? pick(args) : pickTomorrow(args);
  } catch {
    return null;
  }
}
