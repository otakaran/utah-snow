// Pick view state derived from data/settings.ts (utahsnow.me, .pickView, .crewToday) and the tracker people.
import { computed } from '@preact/signals';
import { localDate } from '../../../shared/time.ts';
import type { PickScope } from '../../../shared/types.ts';
import { crewIdsFor, me as meSetting, pickView, setCrewToday } from '../../data/settings.ts';
import { serverNow } from '../../data/snapshot.ts';
import { people } from '../../data/tracker.ts';

/** The tracker person "I am" (null when unset, skipped or not in the tracker). */
export const me = computed(() => people.value.find((p) => p.id === meSetting.value) ?? null);

/** The view the card shows: "As me" only when `me` is a tracker person. */
export const effectiveView = computed<PickScope>(() => (me.value ? pickView.value : 'crew'));

const today = computed(() => localDate(serverNow.value));

/** Ids of the people going today: today's chip choice, else everyone in the tracker. */
export const crewIds = computed<string[]>(() => {
  const all = people.value.map((p) => p.id);
  const chosen = crewIdsFor(today.value);
  return chosen ? all.filter((id) => chosen.includes(id)) : all;
});

/** Toggles one person in today's crew (a crew chip); the choice expires at local midnight. */
export function toggleCrew(id: string): void {
  const cur = crewIds.value;
  setCrewToday({ date: today.value, ids: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
}
