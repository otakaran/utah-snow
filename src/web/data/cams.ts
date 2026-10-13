// Cam status store (spec §7 GET /api/cams): status, asOf and resolved live sources per cam, polled every 60 s
// while visible (the response is public max-age=60). Starts lazily on the first ensureCams() call from a cam view.
// Until the first answer, or while it fails, tiles render from config/cams alone (an error keeps the last good
// states). Also sends YouTube player errors to POST /api/cams/report (one per cam per 10 min).
import { signal } from '@preact/signals';
import type { CamState, YtUnmapped } from '../../shared/types.ts';

/** One /api/cams entry; archive cams also carry their newest KV frame. */
export interface CamApiState extends CamState {
  latestFrame?: string;
}
export interface CamsPayload {
  generatedAt: string;
  cams: CamApiState[];
  unmapped: YtUnmapped[];
}
export type CamsApiStatus = 'idle' | 'ok' | 'error';

const PERIOD_MS = 60_000;
const TICK_MS = 15_000;
const REPORT_GAP_MS = 10 * 60_000;
export const YT_REPORT_CODES: ReadonlySet<number> = new Set([2, 5, 100, 101, 150, 153]);

export const camStates = signal<ReadonlyMap<string, CamApiState>>(new Map());
export const camsStatus = signal<CamsApiStatus>('idle');
export const camsGeneratedAt = signal<string | null>(null);
export const unmappedVideos = signal<readonly YtUnmapped[]>([]);

let started = false;
let inflight = false;
let lastAt = 0;
const reportedAt = new Map<string, number>();

function isPayload(body: unknown): body is CamsPayload {
  return typeof body === 'object' && body !== null && Array.isArray((body as CamsPayload).cams);
}

async function refresh(): Promise<void> {
  if (inflight) return;
  inflight = true;
  lastAt = Date.now();
  try {
    // Default cache mode: the response is public max-age=60. Its Date header can be that old, so it never feeds the
    // server clock (snapshot/health do).
    const res = await fetch('/api/cams');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!isPayload(body)) throw new Error('unexpected payload');
    const map = new Map<string, CamApiState>();
    for (const c of body.cams) if (typeof c?.id === 'string') map.set(c.id, c);
    camStates.value = map;
    camsGeneratedAt.value = typeof body.generatedAt === 'string' ? body.generatedAt : null;
    unmappedVideos.value = Array.isArray(body.unmapped) ? body.unmapped : [];
    camsStatus.value = 'ok';
  } catch {
    camsStatus.value = 'error'; // keep the last good states; tiles fall back to config where they have none
  } finally {
    inflight = false;
  }
}

const visible = () => document.visibilityState === 'visible';
const due = () => visible() && Date.now() - lastAt >= PERIOD_MS;

/** Starts polling /api/cams once; every cam view calls it on mount. */
export function ensureCams(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  setInterval(() => {
    if (due()) void refresh();
  }, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (due()) void refresh();
  });
  void refresh();
}

/** Tells the Worker a YouTube embed failed (spec §8.3), at most once per cam per 10 min. Fire and forget. */
export function reportYtError(camId: string, code: number): void {
  if (!YT_REPORT_CODES.has(code)) return;
  const now = Date.now();
  if (now - (reportedAt.get(camId) ?? 0) < REPORT_GAP_MS) return;
  reportedAt.set(camId, now);
  void fetch('/api/cams/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'utahsnow' },
    body: JSON.stringify({ camId, code }),
    keepalive: true,
  })
    .then((res) => res.body?.cancel())
    .catch(() => {});
}
