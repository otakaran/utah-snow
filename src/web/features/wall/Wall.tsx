// TV wall (spec §8.4, #/wall at 1920x1080, always dark, no app header or footer): 3fr = the 3x3 cam grid with the
// 3-day snow table under it, 1fr = the sidebar. Cells 1–5 page every `rotate` s, the featured YouTube cell every
// `yt` s; Space pauses both.
// Night (outside 06:30–18:30 local): stakes, roads and the forecast only, as stills, under the --wall-dim veil.
import { useEffect, useState } from 'preact/hooks';
import { WALL_DAY } from '../../../../config/wall.ts';
import { isBetweenLocal } from '../../../shared/time.ts';
import { serverNow } from '../../data/snapshot.ts';
import { parseHash, WALL_SETS, type WallParams, wallHref } from '../../router.ts';
import { useKiosk, useWallReliability } from './reliability.ts';
import { stepSet } from './rotation.ts';
import { SnowDays } from './SnowDays.tsx';
import { WallGrid } from './WallGrid.tsx';
import { WallSidebar } from './WallSidebar.tsx';

/** A counter that steps every `seconds` while not paused (one cell group's rotation); a new `reset` restarts it. */
function useTicker(seconds: number, paused: boolean, reset: string): number {
  const [n, setN] = useState(0);
  useEffect(() => setN(0), [reset]);
  // `reset` also restarts the interval, so a new set gets a full period.
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setN((x) => x + 1), seconds * 1000);
    return () => clearInterval(t);
  }, [seconds, paused, reset]);
  return n;
}

export function Wall({ params }: { params: WallParams }) {
  const now = serverNow.value;
  const night = !isBetweenLocal(now, WALL_DAY.from, WALL_DAY.to);
  const [paused, setPaused] = useState(false);
  const page = useTicker(params.rotate, paused, params.set); // a new set starts at its heroes
  const ytPage = useTicker(params.yt, paused, params.set);
  useWallReliability();
  const kiosk = useKiosk({
    page: (dir) => {
      // From the URL, not the render: a second key press can land before the route re-renders.
      const r = parseHash(location.hash, params);
      const cur = r?.name === 'wall' ? r.params : params;
      location.replace(wallHref({ ...cur, set: stepSet(WALL_SETS, cur.set, dir) }));
    },
    togglePause: () => setPaused((p) => !p),
  });

  const cls = ['wall', night && 'wall-night', kiosk.idle && 'wall-idle'].filter(Boolean).join(' ');
  return (
    <div class={cls} data-testid="wall" data-night={night ? 'true' : 'false'} data-set={params.set}>
      <h1 class="sr-only">Utah Snow TV wall</h1>
      <div class="wall-left">
        <WallGrid set={params.set} page={page} ytPage={ytPage} night={night} />
        <SnowDays now={now} />
      </div>
      <WallSidebar now={now} night={night} set={params.set} paused={paused} />
      <button
        type="button"
        class="btn wall-kiosk"
        onClick={kiosk.toggleFullscreen}
        aria-pressed={kiosk.fullscreen}
        title="Full screen (F). ←/→ change the set, Space pauses."
      >
        {kiosk.fullscreen ? 'Exit full screen' : 'Full screen'}
      </button>
    </div>
  );
}
