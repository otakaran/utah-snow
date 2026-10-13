// Still refresh for one tile (spec §8.3). The 5 s scheduler (lib/visibility.ts) runs it when due (refreshS), on
// screen and the page is visible (the wall skips both checks). A new picture is preloaded with `new Image()` and
// swapped in on load, so there is no flicker. A failed load keeps the last picture, marks the tile stale and backs
// off exponentially up to 10 min. Images are plain: no crossorigin, no fetch, no canvas, never a Referer.
import type { RefObject } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { CamDef } from '../../../shared/types.ts';
import type { CamApiState } from '../../data/cams.ts';
import { skewMs } from '../../data/snapshot.ts';
import { schedule } from '../../lib/visibility.ts';
import { stillUrl, type Variant } from './cam-view.ts';
import { KINDS } from './kinds/index.ts';

const MAX_BACKOFF_MS = 10 * 60_000;
/** Cam+variant pairs whose primary still turned out to be a placeholder (YouTube maxres): use the kind's altUrl. */
const useAlt = new Set<string>();

export interface StillOpts {
  def: CamDef;
  state: CamApiState | undefined;
  variant: Variant;
  el: RefObject<Element | null>;
  /** Refresh by itself (false in data saver, except the stake row). */
  auto: boolean;
  /** Seconds between refreshes (the cam's refreshS unless the caller overrides it). */
  everyS: number;
  /** Skip the on-screen and page-visible checks (the wall). */
  always: boolean;
  /** Show this archived frame instead of the provider's still (wall Alta Collins). */
  frame?: string | null;
  /** Wait for load() before the first request (heavy GIFs in data saver). */
  deferred: boolean;
}

export interface Still {
  src: string | null;
  /** Server-clock ms of the last picture that loaded. */
  loadedAt: number | null;
  /** The last request failed; the previous picture (if any) stays. */
  failed: boolean;
  /** The current src never loaded: show the empty plate instead of a broken image. */
  broken: boolean;
  onLoad: (e: Event) => void;
  onError: () => void;
  /** Request a fresh picture now (taps, data saver). */
  refresh: () => void;
}

const serverMs = (): number => Date.now() + skewMs.peek();

export function useStill(o: StillOpts): Still {
  const key = `${o.def.id}:${o.variant}`;
  const kind = KINDS[o.def.kind];
  const urlAt = (now: number): string | null => {
    if (o.frame) return o.frame;
    const url = stillUrl(o.def, o.state, o.variant, now);
    return url && useAlt.has(key) ? (kind.altUrl?.(url) ?? url) : url;
  };
  const [src, setSrc] = useState<string | null>(() => (o.deferred ? null : urlAt(Date.now())));
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [broken, setBroken] = useState(false);
  const srcRef = useRef(src);
  srcRef.current = src;
  const fails = useRef(0);
  const lastTry = useRef(Date.now());
  const pending = useRef<HTMLImageElement | null>(null);
  const latest = useRef(urlAt);
  latest.current = urlAt;

  const accept = useCallback(
    (img: HTMLImageElement, url: string): boolean => {
      const alt = kind.isPlaceholder?.(img) ? kind.altUrl?.(url) : null;
      if (alt && alt !== url) {
        useAlt.add(key);
        setSrc(alt);
        return false;
      }
      fails.current = 0;
      setFailed(false);
      setBroken(false);
      setLoadedAt(serverMs());
      return true;
    },
    [key, kind],
  );

  const refresh = useCallback(() => {
    const now = Date.now();
    lastTry.current = now;
    const url = latest.current(now);
    if (!url || url === srcRef.current) return;
    if (!srcRef.current) {
      setSrc(url); // nothing on screen yet: load in place
      return;
    }
    if (pending.current) pending.current.onload = pending.current.onerror = null;
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      pending.current = null;
      if (accept(img, url)) setSrc(url);
    };
    img.onerror = () => {
      pending.current = null;
      fails.current += 1;
      setFailed(true);
    };
    pending.current = img;
    img.src = url;
  }, [accept]);

  // A different cam, variant, frame or live source (new video ID, new HDRelay host): fetch its picture now.
  const liveKey = o.state?.live ? JSON.stringify(o.state.live) : '';
  useEffect(() => {
    if (o.deferred && !srcRef.current) return;
    if (latest.current(Date.now())) refresh();
    else setSrc(null); // this cam has no picture: never keep another cam's
  }, [key, o.frame, liveKey, o.deferred]);

  useEffect(() => {
    if (!o.auto) return;
    const period = o.everyS * 1000;
    return schedule({
      el: o.el.current,
      always: o.always,
      dueAt: () =>
        o.deferred && !srcRef.current
          ? Number.POSITIVE_INFINITY
          : lastTry.current + Math.min(period * 2 ** fails.current, Math.max(period, MAX_BACKOFF_MS)),
      run: refresh,
    });
  }, [o.auto, o.always, o.everyS, o.el, o.deferred, refresh]);

  useEffect(
    () => () => {
      if (pending.current) pending.current.onload = pending.current.onerror = null;
    },
    [],
  );

  const onLoad = (e: Event) => {
    const img = e.currentTarget as HTMLImageElement;
    if (srcRef.current) accept(img, srcRef.current);
  };
  const onError = () => {
    fails.current += 1;
    setFailed(true);
    setBroken(true);
  };
  return { src, loadedAt, failed, broken, onLoad, onError, refresh };
}
