// One cam tile (spec §8.3): the still (refreshed by lib/visibility.ts, preloaded, backoff on error), a caption with
// name, age and ★ for the pick resort, and a status plate. A tap goes live (HLS, YouTube or the Roundshot 360
// iframe) in the tile, or in a Lightbox when the tile is under 200x200; still-only cams open the detail still.
// Nothing plays by itself except `autoLive` (the wall), within playerManager caps and never in data saver.
// A [Timelapse] caption action (not on the wall) opens the Scrubber in the same Lightbox while /api/cams reports
// the cam's timelapse available; the server resolves `-still` twins itself, so the list is asked for by this cam's id.
// Pieces live in cam-tile/ (props and modes, the still button).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CamDef } from '../../../shared/types.ts';
import { type CamApiState, camStates, ensureCams } from '../../data/cams.ts';
import { serverNow } from '../../data/snapshot.ts';
import { dataSaverOn } from '../../lib/data-saver.ts';
import { hasRoom } from '../../lib/player-manager.ts';
import { Lightbox } from '../../ui/Lightbox.tsx';
import { type CamTileProps, MIN_PLAYER_PX, type Mode, STILL } from './cam-tile/props.ts';
import { StillButton } from './cam-tile/StillButton.tsx';
import {
  ageLabel,
  CAM_BY_ID,
  type LiveSource,
  liveSource,
  resortName,
  shownCam,
  stillUrl,
  type TileStatus,
  tileStatus,
  type Variant,
} from './cam-view.ts';
import { KINDS } from './kinds/index.ts';
import { NOTE } from './notes.ts';
import { Scrubber } from './Scrubber.tsx';
import { Caption, LivePlayer, StatusPlate, Zoom } from './TileParts.tsx';
import { useStill } from './use-still.ts';

export type { CamTileProps } from './cam-tile/props.ts';

export function CamTile(props: CamTileProps) {
  const def = props.cam ?? (props.id ? CAM_BY_ID.get(props.id) : undefined);
  return def ? <Tile key={def.id} {...props} def={def} /> : null;
}

/** The "▶" hint on a still a tap plays: a call to action, never a status word (that is the plate's job). */
function liveHint(live: LiveSource | null, own: CamApiState | undefined, status: TileStatus | null): string | null {
  if (!live) return null;
  if (live.type === 'iframe') return '360° view';
  if (own?.status === 'unknown' && live.type === 'youtube') return NOTE.ytUnknown;
  return status === 'live' ? 'Play' : 'Watch live'; // the plate already says LIVE
}

function Tile(p: CamTileProps & { def: CamDef }) {
  const { def } = p;
  useEffect(ensureCams, []);
  const now = serverNow.value;
  const states = camStates.value;
  const saver = dataSaverOn.value;
  const wall = p.variant === 'wall';
  const variant: Variant = saver && p.variant === 'detail' ? 'card' : (p.variant ?? 'card');
  const shown = shownCam(def, states, now);
  const state = states.get(shown.id);
  const ownState = states.get(def.id);
  const live = liveSource(def, ownState);
  const kind = KINDS[shown.kind];
  const root = useRef<HTMLElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(STILL);
  const [blocked, setBlocked] = useState(false); // this browser cannot play the stream
  const deferred = saver && Boolean(kind.heavy?.(stillUrl(shown, state, variant, now) ?? ''));
  const still = useStill({
    def: shown,
    state,
    variant,
    el: root,
    auto: Boolean(p.keepFresh) || !saver,
    everyS: p.everyS ?? def.refreshS,
    always: wall,
    frame: p.archive ? (state?.latestFrame ?? null) : null,
    deferred,
  });
  const playable = live !== null && !blocked;

  // Wall autoplay: only HLS/YouTube, only with a free player slot, and back to the still when autoLive turns off.
  // Any player also ends when /api/cams reports the stream gone.
  const canAuto =
    Boolean(p.autoLive) && playable && live?.type !== 'iframe' && !saver && KINDS[def.kind].autoplay?.(def) !== false;
  useEffect(() => {
    if (mode.m === 'live' && (!live || (mode.auto && !canAuto))) setMode(STILL);
    else if (
      canAuto &&
      live &&
      mode.m === 'still' &&
      mode.note === null &&
      hasRoom(live.type === 'hls' ? 'hls' : 'youtube')
    )
      setMode({ m: 'live', inBox: false, auto: true });
  }, [canAuto, mode, live]);

  const onEnd = (note: string | null) => {
    if (note === NOTE.unsupported) setBlocked(true);
    setMode({ m: 'still', note });
  };

  const tap = () => {
    if (deferred && !still.src) {
      still.refresh(); // data saver: the first tap loads the heavy GIF
    } else if (playable) {
      const r = media.current?.getBoundingClientRect();
      const small = !r || r.width < MIN_PLAYER_PX || r.height < MIN_PLAYER_PX;
      setMode({ m: 'live', inBox: small && !wall, auto: false });
    } else {
      still.refresh(); // tap-to-refresh in data saver
      setMode({ m: 'zoom', src: stillUrl(shown, state, saver ? 'card' : 'detail', Date.now()) });
    }
  };

  const resort = resortName(def);
  const name = p.label ?? shown.name;
  const title = resort ? `${resort} – ${name}` : name;
  const star = p.star ?? (p.pick != null && def.resort === p.pick);
  const age = ageLabel(shown, state, still.src, still.loadedAt, now);
  const inTile = mode.m === 'live' && !mode.inBox;
  const ytInTile = inTile && live?.type === 'youtube'; // no overlays on a YouTube player (§8.3)
  const status = mode.m === 'live' ? 'live' : tileStatus(state, still.failed);
  const note = mode.m === 'still' ? mode.note : null;
  const timelapse = !wall && ownState?.timelapse.available === true;
  const capBelow = ytInTile || (p.caption ?? (wall ? 'overlay' : 'below')) === 'below';
  const player = () =>
    live ? (
      <LivePlayer
        source={live}
        camId={def.id}
        title={title}
        poster={still.src}
        unlimited={wall}
        rewind={Boolean(p.rewind && def.live?.dvr)}
        onEnd={onEnd}
      />
    ) : null;
  const caption = (
    <Caption
      star={star}
      resort={p.showResort === false ? null : resort}
      name={name}
      age={age}
      note={note}
      extra={p.note}
      onStop={inTile && !wall ? () => setMode(STILL) : null}
      onTimelapse={timelapse ? () => setMode({ m: 'scrub' }) : null}
    />
  );

  const cls = [
    'cam-tile',
    `cam-${variant}`,
    wall && 'cam-wall',
    star && 'cam-pick',
    status === 'stale' && 'cam-is-stale',
  ]
    .filter(Boolean)
    .join(' ');
  const boxed = (mode.m === 'live' && mode.inBox) || mode.m === 'zoom' || mode.m === 'scrub';
  return (
    <figure
      ref={root}
      class={cls}
      data-testid="cam-tile"
      data-cam={def.id}
      data-kind={def.kind}
      data-status={status ?? 'ok'}
    >
      <div class="cam-media" ref={media}>
        {inTile ? (
          player()
        ) : (
          <StillButton
            title={title}
            age={age}
            still={still}
            playable={playable}
            deferred={deferred}
            eager={wall}
            hint={playable ? liveHint(live, ownState, status) : null}
            onTap={tap}
          />
        )}
        {ytInTile ? null : <StatusPlate status={status} />}
        {ytInTile ? null : p.overlay}
        {capBelow ? null : caption}
      </div>
      {capBelow ? caption : null}
      {boxed ? (
        <Lightbox
          open
          onClose={() => setMode(STILL)}
          label={mode.m === 'scrub' ? `${title} timelapse` : `${title} webcam`}
          testid="cam-lightbox"
        >
          {mode.m === 'live' ? (
            <div class="cam-box">{player()}</div>
          ) : mode.m === 'scrub' ? (
            <Scrubber camId={def.id} title={title} />
          ) : (
            <Zoom def={shown} src={mode.m === 'zoom' ? mode.src : null} title={title} />
          )}
        </Lightbox>
      ) : null}
    </figure>
  );
}
