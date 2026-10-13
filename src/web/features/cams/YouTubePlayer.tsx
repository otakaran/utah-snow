// YouTube live embed (spec §8.3). We render the iframe ourselves so its attributes are guaranteed; the IFrame API
// controller attaches afterwards. One YouTube player per page (playerManager); labels and the YouTube attribution
// sit under the player, never over it. A changed videoId reuses the player (loadVideoById, the wall's rotation).
// Player errors end the tile in "Stream restarting" and are reported to /api/cams/report.
import { useEffect, useRef, useState } from 'preact/hooks';
import { reportYtError } from '../../data/cams.ts';
import { claimPlayer } from '../../lib/player-manager.ts';
import { isInView, onPageVisibility, pageVisible, watchInView } from '../../lib/visibility.ts';
import { NOTE } from './notes.ts';
import { loadYtApi, type YtPlayer, ytEmbedUrl } from './yt-api.ts';

interface Props {
  camId: string;
  videoId: string;
  title: string;
  /** Show Rewind 1/3/6/9/12 h (detail page, DVR streams) once the stream holds at least an hour. */
  rewind: boolean;
  onEnd: (note: string | null) => void;
}

const REWIND_H = [1, 3, 6, 9, 12] as const;
const DURATION_POLL_MS = 15_000;

export function YouTubePlayer({ camId, videoId, title, rewind, onEnd }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef<YtPlayer | null>(null);
  const [src] = useState(() => ytEmbedUrl(videoId)); // the first ID only; later IDs go through loadVideoById
  const [hours, setHours] = useState(0);
  const end = useRef(onEnd);
  end.current = onEnd;
  const cam = useRef(camId); // the wall's featured cell changes cams on one player
  cam.current = camId;

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const lease = claimPlayer('youtube', (reason) => end.current(reason === 'idle' ? NOTE.idle : null));
    let alive = true;
    loadYtApi()
      .then((YT) => {
        if (!alive) return;
        player.current = new YT.Player(el, {
          events: {
            onError: (e) => {
              reportYtError(cam.current, e.data);
              end.current(NOTE.ytError);
            },
          },
        });
      })
      .catch(() => {}); // no controller: the embed still plays, only pause-on-hide and Rewind are lost
    const sync = () => {
      const p = player.current;
      if (!p || typeof p.playVideo !== 'function') return;
      if (pageVisible.peek() && isInView(el)) p.playVideo();
      else p.pauseVideo();
    };
    const unwatch = watchInView(el, sync);
    const unpage = onPageVisibility(sync);
    return () => {
      alive = false;
      unwatch();
      unpage();
      lease?.release();
      player.current?.destroy?.();
      player.current = null;
    };
  }, []);

  // The wall rotates its featured cell through live cams on one player.
  const firstId = useRef(videoId);
  useEffect(() => {
    if (videoId === firstId.current) return;
    firstId.current = videoId;
    player.current?.loadVideoById?.(videoId);
  }, [videoId]);

  useEffect(() => {
    if (!rewind) return;
    const poll = () => {
      const d = player.current?.getDuration?.() ?? 0;
      setHours(Number.isFinite(d) ? Math.floor(d / 3600) : 0);
    };
    const t = setInterval(poll, DURATION_POLL_MS);
    return () => clearInterval(t);
  }, [rewind]);

  const seekBack = (h: number) => {
    const p = player.current;
    const d = p?.getDuration?.() ?? 0;
    if (p && d >= h * 3600) p.seekTo(d - h * 3600, true);
  };

  return (
    <div class="cam-yt">
      <div class="cam-player">
        <iframe
          ref={frame}
          class="cam-iframe"
          src={src}
          title={`${title}, live on YouTube`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerpolicy="strict-origin-when-cross-origin"
        />
      </div>
      <p class="cam-yt-credit">
        Live on YouTube ·{' '}
        <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`} target="_blank" rel="noreferrer">
          Open on YouTube
        </a>
      </p>
      {rewind && hours >= 1 ? (
        <fieldset class="cam-rewind">
          <legend class="sr-only">Rewind the live stream</legend>
          {REWIND_H.filter((h) => h <= hours).map((h) => (
            <button key={h} type="button" class="btn" onClick={() => seekBack(h)}>
              −{h} h
            </button>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
