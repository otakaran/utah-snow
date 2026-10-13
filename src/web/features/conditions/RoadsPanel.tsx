// RoadsPanel (spec §8.2 `roads`): the four corridors in the order lcc, bcc, parleys, snowbasin. Shared by the
// briefing (all four), a resort page (its corridors) and the wall (variant 'wall': code + chip + ETO rows).
import type { ComponentChildren } from 'preact';
import type { Corridor } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { Section } from '../../ui/Section.tsx';
import { worstMeta } from './panel-meta.ts';
import { RoadRow, RoadWallRow } from './RoadRow.tsx';
import { CORRIDOR_ORDER } from './road-view.ts';
import { SourceLine } from './SourceLine.tsx';

export interface RoadsPanelProps {
  /** Display units (settings); stored values are imperial. Default 'imperial'. */
  units?: Units;
  /** Corridors to show, in this order. Default: all four. */
  corridors?: readonly Corridor[];
  variant?: 'full' | 'wall';
  /** Channel number in the heading ('04' on the briefing). */
  no?: string;
  /** Section data-testid (also its heading id). Default 'roads'. */
  testId?: string;
  /** Expanded row content per corridor (the cams feature's ★ road cams). Rows do not expand without it. */
  cams?: (c: Corridor) => ComponentChildren;
}

export function RoadsPanel({
  units = 'imperial',
  corridors = CORRIDOR_ORDER,
  variant = 'full',
  no,
  testId = 'roads',
  cams,
}: RoadsPanelProps) {
  const snap = snapshot.value;
  const now = serverNow.value;
  const blocks = corridors.map((c) => snap?.roads[c]);
  const fresh = worstMeta(
    blocks.map((b) => b?.meta),
    now,
  );
  const wall = variant === 'wall';
  return (
    <Section
      testid={testId}
      title={wall ? 'Roads' : 'Canyon roads'}
      index={no}
      class={wall ? 'cond-wall' : 'cond-roads'}
      sub={<SourceLine source="UDOT" fresh={fresh} />}
    >
      {snap ? (
        <ul class={wall ? 'cond-wall-list' : 'cond-list'}>
          {corridors.map((c, i) =>
            wall ? (
              <RoadWallRow key={c} corridor={c} block={blocks[i]} now={now} />
            ) : (
              <RoadRow key={c} corridor={c} block={blocks[i]} now={now} units={units} cams={cams} />
            ),
          )}
        </ul>
      ) : (
        <p class="cond-empty">Loading road status…</p>
      )}
    </Section>
  );
}
