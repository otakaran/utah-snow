// Redeploy recovery (spec §8.4 "Unattended reliability"). A redeploy deletes old hashed chunks and changes the
// Worker's build id, so a long-lived tab either fails a lazy import() or runs stale code against a new API.
// - Build check: noteBuild(serverBuild) with the X-Build header or /api/health `version`. On the wall: reload at
//   once. Elsewhere: reload on the next visibilitychange -> visible. Skipped when either side is 'dev'.
// - Chunk-load failure: importWithReload() and the `vite:preloadError` event each trigger one guarded reload.
// - Guard: at most one reload per 10 min (sessionStorage utahsnow.reloadAt), so a bad deploy cannot loop.
// - keepAwake(): the screen wake lock for the wall, re-requested whenever the page becomes visible again.
import { route } from '../router.ts';

declare const __BUILD_ID__: string; // injected by vite.config.ts `define`

const CLIENT_BUILD: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'; // 'dev' under Vitest
const RELOAD_KEY = 'utahsnow.reloadAt';
const GUARD_MS = 10 * 60_000;

let pending = false; // a newer build exists; reload when the user comes back to the tab

/** Reloads unless a guarded reload already happened in the last 10 min (or storage is unavailable). */
export function reloadOnce(): boolean {
  const now = Date.now();
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false; // without the guard a broken deploy could reload forever
  }
  location.reload();
  return true;
}

/** Compares a server build id with this bundle's; reloads now on the wall, else when the tab is next shown. */
export function noteBuild(serverBuild: string | null | undefined): void {
  if (!serverBuild || serverBuild === 'dev' || CLIENT_BUILD === 'dev' || serverBuild === CLIENT_BUILD) return;
  if (route.peek().name === 'wall') reloadOnce();
  else pending = true;
}

/** noteBuild() for any /api response (the Worker sets X-Build on every one). */
export const noteBuildHeader = (res: Response): void => noteBuild(res.headers.get('X-Build'));

const isChunkError = (err: unknown): boolean =>
  err instanceof TypeError ||
  (err instanceof Error &&
    (err.name === 'ChunkLoadError' || /dynamically imported module|Importing a module/i.test(err.message)));

/** Wraps a lazy import(): a missing chunk (old build) triggers one guarded reload, then the error rethrows. */
export async function importWithReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (isChunkError(err)) reloadOnce();
    throw err;
  }
}

/** Installs the chunk-error and deferred-reload listeners. Call once from main.tsx. */
export function startBuildGuard(): void {
  addEventListener('vite:preloadError', (e) => {
    if (reloadOnce()) e.preventDefault(); // handled: Vite does not rethrow
  });
  document.addEventListener('visibilitychange', () => {
    if (pending && document.visibilityState === 'visible') reloadOnce();
  });
}

/** Holds a screen wake lock while visible (the wall). Returns a stop function. No-op where unsupported. */
export function keepAwake(): () => void {
  let active = true;
  let lock: WakeLockSentinel | null = null;
  const request = async () => {
    if (!active || lock || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        lock = null;
        void request(); // released by the system while visible (e.g. battery saver ended): ask again
      });
    } catch {
      lock = null; // denied (not visible, policy, low battery): retried on the next visibilitychange
    }
  };
  const onVisible = () => void request();
  document.addEventListener('visibilitychange', onVisible);
  void request();
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release();
    lock = null;
  };
}
