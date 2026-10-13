// The wall sidebar (spec §8.4): clock and date, the crew pick with its top 2 reasons, road chips, avalanche badges
// and the freshness footer (with the set and a Paused marker); the 3-day snow mini-table runs under the cam grid
// (SnowDays). Night: clock, roads and footer only. The clock (--fs-clock) never outsizes the pick name
// (--fs-pick-name); everything sits inside --wall-safe (wall.css).
import { WALL_SET_DEFS, type WallSet } from '../../../../config/wall.ts';
import { isoToMs } from '../../../shared/time.ts';
import { globalBadge } from '../../data/health.ts';
import { units } from '../../data/settings.ts';
import { offline, snapshot } from '../../data/snapshot.ts';
import { clock, shortDate } from '../../lib/format.ts';
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import { AvalanchePanel, RoadsPanel } from '../conditions/index.ts';
import { crewPick, PickCompact } from '../pick-card/index.ts';

interface Props {
  now: number;
  night: boolean;
  set: WallSet;
  paused: boolean;
}

/** PickCompact (crew, no ridge) plus the pick's top 2 reasons, which replace the card's single line (wall.css). */
function WallPick() {
  const r = crewPick.value;
  const top = r && r.mode !== 'post' ? r.ranked.find((x) => x.resort === r.pick) : undefined;
  const reasons = top?.reasons.slice(0, 2) ?? [];
  return (
    <div class="wall-pick">
      <PickCompact ridge={false} />
      {reasons.length > 0 ? (
        <ul class="wall-why" data-testid="wall-why">
          {reasons.map((why) => (
            <li key={why}>{why}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Footer({ now, set, paused }: Omit<Props, 'night'>) {
  const snap = snapshot.value;
  const at = isoToMs(snap?.generatedAt);
  return (
    <footer class="wall-foot" data-testid="wall-fresh">
      <span class="wall-fresh">
        Data <FreshnessBadge badge={globalBadge.value ?? 'grey'} age={at === null ? null : (now - at) / 60_000} />
        {offline.value ? <b class="wall-offline">Offline</b> : null}
      </span>
      <span class="wall-set">
        {WALL_SET_DEFS[set].short}
        {paused ? <b class="wall-paused"> · Paused</b> : null}
      </span>
    </footer>
  );
}

export function WallSidebar({ now, night, set, paused }: Props) {
  return (
    <aside class="wall-side" aria-label="Pick and conditions">
      <p class="wall-clock" data-testid="wall-clock">
        <span class="wall-time num">{clock(now)}</span>
        <span class="wall-date">{shortDate(now)}</span>
      </p>
      {night ? null : <WallPick />}
      <RoadsPanel variant="wall" units={units.value} testId="wall-roads" />
      {night ? null : <AvalanchePanel variant="wall" testId="wall-avalanche" />}
      <Footer now={now} set={set} paused={paused} />
    </aside>
  );
}
