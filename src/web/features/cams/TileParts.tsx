// Presentational pieces of a cam tile: the caption (★ for the pick resort, resort and cam name, age, Timelapse and
// Stop live actions), the status plate (shape + word + color, never color alone), the player switch for a tile's
// live source and the zoomed still.
import type { ComponentChildren } from 'preact';
import type { CamDef } from '../../../shared/types.ts';
import { StatusChip } from '../../ui/StatusChip.tsx';
import type { LiveSource, TileStatus } from './cam-view.ts';
import { HlsPlayer } from './HlsPlayer.tsx';
import { Roundshot360 } from './Roundshot360.tsx';
import { YouTubePlayer } from './YouTubePlayer.tsx';

interface CaptionProps {
  star: boolean;
  resort: string | null;
  name: string;
  age: string;
  note: string | null;
  extra?: ComponentChildren;
  /** A Stop button while live video plays in the tile. */
  onStop?: (() => void) | null;
  /** A Timelapse button while the cam has a scrubbable list (opens the Scrubber). */
  onTimelapse?: (() => void) | null;
}

export function Caption({ star, resort, name, age, note, extra, onStop, onTimelapse }: CaptionProps) {
  return (
    <figcaption class="cam-cap">
      <span class="cam-title">
        {star ? (
          <span class="cam-star" title="Today's pick resort">
            <span aria-hidden="true">★</span>
            <span class="sr-only">Today's pick: </span>
          </span>
        ) : null}
        {resort ? <b class="cam-resort">{resort} </b> : null}
        {name}
      </span>
      <span class="cam-age">{age}</span>
      {note ? <span class="cam-note">{note}</span> : null}
      {extra ? <span class="cam-extra">{extra}</span> : null}
      {onTimelapse ? (
        <button type="button" class="btn cam-tl" onClick={onTimelapse} aria-label={`Timelapse of ${name}`}>
          Timelapse
        </button>
      ) : null}
      {onStop ? (
        <button type="button" class="btn cam-stop" onClick={onStop}>
          Stop live
        </button>
      ) : null}
    </figcaption>
  );
}

/** The status plate in the tile's top corner; 'ok' and 'unknown' show none. */
export function StatusPlate({ status }: { status: TileStatus | null }) {
  switch (status) {
    case 'live':
      return (
        <span class="cam-plate cam-live">
          <i class="glyph glyph-ok" aria-hidden="true" />
          Live
        </span>
      );
    case 'stale':
      return (
        <span class="cam-plate">
          <StatusChip tone="off" word="Stale" />
        </span>
      );
    case 'offline':
      return (
        <span class="cam-plate">
          <StatusChip tone="bad" word="Offline" />
        </span>
      );
    case 'off':
      return (
        <span class="cam-plate">
          <StatusChip tone="off" word="Off-season" />
        </span>
      );
    default:
      return null;
  }
}

interface PlayerProps {
  source: LiveSource;
  camId: string;
  title: string;
  poster: string | null;
  unlimited: boolean;
  rewind: boolean;
  onEnd: (note: string | null) => void;
}

export function LivePlayer({ source, camId, title, poster, unlimited, rewind, onEnd }: PlayerProps) {
  switch (source.type) {
    case 'hls':
      return <HlsPlayer url={source.url} title={title} poster={poster} unlimited={unlimited} onEnd={onEnd} />;
    case 'youtube':
      return (
        <YouTubePlayer key={camId} camId={camId} videoId={source.videoId} title={title} rewind={rewind} onEnd={onEnd} />
      );
    case 'iframe':
      return <Roundshot360 url={source.url} title={title} />;
  }
}

/** The enlarged still in the Lightbox, with the provider credit and a link to its page. */
export function Zoom({ def, src, title }: { def: CamDef; src: string | null; title: string }) {
  return (
    <div class="cam-zoom">
      {src ? (
        <img class="cam-zoom-img" src={src} alt={`${title} webcam`} decoding="async" referrerpolicy="no-referrer" />
      ) : null}
      <p class="cam-credit">
        © {def.credit} ·{' '}
        <a href={def.pageUrl} target="_blank" rel="noreferrer">
          Source page
        </a>
      </p>
    </div>
  );
}
