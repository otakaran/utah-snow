// The wall sidebar (spec §8.4): clock and date (and before the trip the countdown), the crew pick with its top 2
// reasons, road chips, avalanche badges and the freshness footer (the set, its "set 2/6 · page 3/5" counter, or
// "set 2/6 · weather" during the weather page, and a Paused marker); the 7-day week strip runs under the cam grid
// (WeekStrip). It stays beside the weather page too. Night: clock, roads and footer only.
// Sizes: countdown < clock (--fs-clock) <= pick name (--fs-pick-name); everything inside --wall-safe (wall.css).
import { WALL_SET_DEFS, WALL_SETS, type WallSet } from '../../../../config/wall.ts';
import { isoToMs, localDate } from '../../../shared/time.ts';
import { globalBadge } from '../../data/health.ts';
import { units } from '../../data/settings.ts';
import { offline, snapshot } from '../../data/snapshot.ts';
import { clock, shortDate } from '../../lib/format.ts';
import { Countdown } from '../../ui/Countdown.tsx';
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import { AvalanchePanel, RoadsPanel } from '../conditions/index.ts';
import { crewPick, PickCompact } from '../pick-card/index.ts';

interface Props {
  now: number;
  night: boolean;
  set: WallSet;
  paused: boolean;
  /** Cells 1–5: [this page, pages], 'weather' during the weather page, or null when they do not page (one page, night). */
  page: readonly [number, number] | 'weather' | null;
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

function Footer({ now, set, paused, page }: Omit<Props, 'night'>) {
  const snap = snapshot.value;
  const at = isoToMs(snap?.generatedAt);
  return (
    <footer class="wall-foot" data-testid="wall-fresh">
      <span class="wall-fresh">
        Data <FreshnessBadge badge={globalBadge.value ?? 'grey'} age={at === null ? null : (now - at) / 60_000} />
        {offline.value ? <b class="wall-offline">Offline</b> : null}
      </span>
      <span class="wall-set">{WALL_SET_DEFS[set].short}</span>
      <span class="wall-count" data-testid="wall-count">
        set {WALL_SETS.indexOf(set) + 1}/{WALL_SETS.length}
        {page === 'weather' ? ' · weather' : page ? ` · page ${page[0]}/${page[1]}` : null}
        {paused ? <b class="wall-paused"> · Paused</b> : null}
      </span>
    </footer>
  );
}

export function WallSidebar({ now, night, set, paused, page }: Props) {
  return (
    <aside class="wall-side" aria-label="Pick and conditions">
      <p class="wall-clock" data-testid="wall-clock">
        <span class="wall-time num">{clock(now)}</span>
        <span class="wall-date">{shortDate(now)}</span>
      </p>
      {night ? null : <Countdown today={localDate(now)} />}
      {night ? null : <WallPick />}
      <RoadsPanel variant="wall" units={units.value} testId="wall-roads" />
      {night ? null : <AvalanchePanel variant="wall" testId="wall-avalanche" />}
      <Footer now={now} set={set} paused={paused} page={page} />
    </aside>
  );
}
