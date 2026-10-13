// Pick signals (spec §8.2, §10): the crew pick, the "as me" pick and the 15:00 tomorrow outlook, recomputed once a
// minute or when the snapshot, tracker, settings or crew choice change. The wall reads `crewPick` only.
import { computed } from '@preact/signals';
import type { PickArgs, PickResult, PickScope } from '../../../shared/types.ts';
import { baseInfo, skiFraction, units } from '../../data/settings.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { pickTracker } from '../../data/tracker.ts';
import { driveMatrix, liveDelays } from './drive.ts';
import { type PickTarget, runPick } from './pick-adapter.ts';
import { crewIds, effectiveView, me } from './prefs.ts';

const minute = computed(() => Math.floor(serverNow.value / 60_000) * 60_000);

/** Free-flow minutes and live delays for the active base. */
export const drive = computed(() => {
  const b = baseInfo.value;
  const m = driveMatrix(b);
  return { ...m, live: liveDelays(snapshot.value, b, minute.value) };
});

function run(scope: PickScope, memberIds: readonly string[], target: PickTarget): PickResult | null {
  const snap = snapshot.value;
  if (!snap) return null;
  const b = baseInfo.value;
  const args: PickArgs = {
    snap,
    tracker: pickTracker.value,
    nowMs: minute.value,
    scope,
    memberIds,
    base: b.id === 'custom' ? { lat: b.lat, lon: b.lon } : b.id,
    drive: drive.value.min,
    liveDelayMin: drive.value.live,
    skiFraction: skiFraction.value,
    units: units.value,
  };
  return runPick(args, target);
}

/** The crew pick: everyone going today (the wall and the "Today's pick" outlines use this). */
export const crewPick = computed<PickResult | null>(() => run('crew', crewIds.value, 'today'));

/** The "as me" pick, or null when `me` is not a tracker person. */
export const mePick = computed<PickResult | null>(() => {
  const m = me.value;
  return m ? run('me', [m.id], 'today') : null;
});

/** What the card shows for the current [Crew | As me] choice. */
export const shownPick = computed<PickResult | null>(() =>
  effectiveView.value === 'me' && mePick.value ? mePick.value : crewPick.value,
);

/** From 15:00 on the eve of a trip day: the forecast-based outlook for tomorrow in the shown scope, else null. */
export const tomorrowPick = computed<PickResult | null>(() => {
  const m = me.value;
  return effectiveView.value === 'me' && m ? run('me', [m.id], 'tomorrow') : run('crew', crewIds.value, 'tomorrow');
});
