// One cam tile (spec §8.3): the still (refreshed by lib/visibility.ts, preloaded, backoff on error), a caption with
// name, age and ★ for the pick resort, and a status plate. A tap goes live (HLS, YouTube or the Roundshot 360
// iframe) in the tile, or in a Lightbox when the tile is under 200x200; still-only cams open the detail still.
// Nothing plays by itself except `autoLive` (the wall), within playerManager caps and never in data saver.
// Phase 2 seam: a [Timelapse] action goes in the caption when def.timelapse.provider !== 'none'; it opens the
// Scrubber for /api/stake/{def.timelapse.source ?? def.id}/frames in the same Lightbox.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CamDef, ResortId } from '../../../shared/types.ts';
import { camStates, ensureCams } from '../../data/cams.ts';
import { serverNow } from '../../data/snapshot.ts';
import { dataSaverOn } from '../../lib/data-saver.ts';
import { hasRoom } from '../../lib/player-manager.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Lightbox } from '../../ui/Lightbox.tsx';
import {
  ageLabel,
  CAM_BY_ID,
  liveSource,
  resortName,
  shownCam,
  stillUrl,
  tileStatus,
  type Variant,
} from './cam-view.ts';
import { KINDS } from './kinds/index.ts';
import { NOTE } from './notes.ts';
import { Caption, LivePlayer, StatusPlate, Zoom } from './TileParts.tsx';
import { useStill } from './use-still.ts';

export interface CamTileProps {
  /** A cam id from config/cams (unknown ids render nothing), or pass `cam`. */
  id?: string;
  cam?: CamDef;
  /** Which still template: 'card' (default, smallest), 'detail' or 'wall' (skips the on-screen checks). */
  variant?: Variant;
  /** ★ in the caption; defaults to `cam.resort === pick`. */
  star?: boolean;
  pick?: ResortId | null;
  /** Start live by itself (wall stake tiles by day), only within the HLS/YouTube caps and never in data saver. */
  autoLive?: boolean;
  /** Keep refreshing in data saver (the stake row). */
  keepFresh?: boolean;
  /** Seconds between still refreshes instead of the cam's refreshS (the wall's night stills: 120). */
  everyS?: number;
  /** Show the newest archived frame when /api/cams has one (wall Alta Collins). */
  archive?: boolean;
  /** YouTube DVR Rewind buttons (resort detail page only). */
  rewind?: boolean;
  /** Caption under the image (default) or on a plate over it (default on the wall). */
  caption?: 'below' | 'overlay';
  /** Caption name instead of the cam's own. */
  label?: string;
  /** An extra caption line, e.g. Alta's "since 04:00 board clear". */
  note?: ComponentChildren;
  /** Drawn over the still, e.g. an inch plate. */
  overlay?: ComponentChildren;
}

type Mode =
  | { m: 'still'; note: string | null }
  | { m: 'live'; inBox: boolean; auto: boolean }
  | { m: 'zoom'; src: string | null };

const MIN_PLAYER_PX = 200;
const STILL: Mode = { m: 'still', note: null };

export function CamTile(props: CamTileProps) {
  const def = props.cam ?? (props.id ? CAM_BY_ID.get(props.id) : undefined);
  return def ? <Tile key={def.id} {...props} def={def} /> : null;
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
  const hint = !playable
    ? null
    : ownState?.status === 'unknown' && live?.type === 'youtube'
      ? NOTE.ytUnknown
      : ownState?.thumbKind === 'custom'
        ? 'Live · tap'
        : status === 'live'
          ? 'Play' // the plate already says LIVE
          : 'Live';
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
      resort={resort}
      name={name}
      age={age}
      note={note}
      extra={p.note}
      onStop={inTile && !wall ? () => setMode(STILL) : null}
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
  return (
    <figure ref={root} class={cls} data-testid="cam-tile" data-cam={def.id} data-status={status ?? 'ok'}>
      <div class="cam-media" ref={media}>
        {inTile ? (
          player()
        ) : (
          <button
            type="button"
            class="cam-hit"
            onClick={tap}
            aria-label={playable ? `Play ${title} live` : `Enlarge ${title}`}
          >
            {still.src && !still.broken ? (
              <img
                class="cam-img"
                src={still.src}
                alt={`${title} webcam, ${age}`}
                decoding="async"
                loading={wall ? 'eager' : 'lazy'}
                referrerpolicy="no-referrer"
                onLoad={still.onLoad}
                onError={still.onError}
              />
            ) : (
              <span class="cam-empty">
                {deferred && !still.src ? NOTE.tapToLoad : still.broken ? 'No picture' : ''}
              </span>
            )}
            {hint ? (
              <span class="cam-play">
                <Icon name="play" size={14} />
                {hint}
              </span>
            ) : null}
          </button>
        )}
        {ytInTile ? null : <StatusPlate status={status} />}
        {ytInTile ? null : p.overlay}
        {capBelow ? null : caption}
      </div>
      {capBelow ? caption : null}
      {(mode.m === 'live' && mode.inBox) || mode.m === 'zoom' ? (
        <Lightbox open onClose={() => setMode(STILL)} label={`${title} webcam`} testid="cam-lightbox">
          {mode.m === 'live' ? (
            <div class="cam-box">{player()}</div>
          ) : (
            <Zoom def={shown} src={mode.src} title={title} />
          )}
        </Lightbox>
      ) : null}
    </figure>
  );
}
