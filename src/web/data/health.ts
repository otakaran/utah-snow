// Health store: GET /api/health once per minute while visible (spec §7 shape; only the fields the UI reads).
// Also derives the source list and the global freshness badge shown in the header (§8.1).
import { computed, signal } from '@preact/signals';
import { type Badge, badge, isCritical } from '../../shared/freshness.ts';
import type { Meta, SourceStatus } from '../../shared/types.ts';
import { noteServerDate, serverNow, snapshot } from './snapshot.ts';

declare const __BUILD_ID__: string; // injected by vite.config.ts `define`

export const CLIENT_BUILD = __BUILD_ID__;
const PERIOD_MS = 60_000;

export interface HealthSource {
  id: string;
  status: SourceStatus;
  okAt: string | null;
  ageMin: number | null;
  staleAfterMin: number;
  failCount: number;
  error?: string | null;
  cpuSuspect?: boolean;
}

export interface Health {
  ok: boolean;
  version: string;
  generatedAt: string | null;
  cron?: { lastTickAt?: string | null; lastSlot?: string | null };
  sources?: HealthSource[];
}

export const health = signal<Health | null>(null);
export const healthError = signal<string | null>(null);

function toMeta(s: HealthSource): Meta {
  const meta: Meta = {
    source: s.id,
    fetchedAt: null,
    okAt: s.okAt,
    asOf: null,
    status: s.status,
    failCount: s.failCount,
    staleAfterMin: s.staleAfterMin,
  };
  if (s.error) meta.error = s.error;
  return meta;
}

/** Every source's meta: from the snapshot when it has them, else from /api/health. */
export const sources = computed<Meta[]>(() => {
  const fromSnap = snapshot.value?.sources;
  if (fromSnap && fromSnap.length > 0) return fromSnap;
  return (health.value?.sources ?? []).map(toMeta);
});

const RANK: Record<Badge, number> = { grey: 0, green: 1, amber: 2, red: 3 };

/** Worst badge among the critical sources, or null before any source is known. */
export const globalBadge = computed<Badge | null>(() => {
  const now = serverNow.value;
  let worst: Badge | null = null;
  for (const m of sources.value) {
    if (!isCritical(m.source, m.status)) continue;
    const b = badge(m, now);
    if (worst === null || RANK[b] > RANK[worst]) worst = b;
  }
  return worst;
});

async function refresh(): Promise<void> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    noteServerDate(res);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Health;
    if (typeof body?.ok !== 'boolean') throw new Error('unexpected payload');
    health.value = body;
    healthError.value = null;
  } catch (err) {
    healthError.value = err instanceof Error ? err.message : 'unavailable';
  }
}

/** Starts the once-a-minute poll (skipped while hidden, refreshed on return). Call once. */
export function startHealth(): void {
  setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, PERIOD_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  void refresh();
}
