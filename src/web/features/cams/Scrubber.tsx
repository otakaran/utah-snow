// Timelapse scrubber (spec §6.3, §8.3), shown in the cam Lightbox: GET /api/stake/{camId}/frames for the last 24 h
// (step 15 on phones and in data saver), starting at the newest frame. Keyboard ← → Home End (the slider takes the
// focus) or drag. Only the current frame plus a 3-frame lookahead in the travel direction load, as thumbs; the full
// frame replaces the thumb once the scrubber rests (not in data saver). A frame whose image fails is skipped (Roundshot
// slots are never pre-checked). Markers (Alta clears, Last snow) sit on the track; Prism adds an MP4 button.
// Frames are plain <img> / new Image(): never fetch(), canvas or crossorigin.
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatClockRel } from '../../../shared/time.ts';
import type { StakeFramesBody, TimelapseFrame } from '../../../shared/types.ts';
import { serverNow } from '../../data/snapshot.ts';
import { dataSaverOn } from '../../lib/data-saver.ts';
import { isPhone } from '../../lib/player-manager.ts';
import { framesUrl, isFramesBody, keyMove, lookahead, markerSpot, scrubStep, stepIndex } from './scrubber.ts';

type Load = { s: 'loading' } | { s: 'ok'; body: StakeFramesBody } | { s: 'none' } | { s: 'error' };
type Dir = 1 | -1;

const REST_MS = 500;
const KEEP = 12; // preloaded images kept around the current frame
const THUMB_PX = 16; // the native slider thumb: its centre runs from 8 px to width − 8 px

function useFrames(camId: string, step: 5 | 15): Load {
  const [load, setLoad] = useState<Load>({ s: 'loading' });
  useEffect(() => {
    let current = true;
    setLoad({ s: 'loading' });
    fetch(framesUrl(camId, step))
      .then(async (res): Promise<Load> => {
        if (res.status === 404) {
          void res.body?.cancel();
          return { s: 'none' };
        }
        const body: unknown = res.ok ? await res.json() : null;
        return isFramesBody(body) ? { s: 'ok', body } : { s: 'error' };
      })
      .catch((): Load => ({ s: 'error' }))
      .then((l) => {
        if (current) setLoad(l);
      });
    return () => {
      current = false;
    };
  }, [camId, step]);
  return load;
}

/**
 * The full-size frame once `frame` has been shown for REST_MS and the full image has loaded, else null. The loaded
 * URL is returned only while it is still this frame's, so a new frame never shows the previous full for a render.
 */
function useRestingFull(frame: TimelapseFrame | undefined, enabled: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const full = frame && enabled && frame.full !== frame.thumb ? frame.full : null;
  useEffect(() => {
    if (!full) return;
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = () => setSrc(full);
      img.src = full;
    }, REST_MS);
    return () => {
      clearTimeout(timer);
      img.onload = null;
    };
  }, [full]);
  return src === full ? src : null;
}

export function Scrubber({ camId, title }: { camId: string; title: string }) {
  const step = scrubStep(isPhone(), dataSaverOn.value);
  const load = useFrames(camId, step);
  if (load.s !== 'ok' || load.body.frames.length === 0) {
    const text = {
      loading: 'Loading timelapse…',
      ok: 'No frames in the last 24 hours.',
      none: 'No timelapse for this cam right now.',
      error: 'Timelapse unavailable – try again later.',
    }[load.s];
    return (
      <p class="scrub-state" data-testid="scrubber-state">
        {text}
      </p>
    );
  }
  return <Frames key={`${camId}:${step}`} body={load.body} title={title} step={step} />;
}

function Frames({ body, title, step }: { body: StakeFramesBody; title: string; step: 5 | 15 }) {
  const { frames } = body;
  const n = frames.length;
  const [i, setI] = useState(n - 1);
  const [dir, setDir] = useState<Dir>(-1); // the list opens on the newest frame, so scrubbing starts backwards
  const [bad, setBad] = useState<ReadonlySet<number>>(new Set());
  const [video, setVideo] = useState(false);
  const range = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<number, HTMLImageElement>());
  const now = serverNow.value;
  const frame = frames[i];
  const full = useRestingFull(frame, !dataSaverOn.value);
  const ahead = lookahead(i, dir, n, bad);

  const markBad = (j: number) => setBad((b) => new Set(b).add(j));
  const go = (to: number, d: Dir) => {
    setDir(d);
    setI(to);
  };

  useEffect(() => range.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const kept = cache.current;
    for (const j of ahead) {
      const f = frames[j];
      if (!f || kept.has(j)) continue;
      const img = new Image();
      img.decoding = 'async';
      img.onerror = () => markBad(j);
      img.src = f.thumb;
      kept.set(j, img);
    }
    for (const j of kept.keys()) if (Math.abs(j - i) > KEEP) kept.delete(j);
  }, [ahead.join(','), frames, i]);

  const onKey = (e: KeyboardEvent) => {
    if (video) return; // the MP4 player's own controls use the arrow keys
    const move = keyMove(e.key, i, n, bad);
    if (!move) return;
    e.preventDefault(); // the slider would move too
    go(move.i, move.dir);
  };
  const onFail = () => {
    const broken = new Set(bad).add(i);
    setBad(broken);
    const next = stepIndex(i, dir, n, broken) ?? stepIndex(i, dir === 1 ? -1 : 1, n, broken);
    if (next !== null) setI(next);
  };

  const when = frame ? formatClockRel(frame.t, now) : '';
  const mp4 = body.mp4;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys bubble here from the slider and the buttons.
    <div class="scrub" data-testid="scrubber" data-count={n} data-index={i} onKeyDown={onKey}>
      <div class="scrub-view">
        {video && mp4 ? (
          <video class="scrub-video" src={mp4.url} controls autoplay muted playsinline />
        ) : frame && !bad.has(i) ? (
          <img
            class="scrub-img"
            src={full ?? frame.thumb}
            alt={`${title} at ${when}`}
            decoding="async"
            referrerpolicy="no-referrer"
            onError={onFail}
          />
        ) : (
          <p class="scrub-state">No picture for this time.</p>
        )}
      </div>
      <div class="scrub-track">
        <input
          ref={range}
          type="range"
          class="scrub-range"
          min={0}
          max={n - 1}
          step={1}
          value={i}
          aria-label="Timelapse frame"
          aria-valuetext={when}
          onInput={(e) => {
            const to = Number((e.currentTarget as HTMLInputElement).value);
            go(to, to < i ? -1 : 1);
          }}
        />
        {body.markers.map((m) => {
          const spot = markerSpot(frames, m.t);
          return spot ? (
            <button
              key={`${m.kind}:${m.t}`}
              type="button"
              class={`scrub-mark scrub-${m.kind}`}
              style={{ left: `calc(${spot.pct / 100} * (100% - ${THUMB_PX}px) + ${THUMB_PX / 2}px)` }}
              title={m.label}
              aria-label={m.label}
              onClick={() => go(spot.i, spot.i < i ? -1 : 1)}
            />
          ) : null;
        })}
      </div>
      <p class="scrub-meta">
        <b class="scrub-when">{when}</b>
        <span>
          Frame {i + 1} of {n} · every {step} min
        </span>
        {mp4 ? (
          <button type="button" class="btn scrub-mp4" onClick={() => setVideo(!video)}>
            {video ? 'Back to frames' : `MP4 · ${formatClockRel(mp4.from, now)} – ${formatClockRel(mp4.to, now)}`}
          </button>
        ) : null}
      </p>
    </div>
  );
}
