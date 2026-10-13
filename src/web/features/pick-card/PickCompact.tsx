// Compact pick for the TV wall (spec §8.2 "compact wall variant", §8.7): always the crew pick, no toggles or
// details. Name outranks the number; OVERNIGHT sits under it; the ridge keeps every number on one baseline.
import type { PickResult } from '../../../shared/types.ts';
import { units } from '../../data/settings.ts';
import { snapshot } from '../../data/snapshot.ts';
import { previewLabel } from './labels.ts';
import { PickHero } from './PickCard.tsx';
import { Ridge } from './Ridge.tsx';
import { overnightAll } from './snow-values.ts';
import { crewPick } from './use-pick.ts';
import './pick-card.css';

export interface PickCompactProps {
  /** Defaults to the crew pick. */
  result?: PickResult | null;
  /** Draw the six-peak ridge under the pick (default true). */
  ridge?: boolean;
}

export function PickCompact({ result, ridge = true }: PickCompactProps) {
  const r = result === undefined ? crewPick.value : result;
  const u = units.value;
  const live = r !== null && r.mode !== 'post';
  const why = live ? r.ranked.find((x) => x.resort === r.pick)?.reasons[0] : undefined;
  return (
    <section class="pick pick--compact" aria-live="polite" aria-labelledby="pick-title" data-testid="pick-compact">
      <div class="pick-band">
        <p class="pick-mode">{r?.mode === 'preview' ? previewLabel() : "Today's pick"}</p>
      </div>
      <div class="pick-body">
        {live ? (
          <PickHero r={r} units={u} />
        ) : (
          <h2 id="pick-title" class="pick-name">
            {r ? 'Trip over' : 'Waiting for data…'}
          </h2>
        )}
        {why ? <p class="pick-compact-why">{why}</p> : null}
        {ridge ? (
          <Ridge values={overnightAll(snapshot.value, r)} pick={live ? r.pick : null} units={u} baseline />
        ) : null}
      </div>
    </section>
  );
}
