// #/wall under WALL_MIN_WIDTH (a phone, a tablet, a narrow window): the wall would not fit, so the route shows what
// it is for, the countdown to the trip and the ways out instead. No timers, players, wake lock or kiosk keys.
// main.tsx still sets the wall's dark theme and type scale; wall.css scales the launcher back to phone size.
import { WALL_MIN_WIDTH, WALL_SET_DEFS } from '../../../../config/wall.ts';
import { localDate } from '../../../shared/time.ts';
import type { WallParams } from '../../router.ts';
import { Countdown } from '../../ui/Countdown.tsx';

export function WallLaunch({ params, now }: { params: WallParams; now: number }) {
  return (
    <section class="wall-launch" data-testid="wall-launch" aria-labelledby="wall-launch-title">
      <p class="wall-launch-kicker">TV wall</p>
      <h1 id="wall-launch-title" class="wall-launch-title">
        Made for a TV
      </h1>
      <Countdown today={localDate(now)} />
      <p class="wall-launch-text">
        Stake cams, the crew pick, roads and avalanche on one screen. Open this page on a TV or a laptop on HDMI, at
        least {WALL_MIN_WIDTH} px wide.
      </p>
      <p class="wall-launch-note">
        Set: {WALL_SET_DEFS[params.set].long} · new page every {params.rotate} s. Cast a dedicated browser window to the
        TV, never a tab you will switch away from.
      </p>
      <p class="wall-launch-links">
        <a class="btn btn-primary" href="#/">
          Back to the briefing
        </a>
        <a class="btn" href="#/settings">
          Wall defaults
        </a>
      </p>
    </section>
  );
}
