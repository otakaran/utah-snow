// Snapshot store (spec §8.8): polls /api/snapshot with cache:'no-cache' so the browser revalidates via
// If-None-Match; an unchanged ETag skips parsing. Polls only while visible, plus once on focus.
// X-Build feeds the redeploy guard. Also owns the server clock: skew = response Date header - local time, and
// serverNow = Date.now() + skew.
import { signal } from '@preact/signals';
import { isoToMs } from '../../shared/time.ts';
import type { Snapshot } from '../../shared/types.ts';
import { noteBuildHeader } from '../lib/build-guard.ts';

const CACHE_KEY = 'utahsnow.snap';
const TICK_MS = 15_000;
const FOCUS_GAP_MS = 10_000;

export const snapshot = signal<Snapshot | null>(readCache());
export const snapshotError = signal<string | null>(null); // HTTP or payload problem; data may still be cached
export const offline = signal(false); // last fetch failed at the network level
export const skewMs = signal(0);
export const serverNow = signal(Date.now());

let etag: string | null = null;
let lastAt = 0;
let inflight = false;

function readCache(): Snapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Snapshot) : null;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(snap: Snapshot): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    // Quota or private mode: first paint just waits for the network.
  }
}

/** Updates the server clock from a response's Date header. Every API store calls this. */
export function noteServerDate(res: Response): void {
  const server = isoToMs(res.headers.get('Date'));
  if (server !== null) skewMs.value = server - Date.now();
  tickNow();
}

function tickNow(): void {
  serverNow.value = Date.now() + skewMs.value;
}

async function refresh(): Promise<void> {
  if (inflight) return;
  inflight = true;
  lastAt = Date.now();
  let res: Response;
  try {
    res = await fetch('/api/snapshot', { cache: 'no-cache' });
  } catch {
    offline.value = true;
    inflight = false;
    return;
  }
  offline.value = false;
  try {
    noteServerDate(res);
    noteBuildHeader(res); // X-Build differs after a redeploy: reload rules in build-guard.ts
    if (!res.ok) {
      snapshotError.value = `HTTP ${res.status}`;
      return;
    }
    const tag = res.headers.get('ETag');
    if (tag && tag === etag && snapshot.value) {
      void res.body?.cancel();
      snapshotError.value = null;
      return;
    }
    const body = (await res.json()) as Snapshot;
    if (body?.v !== 1) throw new Error('unexpected payload');
    etag = tag;
    snapshot.value = body;
    snapshotError.value = null;
    writeCache(body);
  } catch (err) {
    snapshotError.value = err instanceof Error ? err.message : 'bad snapshot';
  } finally {
    inflight = false;
  }
}

const visible = () => document.visibilityState === 'visible';

/** Starts polling; `periodMs` is read on every tick (120 s, or 60 s on the wall). Call once. */
export function startSnapshot(periodMs: () => number): void {
  const soon = () => {
    if (visible() && Date.now() - lastAt >= FOCUS_GAP_MS) void refresh();
  };
  setInterval(() => {
    tickNow();
    if (visible() && Date.now() - lastAt >= periodMs()) void refresh();
  }, TICK_MS);
  document.addEventListener('visibilitychange', soon);
  addEventListener('focus', soon);
  void refresh();
}
