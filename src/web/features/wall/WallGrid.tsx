// The wall's 3x3 cam grid (spec §8.4). Day: row 1 pinned (Alta Collins archive frame, Snowbird and Snowbasin stakes
// live over HLS within the ?hls cap), cells 1–5 show the current page of stills (paged in Wall.tsx), cell 6 is the
// one featured YouTube player (loadVideoById on each turn, Solitude stake first). A cell that rotates carries a thin
// bar filling over its turn. Night: stake stills only, every 120 s.
import { useState } from 'preact/hooks';
import { RESORTS } from '../../../../config/resorts.ts';
import { WALL_NIGHT_STILL, WALL_NIGHT_STILL_S, WALL_PINNED, WALL_YT_FIRST } from '../../../../config/wall.ts';
import type { CamDef, ResortId } from '../../../shared/types.ts';
import { camStates } from '../../data/cams.ts';
import type { WallParams } from '../../router.ts';
import { CamTile, camHidden, liveSource, YouTubePlayer } from '../cams/index.ts';
import { crewPick } from '../pick-card/index.ts';
import { nightStakes, ytOrder } from './rotation.ts';

interface Props {
  params: WallParams;
  night: boolean;
  paused: boolean;
  /** Cells 1–5: this page's stills, and whether there is more than one page. */
  stills: CamDef[];
  paging: boolean;
  /** Rotation steps so far for cells 1–5 and for the featured cell. */
  page: number;
  ytPage: number;
}

const [ALTA, ...LIVE_STAKES] = WALL_PINNED;
const FEATURE_STILL = WALL_NIGHT_STILL[WALL_YT_FIRST] ?? WALL_YT_FIRST;

/** Fills along the cell's bottom edge over one `s`-second turn, CSS only; the caller keys it per turn to restart it. */
function Turn({ s }: { s: number }) {
  return <i class="wall-turn" style={{ '--turn': `${s}s` }} data-testid="wall-turn" aria-hidden="true" />;
}

/** The featured cell: a YouTube player reused across cams, or the cam's still when it cannot play. */
function Featured({ cam, turn, pick }: { cam: CamDef | null; turn: number; pick: ResortId | null }) {
  const [failed, setFailed] = useState<string | null>(null); // `${cam}@${turn}` errored: its still until the turn ends
  const live = cam ? liveSource(cam, camStates.value.get(cam.id)) : null;
  const down = cam !== null && failed === `${cam.id}@${turn}`;
  if (!cam || live?.type !== 'youtube' || down) {
    return (
      <CamTile id={cam?.id ?? FEATURE_STILL} variant="wall" pick={pick} note={down ? 'Stream restarting' : undefined} />
    );
  }
  const resort = cam.resort ? RESORTS[cam.resort].name : null;
  const title = resort ? `${resort} – ${cam.name}` : cam.name;
  return (
    <figure class="wall-yt" data-cam={cam.id} data-testid="wall-yt">
      <YouTubePlayer
        camId={cam.id}
        videoId={live.videoId}
        title={title}
        rewind={false}
        onEnd={() => setFailed(`${cam.id}@${turn}`)}
      />
      <figcaption class="wall-yt-cap">
        {pick !== null && cam.resort === pick ? (
          <span class="wall-star">
            <span aria-hidden="true">★ </span>
            <span class="sr-only">Today's pick: </span>
          </span>
        ) : null}
        {title}
      </figcaption>
    </figure>
  );
}

export function WallGrid({ params, night, paused, stills, paging, page, ytPage }: Props) {
  const states = camStates.value;
  const pick = crewPick.value?.pick ?? null;
  const shown = (d: CamDef) => !camHidden(d, states.get(d.id));

  if (night) {
    return (
      <ul class="wall-grid" data-testid="wall-grid">
        {nightStakes()
          .filter(shown)
          .map((d) => (
            <li key={d.id} class="wall-cell" data-testid="wall-tile" data-slot="stake">
              <CamTile cam={d} variant="wall" pick={pick} archive={d.id === ALTA} everyS={WALL_NIGHT_STILL_S} />
            </li>
          ))}
      </ul>
    );
  }

  const yts = ytOrder(params.set).filter((d) => shown(d) && liveSource(d, states.get(d.id))?.type === 'youtube');
  const yt = yts.length > 0 ? (yts[ytPage % yts.length] ?? null) : null;
  // A turn key changes whenever the matching ticker restarts its period (Wall.tsx useTicker): step, set, seconds.
  const stillTurn = !paused && paging ? `${params.set}:${params.rotate}:${page}` : null;
  const ytTurn = !paused && yts.length > 1 ? `${params.set}:${params.yt}:${ytPage}` : null;
  return (
    <ul class="wall-grid" data-testid="wall-grid">
      <li key={ALTA} class="wall-cell" data-testid="wall-tile" data-slot="pinned">
        <CamTile id={ALTA} variant="wall" pick={pick} archive />
      </li>
      {LIVE_STAKES.map((id) => (
        <li key={id} class="wall-cell" data-testid="wall-tile" data-slot="pinned">
          <CamTile id={id} variant="wall" pick={pick} autoLive />
        </li>
      ))}
      {stills.map((d) => (
        <li key={d.id} class="wall-cell" data-testid="wall-tile" data-slot="rotating">
          <CamTile cam={d} variant="wall" pick={pick} />
          {stillTurn ? <Turn key={stillTurn} s={params.rotate} /> : null}
        </li>
      ))}
      <li key="featured" class="wall-cell" data-testid="wall-tile" data-slot="featured">
        <Featured cam={yt} turn={ytPage} pick={pick} />
        {ytTurn ? <Turn key={ytTurn} s={params.yt} /> : null}
      </li>
    </ul>
  );
}
