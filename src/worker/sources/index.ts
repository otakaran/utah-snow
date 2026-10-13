// Source registry: the only file that imports adapters (spec §5.2). Add an adapter here, then place its job in
// config/schedule.ts. Unregistered job ids in the slot table are skipped by the dispatcher.
import { PROBE_SEED } from './probe-seed.ts';
import type { Source } from './types.ts';

export const SOURCES: readonly Source[] = [];

// staleAfterMin per row id (§5.4) for rows whose adapter is not registered yet (seeded or legacy rows).
// Registered adapters' own staleAfterMin wins. Delete entries as adapters land.
const STALE_FALLBACK: readonly [prefix: string, min: number][] = [
  ['resort:', 40],
  ['alta:weather', 120],
  ['roads:', 25],
  ['nws:afd', 720],
  ['nws:alerts', 60],
  ['nws:', 180],
  ['obs', 90],
  ['avy:uac', 180],
  ['snotel', 180],
  ['yt:state', 45],
  ['cams:status', 120],
  ['hdrelay:config', 2880],
];
const DEFAULT_STALE_MIN = 60;

/** The registered source that writes this row, if any. */
export function sourceOfRow(rowId: string, sources: readonly Source[] = SOURCES): Source | undefined {
  return sources.find((s) => s.rows.includes(rowId));
}

export function staleAfterMin(rowId: string, sources: readonly Source[] = SOURCES): number {
  const src = sourceOfRow(rowId, sources);
  if (src) return src.staleAfterMin;
  return STALE_FALLBACK.find(([p]) => rowId.startsWith(p))?.[1] ?? DEFAULT_STALE_MIN;
}

/** Probe allowlist: adapters' probes plus the seed, unique by hostId (adapter entries first). */
export function probeList(sources: readonly Source[] = SOURCES): { hostId: string; url: string }[] {
  const seen = new Map<string, string>();
  for (const p of [...sources.flatMap((s) => s.probes), ...PROBE_SEED]) {
    if (!seen.has(p.hostId)) seen.set(p.hostId, p.url);
  }
  return [...seen].map(([hostId, url]) => ({ hostId, url }));
}
