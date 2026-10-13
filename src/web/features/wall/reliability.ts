// Wall-only unattended reliability and kiosk mode (spec §8.4). X-Build reloads and chunk-error recovery live in
// lib/build-guard.ts for every route; this adds:
// - the daily reload: every tick, reload once localDate(now) !== the boot date and localHM(now) >= 03:30 (checking
//   on every tick survives device sleep), through the same 10-min reload guard;
// - the screen wake lock (keepAwake) while the wall is mounted;
// - kiosk: the cursor hides after 3 s idle, ←/→ page through the sets, Space pauses rotation, F toggles fullscreen.
import { useEffect, useRef, useState } from 'preact/hooks';
import { WALL_RELOAD_HM } from '../../../../config/wall.ts';
import { localDate, localHM } from '../../../shared/time.ts';
import { skewMs } from '../../data/snapshot.ts';
import { keepAwake, reloadOnce } from '../../lib/build-guard.ts';

const TICK_MS = 30_000;
const IDLE_MS = 3000;

const serverMs = (): number => Date.now() + skewMs.peek();

/** True once the wall has lived past 03:30 on a later local day than it booted. */
export const dailyReloadDue = (nowMs: number, bootDate: string): boolean =>
  localDate(nowMs) !== bootDate && localHM(nowMs) >= WALL_RELOAD_HM;

/** Wake lock plus the daily-reload tick, for as long as the wall is mounted. */
export function useWallReliability(): void {
  useEffect(() => {
    const bootDate = localDate(serverMs());
    const release = keepAwake();
    const timer = setInterval(() => {
      if (bootDate && dailyReloadDue(serverMs(), bootDate)) reloadOnce();
    }, TICK_MS);
    return () => {
      clearInterval(timer);
      release();
    };
  }, []);
}

export interface KioskKeys {
  /** ← (-1) / → (+1). */
  page: (dir: 1 | -1) => void;
  /** Space. */
  togglePause: () => void;
}

export interface Kiosk {
  /** No pointer movement for 3 s: the cursor and the kiosk controls hide. */
  idle: boolean;
  fullscreen: boolean;
  toggleFullscreen: () => void;
}

function toggleFullscreen(): void {
  const done = document.fullscreenElement
    ? document.exitFullscreen?.()
    : document.documentElement.requestFullscreen?.();
  done?.catch(() => {}); // refused (no user gesture, kiosk policy): nothing to do
}

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName));

/** Kiosk behavior for the wall: idle cursor, fullscreen state and the keyboard shortcuts. */
export function useKiosk(keys: KioskKeys): Kiosk {
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const handlers = useRef(keys);
  handlers.current = keys;

  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') handlers.current.page(e.key === 'ArrowLeft' ? -1 : 1);
      else if (e.key === ' ') handlers.current.togglePause();
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else return;
      e.preventDefault();
    };
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('pointermove', wake, { passive: true });
    document.addEventListener('pointerdown', wake, { passive: true });
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointermove', wake);
      document.removeEventListener('pointerdown', wake);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  return { idle, fullscreen, toggleFullscreen };
}
