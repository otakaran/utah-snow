// Snow stakes (spec §8.2 `stakes`): STAKE_ORDER tiles in a horizontal scroll-snap strip on phones (the only element
// allowed to scroll sideways). DV's live stake falls back to its still; Brighton's Ski Utah stake is omitted until
// /api/cams calls it fresh. Live is offered only where the cam streams (not Alta, DV-still or Brighton). Stake tiles
// keep refreshing in data saver. Phase 2 seam: [Timelapse] per tile when def.timelapse.provider !== 'none'.
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { STAKE_ORDER } from '../../../../config/cams/index.ts';
import { isBetweenLocal } from '../../../shared/time.ts';
import type { CamDef, ResortId } from '../../../shared/types.ts';
import { camStates, ensureCams } from '../../data/cams.ts';
import { serverNow } from '../../data/snapshot.ts';
import { Section } from '../../ui/Section.tsx';
import { CamTile } from './CamTile.tsx';
import { CAM_BY_ID, camHidden } from './cam-view.ts';

interface Props {
  /** The pick resort: its stake gets the ★ and the accent outline. */
  pick?: ResortId | null;
  /** Section index number in the heading, e.g. '02'. */
  no?: string;
  /** Drawn over each stake still, e.g. an overnight-inches plate. */
  overlay?: (cam: CamDef) => ComponentChildren;
}

/** Alta clears the Collins board at 04:00 and 16:00 local. */
const altaBoard = (now: number): string =>
  isBetweenLocal(now, '04:00', '16:00') ? 'since 04:00 board clear' : 'since 16:00 board clear';

export function StakeRow({ pick = null, no, overlay }: Props) {
  useEffect(ensureCams, []);
  const states = camStates.value;
  const now = serverNow.value;
  const cams = STAKE_ORDER.flatMap((id) => CAM_BY_ID.get(id) ?? []).filter(
    (def) => !camHidden(def, states.get(def.id)),
  );
  return (
    <Section testid="stakes" title="Snow stakes" index={no} sub={`${cams.length} stakes`} class="cam-stakes">
      <ul class="cam-strip">
        {cams.map((def) => (
          <li key={def.id} class="cam-strip-item">
            <CamTile
              cam={def}
              variant="card"
              pick={pick}
              keepFresh
              note={def.id === 'alta-collins-stake' ? altaBoard(now) : undefined}
              overlay={overlay?.(def)}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
