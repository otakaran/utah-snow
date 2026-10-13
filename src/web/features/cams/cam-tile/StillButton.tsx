// The tile's tap target (split from ../CamTile.tsx): the still as a plain <img> (no crossorigin; UDOT, Alta, Ski Utah
// and Snowbasin hosts send no ACAO), an empty plate while nothing loaded, and the "▶ Watch live" hint when a tap plays.
import { Icon } from '../../../ui/Icon.tsx';
import { NOTE } from '../notes.ts';
import type { Still } from '../use-still.ts';

interface Props {
  title: string;
  age: string;
  still: Still;
  playable: boolean;
  /** Data saver holds a heavy still until the first tap. */
  deferred: boolean;
  eager: boolean;
  hint: string | null;
  onTap: () => void;
}

export function StillButton({ title, age, still, playable, deferred, eager, hint, onTap }: Props) {
  return (
    <button
      type="button"
      class="cam-hit"
      onClick={onTap}
      aria-label={playable ? `Play ${title} live` : `Enlarge ${title}`}
    >
      {still.src && !still.broken ? (
        <img
          class="cam-img"
          src={still.src}
          alt={`${title} webcam, ${age}`}
          decoding="async"
          loading={eager ? 'eager' : 'lazy'}
          referrerpolicy="no-referrer"
          onLoad={still.onLoad}
          onError={still.onError}
        />
      ) : (
        <span class="cam-empty">{deferred && !still.src ? NOTE.tapToLoad : still.broken ? 'No picture' : ''}</span>
      )}
      {hint ? (
        <span class="cam-play">
          <Icon name="play" size={14} />
          {hint}
        </span>
      ) : null}
    </button>
  );
}
