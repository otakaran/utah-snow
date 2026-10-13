// HDRelay live video (spec §8.3): <video muted playsinline autoplay>, driven by HlsSession. Holds a playerManager
// lease (HLS caps), pauses while hidden or offscreen, and hands the tile a note when it stops on its own.
import { useEffect, useRef, useState } from 'preact/hooks';
import { claimPlayer } from '../../lib/player-manager.ts';
import { isInView, onPageVisibility, pageVisible, watchInView } from '../../lib/visibility.ts';
import { HlsSession, type HlsState } from './hls-session.ts';
import { NOTE } from './notes.ts';

interface Props {
  url: string;
  title: string;
  poster: string | null;
  /** Retry forever (the wall); elsewhere give up after 3 attempts. */
  unlimited: boolean;
  /** The player stopped by itself; `note` explains why (null = evicted by a newer player). */
  onEnd: (note: string | null) => void;
}

const STATE_TEXT: Partial<Record<HlsState, string>> = { loading: 'Connecting…', retrying: 'Reconnecting…' };

export function HlsPlayer({ url, title, poster, unlimited, onEnd }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<HlsState>('loading');
  const end = useRef(onEnd);
  end.current = onEnd;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const lease = claimPlayer('hls', (reason) => end.current(reason === 'idle' ? NOTE.idle : null));
    if (!lease) {
      end.current(null);
      return;
    }
    const session = new HlsSession(video, url, unlimited, (s) => {
      setState(s);
      if (s === 'failed') end.current(NOTE.liveFailed);
      if (s === 'unsupported') end.current(NOTE.unsupported);
    });
    void session.start();
    const sync = () => (pageVisible.peek() && isInView(video) ? session.resume() : session.pause());
    const unwatch = watchInView(video, sync);
    const unpage = onPageVisibility(sync);
    return () => {
      unwatch();
      unpage();
      session.destroy();
      lease.release();
    };
  }, [url, unlimited]);

  const text = STATE_TEXT[state];
  return (
    <div class="cam-player">
      <video
        ref={ref}
        class="cam-video"
        muted
        playsInline
        autoplay
        poster={poster ?? undefined}
        aria-label={`${title}, live video`}
      />
      {text ? (
        <span class="cam-player-state" role="status">
          {text}
        </span>
      ) : null}
    </div>
  );
}
