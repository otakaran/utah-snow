// When the header's "I am" chip shows (IAmChip.tsx). Pure, so iam-state.test.ts runs it in node.
import type { Person } from '../../data/tracker.ts';

/** True when `me` should be asked: unset, or set to someone not in `list` ('' = skipped, never asked). */
export function needsMe(list: readonly Pick<Person, 'id'>[], id: string | null): boolean {
  if (list.length === 0 || id === '') return false;
  return id === null || !list.some((p) => p.id === id);
}

export type IamState = 'wait' | 'ask' | 'hide';

/**
 * 'wait' while `me` is unset and the tracker has not answered yet: the chip holds its header slot from the first
 * paint (select disabled) instead of pushing the page down when the crew arrives. Then 'ask' or 'hide'.
 */
export function iamState(list: readonly Pick<Person, 'id'>[], id: string | null, loaded: boolean): IamState {
  if (!loaded) return id === null ? 'wait' : 'hide';
  return needsMe(list, id) ? 'ask' : 'hide';
}
